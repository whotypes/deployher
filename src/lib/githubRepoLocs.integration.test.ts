/*
 * Live GitHub HTTP checks (zipball + contents API). Skipped unless GITHUB_INTEGRATION_TESTS=1 and GITHUB_TEST_TOKEN is set.
 * GITHUB_TEST_TOKEN is only for CI/local automation — it is not how end users authenticate. In the app, each user's
 * OAuth-linked token is read server-side from the session (see getGitHubAccessToken); never expose user PATs in .env.
 */
import { describe, expect, it } from "bun:test";
import { decodeGitHubFileContent, type GitHubContentFile } from "./githubContentDecode";
import { computeRepoLocsFromZipBuffer, fetchGitHubRepoZipball } from "./githubRepoLocs";

const TOKEN = process.env.GITHUB_TEST_TOKEN?.trim() ?? "";
const RUN_LIVE_GITHUB_TESTS = process.env.GITHUB_INTEGRATION_TESTS === "1";
const runIntegration = Boolean(TOKEN && RUN_LIVE_GITHUB_TESTS);

const githubApiHeaders = (): Record<string, string> => ({
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "deployher-integration-test",
  Authorization: `Bearer ${TOKEN}`
});

const fetchDefaultBranch = async (owner: string, repo: string): Promise<string> => {
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: githubApiHeaders()
  });
  expect(response.ok).toBe(true);
  const data = (await response.json()) as { default_branch?: string };
  if (typeof data.default_branch !== "string" || !data.default_branch) {
    throw new Error("missing default_branch");
  }
  return data.default_branch;
};

const fetchRepoReadmeContent = async (
  owner: string,
  repo: string,
  ref: string
): Promise<string | null> => {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/README.md?ref=${encodeURIComponent(ref)}`,
    { headers: githubApiHeaders() }
  );
  if (response.status === 404) return null;
  expect(response.ok).toBe(true);
  const file = (await response.json()) as GitHubContentFile;
  return decodeGitHubFileContent(file);
};

describe.skipIf(!runIntegration)("github repo integration (nyumat/nyumatflix)", () => {
  const owner = "nyumat";
  const repo = "nyumatflix";

  it(
    "fetches zipball and computes non-empty loc tree",
    async () => {
      const ref = await fetchDefaultBranch(owner, repo);
      const zipResult = await fetchGitHubRepoZipball({ owner, repo }, ref, TOKEN);
      expect(zipResult.ok).toBe(true);
      if (!zipResult.ok) return;
      expect(zipResult.buffer.byteLength).toBeGreaterThan(1024);

      const { locs, truncated } = computeRepoLocsFromZipBuffer(zipResult.buffer, {
        projectRoot: "",
        filter: ""
      });
      expect(locs.loc).toBeGreaterThan(500);
      expect(truncated).toBe(false);
      expect(locs.children && Object.keys(locs.children).length).toBeGreaterThan(0);
    },
    120_000
  );

  it(
    "fetches README via contents API and decodes text",
    async () => {
      const ref = await fetchDefaultBranch(owner, repo);
      const readme = await fetchRepoReadmeContent(owner, repo, ref);
      expect(readme).not.toBeNull();
      if (!readme) return;
      expect(readme.length).toBeGreaterThan(20);
    },
    60_000
  );
});
