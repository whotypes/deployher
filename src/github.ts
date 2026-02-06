export type GitHubRepoSpec = {
  owner: string;
  repo: string;
  branch?: string;
};

type RepoProviderId = "github";

type RepoProvider<TSpec> = {
  id: RepoProviderId;
  parse: (repoUrl: string) => TSpec | null;
  normalize: (spec: TSpec) => string;
  archiveUrl: (spec: TSpec, ref?: string) => string;
};

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

const githubProvider: RepoProvider<GitHubRepoSpec> = {
  id: "github",
  parse: (repoUrl: string) => {
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
  },
  normalize: (spec: GitHubRepoSpec) => {
    const base = `https://github.com/${spec.owner}/${spec.repo}`;
    return spec.branch ? `${base}/tree/${spec.branch}` : base;
  },
  archiveUrl: (spec: GitHubRepoSpec, ref?: string) => {
    const resolvedRef = ref ?? spec.branch?.trim() ?? "HEAD";
    return `https://api.github.com/repos/${spec.owner}/${spec.repo}/zipball/${resolvedRef}`;
  }
};

const providers: RepoProvider<GitHubRepoSpec>[] = [githubProvider];

const parseWithProvider = (
  repoUrl: string
): { providerId: RepoProviderId; spec: GitHubRepoSpec } | null => {
  for (const provider of providers) {
    if (provider.id !== "github") continue;
    const spec = provider.parse(repoUrl);
    if (!spec) continue;
    return { providerId: "github", spec: spec as GitHubRepoSpec };
  }
  return null;
};

export function parseGitHubRepoUrl(repoUrl: string): GitHubRepoSpec | null {
  const parsed = parseWithProvider(repoUrl);
  if (!parsed || parsed.providerId !== "github") return null;
  return parsed.spec;
}

export function normalizeGitHubRepoUrl(repoUrl: string): string | null {
  const spec = parseGitHubRepoUrl(repoUrl);
  if (!spec) return null;
  return githubProvider.normalize(spec);
}

export function buildZipballUrl(spec: GitHubRepoSpec, ref?: string): string {
  return githubProvider.archiveUrl(spec, ref);
}
