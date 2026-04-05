import { inferRepoFrameworkHints } from "./repoFrameworkHints";
import type { LockfilePresence } from "./repoToolchainHints";
import { mergeVercelAndLegacyHints, mapVercelFrameworkToDeployher } from "./vercel/mapFrameworkToDeployher";
import { detectFrameworkFromFileContents } from "./vercel/runFrameworkDetection";

export const REPO_HINT_SCAN_FILES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "bun.lockb",
  "bun.lock",
  "pnpm-lock.yaml",
  "yarn.lock",
  "package-lock.json"
] as const;

export type RepoRootScanFiles = {
  packageJsonRaw: string | null;
  pyprojectToml: string | null;
  requirementsTxt: string | null;
  pipfile: string | null;
  bunLockb: string | null;
  bunLock: string | null;
  pnpmLockYaml: string | null;
  yarnLock: string | null;
  packageLockJson: string | null;
};

export const lockfilesFromRepoScan = (files: RepoRootScanFiles): LockfilePresence => ({
  bunLockb: Boolean(files.bunLockb),
  bunLock: Boolean(files.bunLock),
  pnpmLock: Boolean(files.pnpmLockYaml),
  yarnLock: Boolean(files.yarnLock),
  npmLock: Boolean(files.packageLockJson)
});

const parsePackageJsonValue = (raw: string | null): unknown => {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

export const inferMergedRepoHintsFromScanFiles = async (
  files: RepoRootScanFiles
): Promise<ReturnType<typeof mergeVercelAndLegacyHints>> => {
  const packageJson = parsePackageJsonValue(files.packageJsonRaw);

  const memoryFiles: Record<string, string> = {};
  if (files.packageJsonRaw) {
    memoryFiles["package.json"] = files.packageJsonRaw;
  }
  if (files.pyprojectToml) {
    memoryFiles["pyproject.toml"] = files.pyprojectToml;
  }
  if (files.requirementsTxt) {
    memoryFiles["requirements.txt"] = files.requirementsTxt;
  }
  if (files.pipfile) {
    memoryFiles["Pipfile"] = files.pipfile;
  }

  const vercelRecord =
    Object.keys(memoryFiles).length > 0 ? await detectFrameworkFromFileContents(memoryFiles) : null;
  const vercelMapped = mapVercelFrameworkToDeployher(vercelRecord, packageJson);
  const legacyHints = inferRepoFrameworkHints(packageJson, {
    pyprojectToml: files.pyprojectToml,
    requirementsTxt: files.requirementsTxt,
    pipfile: files.pipfile,
    lockfiles: lockfilesFromRepoScan(files)
  });
  return mergeVercelAndLegacyHints(vercelMapped, legacyHints, packageJson !== null);
};
