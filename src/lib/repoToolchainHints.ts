export type LockfilePresence = {
  bunLockb: boolean;
  bunLock: boolean;
  pnpmLock: boolean;
  yarnLock: boolean;
  npmLock: boolean;
};

export const emptyLockfilePresence = (): LockfilePresence => ({
  bunLockb: false,
  bunLock: false,
  pnpmLock: false,
  yarnLock: false,
  npmLock: false
});

type PackageJsonWithPm = {
  packageManager?: unknown;
};

export type ResolvedJsToolchain = { label: string };

const readPackageManagerField = (pkg: PackageJsonWithPm | null): string | null => {
  const pm = pkg?.packageManager;
  return typeof pm === "string" && pm.trim() ? pm.trim().toLowerCase() : null;
};

export const resolveJsToolchain = (
  pkg: PackageJsonWithPm | null,
  locks: LockfilePresence
): ResolvedJsToolchain | null => {
  if (locks.bunLockb || locks.bunLock) {
    return { label: "Bun" };
  }
  if (locks.pnpmLock) {
    return { label: "pnpm" };
  }
  if (locks.yarnLock) {
    return { label: "Yarn" };
  }
  if (locks.npmLock) {
    return { label: "npm" };
  }

  const pm = readPackageManagerField(pkg);
  if (!pm) {
    return null;
  }
  if (pm.startsWith("bun@")) {
    return { label: "Bun" };
  }
  if (pm.startsWith("pnpm@")) {
    return { label: "pnpm" };
  }
  if (pm.startsWith("yarn@")) {
    return { label: "Yarn" };
  }
  if (pm.startsWith("npm@")) {
    return { label: "npm" };
  }
  return null;
};
