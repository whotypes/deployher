import { normalizeGitHubRepoUrl, parseGitHubRepoUrl } from "../../src/github";

export const githubHttpsRepoUrlFromRemote = (remote: string): string | null => {
  const t = remote.trim();
  if (!t) return null;
  if (t.startsWith("https://github.com/") || t.startsWith("https://www.github.com/")) {
    const normalized = normalizeGitHubRepoUrl(t);
    return normalized;
  }
  const m = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i.exec(t);
  if (!m) return null;
  const owner = m[1];
  const repo = m[2];
  if (!owner || !repo) return null;
  return `https://github.com/${owner}/${repo}`;
};

export const repoFullNameFromUrl = (repoUrl: string): string | null => {
  const spec = parseGitHubRepoUrl(repoUrl);
  if (!spec) return null;
  return `${spec.owner}/${spec.repo}`;
};
