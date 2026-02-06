export type GitHubRepoSpec = {
  owner: string;
  repo: string;
  branch?: string;
};

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

export function parseGitHubRepoUrl(repoUrl: string): GitHubRepoSpec | null {
  const trimmed = repoUrl.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (!GITHUB_HOSTS.has(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1]?.replace(/\.git$/i, "");
  if (!owner || !repo) return null;
  let branch: string | undefined;
  if (parts.length >= 4 && parts[2] === "tree") {
    branch = parts[3];
  }
  return { owner, repo, branch };
}

export function normalizeGitHubRepoUrl(repoUrl: string): string | null {
  const spec = parseGitHubRepoUrl(repoUrl);
  if (!spec) return null;
  const base = `https://github.com/${spec.owner}/${spec.repo}`;
  return spec.branch ? `${base}/tree/${spec.branch}` : base;
}

export function buildZipballUrl(spec: GitHubRepoSpec, ref?: string): string {
  const resolvedRef = ref ?? spec.branch?.trim() ?? "HEAD";
  return `https://api.github.com/repos/${spec.owner}/${spec.repo}/zipball/${resolvedRef}`;
}
