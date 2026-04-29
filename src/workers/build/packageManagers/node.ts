import path from "path";
import type { BuildRuntime } from "../types";

export type NodePackageManagerName = "bun" | "pnpm" | "yarn" | "npm";

export type NodePackageManager = {
  name: NodePackageManagerName;
  install: string[];
  installProd: string[];
  runBuild: string[];
  extraEnv?: Record<string, string>;
};

type NodePackageManagerDetector = {
  name: NodePackageManagerName;
  lockfiles: string[];
};

const NODE_PACKAGE_MANAGER_DETECTORS: NodePackageManagerDetector[] = [
  {
    name: "bun",
    lockfiles: ["bun.lockb", "bun.lock"]
  },
  {
    name: "pnpm",
    lockfiles: ["pnpm-lock.yaml"]
  },
  {
    name: "yarn",
    lockfiles: ["yarn.lock"]
  },
  {
    name: "npm",
    lockfiles: ["package-lock.json"]
  }
];

const buildNodePackageManager = (
  name: NodePackageManagerName,
  runtime: BuildRuntime,
  locked: boolean
): NodePackageManager => {
  switch (name) {
    case "bun": {
      const bunCli = runtime.resolveBunCli();
      return {
        name: "bun",
        install: locked
          ? [bunCli.command, "install", "--frozen-lockfile"]
          : [bunCli.command, "install"],
        installProd: locked
          ? [bunCli.command, "install", "--frozen-lockfile", "--production"]
          : [bunCli.command, "install", "--production"],
        runBuild: [bunCli.command, "run", "build"],
        ...(bunCli.env && { extraEnv: bunCli.env })
      };
    }
    case "pnpm":
      return {
        name: "pnpm",
        install: locked
          ? ["corepack", "pnpm", "install", "--frozen-lockfile", "--prod=false"]
          : ["corepack", "pnpm", "install", "--prod=false"],
        installProd: locked
          ? ["corepack", "pnpm", "install", "--frozen-lockfile", "--prod"]
          : ["corepack", "pnpm", "install", "--prod"],
        runBuild: ["corepack", "pnpm", "run", "build"]
      };
    case "yarn":
      return {
        name: "yarn",
        install: locked
          ? ["corepack", "yarn", "install", "--frozen-lockfile"]
          : ["corepack", "yarn", "install"],
        installProd: locked
          ? ["corepack", "yarn", "install", "--frozen-lockfile", "--production=true"]
          : ["corepack", "yarn", "install", "--production=true"],
        runBuild: ["corepack", "yarn", "build"]
      };
    case "npm":
      return {
        name: "npm",
        install: locked ? ["npm", "ci"] : ["npm", "install"],
        installProd: locked ? ["npm", "ci", "--omit=dev"] : ["npm", "install", "--omit=dev"],
        runBuild: ["npm", "run", "build"]
      };
  }
};

const normalizePackageManager = (value: unknown): NodePackageManagerName | null => {
  if (typeof value !== "string") return null;
  const manager = value.split("@")[0]?.trim();
  if (manager === "bun" || manager === "pnpm" || manager === "yarn" || manager === "npm") {
    return manager;
  }
  return null;
};

const hasAnyLockfileForDetector = async (
  repoDir: string,
  detector: NodePackageManagerDetector,
  runtime: BuildRuntime
): Promise<boolean> => {
  for (const lockfile of detector.lockfiles) {
    if (await runtime.exists(path.join(repoDir, lockfile))) {
      return true;
    }
  }
  return false;
};

const PM_ROOT_LOCKFILES = ["pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb"] as const;

export const resolveNodeInstallRoot = async (
  workspaceDir: string,
  repoRootDir: string,
  runtime: Pick<BuildRuntime, "exists">
): Promise<string> => {
  const resolvedRepo = path.resolve(repoRootDir);
  const resolvedWs = path.resolve(workspaceDir);
  const wsInRepo =
    resolvedWs === resolvedRepo ||
    resolvedWs.startsWith(resolvedRepo + path.sep);
  if (!wsInRepo) {
    return resolvedWs;
  }

  const chain: string[] = [];
  let dir = resolvedWs;
  while (true) {
    chain.push(dir);
    if (dir === resolvedRepo) {
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  for (const candidate of chain.slice().reverse()) {
    for (const name of PM_ROOT_LOCKFILES) {
      if (await runtime.exists(path.join(candidate, name))) {
        return candidate;
      }
    }
  }

  for (const candidate of chain) {
    if (await runtime.exists(path.join(candidate, "package-lock.json"))) {
      return candidate;
    }
  }

  return resolvedWs;
};

export const detectNodePackageManager = async (
  repoDir: string,
  runtime: BuildRuntime
): Promise<NodePackageManager> => {
  const pkg = await runtime.readJson<{ packageManager?: string }>(path.join(repoDir, "package.json"));
  const preferredManager = normalizePackageManager(pkg?.packageManager);
  if (preferredManager) {
    const detector = NODE_PACKAGE_MANAGER_DETECTORS.find((entry) => entry.name === preferredManager);
    if (detector) {
      const locked = await hasAnyLockfileForDetector(repoDir, detector, runtime);
      return buildNodePackageManager(preferredManager, runtime, locked);
    }
  }

  for (const detector of NODE_PACKAGE_MANAGER_DETECTORS) {
    if (await hasAnyLockfileForDetector(repoDir, detector, runtime)) {
      return buildNodePackageManager(detector.name, runtime, true);
    }
  }

  return buildNodePackageManager("npm", runtime, false);
};
