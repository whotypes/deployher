import path from "path";

export type RuntimeImageMode = "auto" | "platform" | "dockerfile";

export const parseRepoRelativePath = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const raw = value.trim() || ".";
  if (path.isAbsolute(raw)) return null;
  const segments: string[] = [];
  for (const part of raw.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    segments.push(part);
  }
  return segments.length === 0 ? "." : segments.join("/");
};

export const sanitizeRelativeWorkdir = (value: string): string => {
  const parsed = parseRepoRelativePath(value);
  if (!parsed) {
    throw new Error("Working directory must be a relative repository path inside the workspace");
  }
  return parsed;
};

export type ResolvedProjectRoots = {
  repoRoot: string;
  workspaceRootDir: string;
  projectRootDir: string;
  workspaceDir: string;
  projectDir: string;
  workspaceRelative: string;
  projectRelative: string;
};

const isSubpath = (parentDir: string, childDir: string): boolean =>
  childDir === parentDir || childDir.startsWith(`${parentDir}${path.sep}`);

export const resolveProjectRoots = (
  extractedRoot: string,
  workspaceRootDir: string,
  projectRootDir: string
): ResolvedProjectRoots => {
  const normalizedWorkspaceRootDir = parseRepoRelativePath(workspaceRootDir);
  if (!normalizedWorkspaceRootDir) {
    throw new Error("Workspace root directory must be a relative repository path like . or apps");
  }
  const normalizedProjectRootDir = parseRepoRelativePath(projectRootDir);
  if (!normalizedProjectRootDir) {
    throw new Error("Project root directory must be a relative repository path like . or apps/web");
  }

  const repoRoot = path.resolve(extractedRoot);
  const workspaceDir = path.resolve(repoRoot, normalizedWorkspaceRootDir);
  const projectDir = path.resolve(repoRoot, normalizedProjectRootDir);

  if (!isSubpath(repoRoot, workspaceDir)) {
    throw new Error("Workspace root directory must stay inside the repository");
  }
  if (!isSubpath(repoRoot, projectDir)) {
    throw new Error("Project root directory must stay inside the repository");
  }
  if (!isSubpath(workspaceDir, projectDir)) {
    throw new Error("Workspace root directory must be the same as or an ancestor of the project root directory");
  }

  return {
    repoRoot,
    workspaceRootDir: normalizedWorkspaceRootDir,
    projectRootDir: normalizedProjectRootDir,
    workspaceDir,
    projectDir,
    workspaceRelative: path.relative(repoRoot, workspaceDir).replace(/\\/g, "/") || ".",
    projectRelative: path.relative(repoRoot, projectDir).replace(/\\/g, "/") || "."
  };
};

export const parseRuntimeImageMode = (value: unknown): RuntimeImageMode | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as RuntimeImageMode;
  return normalized === "auto" || normalized === "platform" || normalized === "dockerfile"
    ? normalized
    : null;
};
