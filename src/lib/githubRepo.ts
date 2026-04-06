export type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
  /** Default branch from GitHub (used for framework scan before a deploy branch is chosen). */
  defaultBranch: string;
};

export const filterReposByQuery = (repos: GitHubRepo[], query: string): GitHubRepo[] => {
  const q = query.trim().toLowerCase();
  if (!q) return repos;
  return repos.filter(
    (r) => r.fullName.toLowerCase().includes(q) || r.name.toLowerCase().includes(q)
  );
};

export const groupReposByOwner = (repos: GitHubRepo[]): Map<string, GitHubRepo[]> => {
  const m = new Map<string, GitHubRepo[]>();
  for (const r of repos) {
    const i = r.fullName.indexOf("/");
    if (i === -1) continue;
    const owner = r.fullName.slice(0, i);
    const list = m.get(owner) ?? [];
    list.push(r);
    m.set(owner, list);
  }
  for (const list of m.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name));
  }
  return new Map([...m.entries()].sort(([a], [b]) => a.localeCompare(b)));
};

export const reposByFullName = (repos: GitHubRepo[]): Map<string, GitHubRepo> => {
  const map = new Map<string, GitHubRepo>();
  for (const r of repos) {
    map.set(r.fullName, r);
  }
  return map;
};
