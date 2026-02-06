import { and, eq } from "drizzle-orm";
import { auth } from "../../auth";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { json } from "../http/helpers";

type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
  updatedAt: string | null;
};

const hasRepoScope = (scope: string | null | undefined): boolean => {
  if (!scope) return false;
  const scopes = scope
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return scopes.includes("repo") || scopes.includes("public_repo");
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

  let accessToken: string | undefined;
  try {
    const tokenResponse = await auth.api.getAccessToken({
      headers: req.headers,
      body: {
        providerId: "github",
        accountId: account.id
      }
    });
    accessToken = tokenResponse.accessToken;
  } catch (error) {
    return json(
      { error: "GitHub authentication failed. Please re-link GitHub.", requiresReauth: true },
      { status: 401 }
    );
  }

  if (!accessToken) {
    return json(
      { error: "GitHub access token not available", requiresReauth: true },
      { status: 401 }
    );
  }

  const response = await fetch(
    "https://api.github.com/user/repos?per_page=100&sort=updated&direction=desc&visibility=all",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

  if (!response.ok) {
    return json({ error: `GitHub API error (${response.status})` }, { status: 502 });
  }

  const payload = (await response.json()) as Array<{
    id: number;
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
    description: string | null;
    updated_at: string | null;
  }>;

  const repos: GitHubRepo[] = Array.isArray(payload)
    ? payload.map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        htmlUrl: repo.html_url,
        private: repo.private,
        description: repo.description ?? null,
        updatedAt: repo.updated_at ?? null
      }))
    : [];

  return json({ repos });
};

const getAccessTokenForGithub = async (
  req: RequestWithParamsAndSession
): Promise<{ accessToken: string; accountId: string } | null> => {
  const userId = req.session.user.id;
  const [account] = await db
    .select({ id: schema.accounts.id, scope: schema.accounts.scope })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "github")))
    .limit(1);
  if (!account || !hasRepoScope(account.scope)) return null;
  try {
    const tokenResponse = await auth.api.getAccessToken({
      headers: req.headers,
      body: { providerId: "github", accountId: account.id }
    });
    const accessToken = tokenResponse.accessToken;
    return accessToken ? { accessToken, accountId: account.id } : null;
  } catch {
    return null;
  }
};

export const listBranches = async (req: RequestWithParamsAndSession) => {
  const url = new URL(req.url);
  const ownerDecoded = url.searchParams.get("owner")?.trim();
  const repoDecoded = url.searchParams.get("repo")?.trim();
  if (!ownerDecoded || !repoDecoded) {
    return json({ error: "owner and repo query parameters are required" }, { status: 400 });
  }
  const tokenResult = await getAccessTokenForGithub(req);
  if (!tokenResult) {
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
