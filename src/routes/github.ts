import { and, eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { json } from "../http/helpers";
import { getGitHubAccessToken, hasRepoScope } from "../lib/githubAccess";
import { decodeGitHubFileContent, type GitHubContentFile } from "../lib/githubContentDecode";
import {
  computeRepoLocsFromZipBuffer,
  fetchGitHubRepoZipball,
  getCachedRepoLocs,
  getRepoLocsCacheKey,
  setCachedRepoLocs
} from "../lib/githubRepoLocs";
import { encodeGitHubContentPath, joinRepoContentPath } from "../lib/repoFrameworkHints";
import { inferMergedRepoHintsFromScanFiles, REPO_HINT_SCAN_FILES } from "../lib/repoScanInference";

type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
  updatedAt: string | null;
  defaultBranch: string;
};

type GitHubRepoApiRow = {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  private: boolean;
  description: string | null;
  updated_at: string | null;
  default_branch?: string | null;
};

const USER_REPOS_PER_PAGE = 100;
const USER_REPOS_MAX_PAGES = 100;

const mapRepoRow = (repo: GitHubRepoApiRow): GitHubRepo => {
  const db = repo.default_branch?.trim();
  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    htmlUrl: repo.html_url,
    private: repo.private,
    description: repo.description ?? null,
    updatedAt: repo.updated_at ?? null,
    defaultBranch: db && db.length > 0 ? db : "main"
  };
};

export const listRepos = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;
  const [account] = await db
    .select({
      id: schema.accounts.id,
      scope: schema.accounts.scope
    })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "github")))
    .limit(1);

  if (!account) {
    return json(
      { error: "GitHub account not linked", requiresLink: true },
      { status: 401 }
    );
  }

  if (!hasRepoScope(account.scope)) {
    return json(
      { error: "GitHub repo access not granted", requiresLink: true },
      { status: 403 }
    );
  }

  const tokenResult = await getGitHubAccessToken(req);
  if (tokenResult.requiresReauth || !tokenResult.accessToken) {
    return json(
      { error: "GitHub access token not available", requiresReauth: true },
      { status: 401 }
    );
  }

  const headers = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "deployher"
  };

  const aggregated: GitHubRepoApiRow[] = [];

  for (let page = 1; page <= USER_REPOS_MAX_PAGES; page += 1) {
    const listUrl = new URL("https://api.github.com/user/repos");
    listUrl.searchParams.set("per_page", String(USER_REPOS_PER_PAGE));
    listUrl.searchParams.set("page", String(page));
    listUrl.searchParams.set("sort", "updated");
    listUrl.searchParams.set("direction", "desc");
    listUrl.searchParams.set("visibility", "all");

    const response = await fetch(listUrl.toString(), { headers });

    if (response.status === 401) {
      return json(
        { error: "GitHub authentication failed. Please re-link GitHub.", requiresReauth: true },
        { status: 401 }
      );
    }

    if (response.status === 403) {
      return json(
        { error: "GitHub API rate limit or permission issue.", requiresReauth: false },
        { status: 403 }
      );
    }

    if (!response.ok) {
      return json({ error: `GitHub API error (${response.status})` }, { status: 502 });
    }

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload)) {
      return json({ error: "GitHub API returned an unexpected response" }, { status: 502 });
    }

    const rows = payload as GitHubRepoApiRow[];
    aggregated.push(...rows);

    if (rows.length < USER_REPOS_PER_PAGE) {
      break;
    }
  }

  const repos = aggregated.map(mapRepoRow);

  return json({ repos });
};

export const listBranches = async (req: RequestWithParamsAndSession) => {
  const url = new URL(req.url);
  const ownerDecoded = url.searchParams.get("owner")?.trim();
  const repoDecoded = url.searchParams.get("repo")?.trim();
  if (!ownerDecoded || !repoDecoded) {
    return json({ error: "owner and repo query parameters are required" }, { status: 400 });
  }
  const tokenResult = await getGitHubAccessToken(req);
  if (!tokenResult.accessToken) {
    return json(
      { error: "GitHub account not linked or repo access not granted", requiresLink: true },
      { status: 401 }
    );
  }
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(ownerDecoded)}/${encodeURIComponent(repoDecoded)}/branches?per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${tokenResult.accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "deployher"
      }
    }
  );
  if (response.status === 401) {
    return json(
      { error: "GitHub authentication failed. Please re-link GitHub.", requiresReauth: true },
      { status: 401 }
    );
  }
  if (response.status === 403) {
    return json(
      { error: "GitHub API rate limit or permission issue.", requiresReauth: false },
      { status: 403 }
    );
  }
  if (response.status === 404) {
    return json({ error: "Repository not found or no access" }, { status: 404 });
  }
  if (!response.ok) {
    return json({ error: `GitHub API error (${response.status})` }, { status: 502 });
  }
  const payload = (await response.json()) as Array<{ name: string }>;
  const branches = Array.isArray(payload) ? payload.map((b) => b.name) : [];
  return json({ branches });
};

const MAX_REPO_FILE_BYTES = 512 * 1024;

export const repoHints = async (req: RequestWithParamsAndSession) => {
  const url = new URL(req.url);
  const ownerDecoded = url.searchParams.get("owner")?.trim();
  const repoDecoded = url.searchParams.get("repo")?.trim();
  const refDecoded = url.searchParams.get("ref")?.trim();
  const projectRootDecoded = url.searchParams.get("projectRoot")?.trim() ?? ".";

  if (!ownerDecoded || !repoDecoded || !refDecoded) {
    return json({ error: "owner, repo, and ref query parameters are required" }, { status: 400 });
  }

  const tokenResult = await getGitHubAccessToken(req);
  if (!tokenResult.accessToken) {
    return json(
      { error: "GitHub account not linked or repo access not granted", requiresLink: true },
      { status: 401 }
    );
  }

  const headers = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "deployher"
  };

  const fetchRepoFile = async (
    fileName: string
  ): Promise<{ ok: true; text: string | null } | { ok: false; status: number }> => {
    const path = joinRepoContentPath(projectRootDecoded, fileName);
    const encoded = encodeGitHubContentPath(path);
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(ownerDecoded)}/${encodeURIComponent(repoDecoded)}/contents/${encoded}?ref=${encodeURIComponent(refDecoded)}`,
      { headers }
    );
    if (response.status === 404) {
      return { ok: true, text: null };
    }
    if (response.status === 401) {
      return { ok: false, status: 401 };
    }
    if (!response.ok) {
      return { ok: false, status: response.status };
    }
    const payload = (await response.json()) as GitHubContentFile;
    return { ok: true, text: decodeGitHubFileContent(payload) };
  };

  const fetchResults = await Promise.all(REPO_HINT_SCAN_FILES.map((name) => fetchRepoFile(name)));

  const rejectScan = (status: number) => {
    if (status === 401) {
      return json(
        { error: "GitHub authentication failed. Please re-link GitHub.", requiresReauth: true },
        { status: 401 }
      );
    }
    return json({ error: `GitHub API error (${status})` }, { status: 502 });
  };

  const scanTexts: (string | null)[] = [];
  for (const res of fetchResults) {
    if (!res.ok) {
      return rejectScan(res.status);
    }
    scanTexts.push(res.text);
  }

  const pickText = (index: number): string | null => scanTexts[index] ?? null;
  const packageJsonRaw = pickText(0);
  const pyprojectRaw = pickText(1);
  const requirementsRaw = pickText(2);
  const pipfileRaw = pickText(3);
  const bunLockbRaw = pickText(4);
  const bunLockRaw = pickText(5);
  const pnpmLockYamlRaw = pickText(6);
  const yarnLockRaw = pickText(7);
  const packageLockJsonRaw = pickText(8);
  const indexHtmlRaw = pickText(9);
  const publicIndexHtmlRaw = pickText(10);
  const distIndexHtmlRaw = pickText(11);
  const buildIndexHtmlRaw = pickText(12);

  let packageJsonFound = false;
  if (packageJsonRaw) {
    try {
      JSON.parse(packageJsonRaw) as unknown;
      packageJsonFound = true;
    } catch {
      packageJsonFound = false;
    }
  }

  const hints = await inferMergedRepoHintsFromScanFiles({
    packageJsonRaw,
    pyprojectToml: pyprojectRaw,
    requirementsTxt: requirementsRaw,
    pipfile: pipfileRaw,
    bunLockb: bunLockbRaw,
    bunLock: bunLockRaw,
    pnpmLockYaml: pnpmLockYamlRaw,
    yarnLock: yarnLockRaw,
    packageLockJson: packageLockJsonRaw,
    indexHtml: indexHtmlRaw,
    publicIndexHtml: publicIndexHtmlRaw,
    distIndexHtml: distIndexHtmlRaw,
    buildIndexHtml: buildIndexHtmlRaw
  });

  return json({
    projectRoot: projectRootDecoded,
    packageJsonFound,
    ...hints
  });
};

export const repoLocs = async (req: RequestWithParamsAndSession) => {
  const url = new URL(req.url);
  const ownerDecoded = url.searchParams.get("owner")?.trim();
  const repoDecoded = url.searchParams.get("repo")?.trim();
  const refDecoded = url.searchParams.get("ref")?.trim();
  const projectRootDecoded = url.searchParams.get("projectRoot")?.trim() ?? ".";
  const filterDecoded = url.searchParams.get("filter")?.trim() ?? "";

  if (!ownerDecoded || !repoDecoded || !refDecoded) {
    return json({ error: "owner, repo, and ref query parameters are required" }, { status: 400 });
  }

  const tokenResult = await getGitHubAccessToken(req);
  if (!tokenResult.accessToken) {
    return json(
      { error: "GitHub account not linked or repo access not granted", requiresLink: true },
      { status: 401 }
    );
  }

  const cacheKey = getRepoLocsCacheKey({
    owner: ownerDecoded,
    repo: repoDecoded,
    ref: refDecoded,
    projectRoot: projectRootDecoded,
    filter: filterDecoded
  });
  const cached = getCachedRepoLocs(cacheKey);
  if (cached) {
    return json(cached);
  }

  const zipResult = await fetchGitHubRepoZipball(
    { owner: ownerDecoded, repo: repoDecoded },
    refDecoded,
    tokenResult.accessToken
  );

  if (!zipResult.ok) {
    if (zipResult.status === 401) {
      return json(
        { error: "GitHub authentication failed. Please re-link GitHub.", requiresReauth: true },
        { status: 401 }
      );
    }
    if (zipResult.status === 404) {
      return json({ error: zipResult.message }, { status: 404 });
    }
    if (zipResult.status === 413) {
      return json({ error: zipResult.message }, { status: 413 });
    }
    return json({ error: zipResult.message }, { status: 502 });
  }

  const payload = computeRepoLocsFromZipBuffer(zipResult.buffer, {
    projectRoot: projectRootDecoded,
    filter: filterDecoded
  });
  setCachedRepoLocs(cacheKey, payload);
  return json(payload);
};

export const repoFile = async (req: RequestWithParamsAndSession) => {
  const url = new URL(req.url);
  const ownerDecoded = url.searchParams.get("owner")?.trim();
  const repoDecoded = url.searchParams.get("repo")?.trim();
  const refDecoded = url.searchParams.get("ref")?.trim();
  const pathDecoded = url.searchParams.get("path")?.trim();

  if (!ownerDecoded || !repoDecoded || !refDecoded || !pathDecoded) {
    return json(
      { error: "owner, repo, ref, and path query parameters are required" },
      { status: 400 }
    );
  }

  if (pathDecoded.includes("..")) {
    return json({ error: "invalid path" }, { status: 400 });
  }

  const tokenResult = await getGitHubAccessToken(req);
  if (!tokenResult.accessToken) {
    return json(
      { error: "GitHub account not linked or repo access not granted", requiresLink: true },
      { status: 401 }
    );
  }

  const headers = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "deployher"
  };

  const encoded = encodeGitHubContentPath(pathDecoded);
  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(ownerDecoded)}/${encodeURIComponent(repoDecoded)}/contents/${encoded}?ref=${encodeURIComponent(refDecoded)}`,
    { headers }
  );

  if (response.status === 401) {
    return json(
      { error: "GitHub authentication failed. Please re-link GitHub.", requiresReauth: true },
      { status: 401 }
    );
  }
  if (response.status === 404) {
    return json({ error: "File not found" }, { status: 404 });
  }
  if (!response.ok) {
    return json({ error: `GitHub API error (${response.status})` }, { status: 502 });
  }

  const payload = (await response.json()) as GitHubContentFile;
  const text = decodeGitHubFileContent(payload);
  if (text === null) {
    return json({ error: "Not a decodable file (directory or binary)" }, { status: 415 });
  }
  if (text.length > MAX_REPO_FILE_BYTES) {
    return json({ error: `File exceeds ${MAX_REPO_FILE_BYTES} character limit` }, { status: 413 });
  }

  return json({ path: pathDecoded, content: text });
};
