import path from "path";
import type { BuildRuntime } from "../types";

export type NodePackageManagerName = "bun" | "pnpm" | "yarn" | "npm";

export type NodePackageManager = {
  name: NodePackageManagerName;
  install: string[];
  runBuild: string[];
  extraEnv?: Record<string, string>;
};

type NodePackageManagerDetector = {
  name: NodePackageManagerName;
  lockfiles: string[];
  buildSpec: (runtime: BuildRuntime) => NodePackageManager;
};

const NODE_PACKAGE_MANAGER_DETECTORS: NodePackageManagerDetector[] = [
  {
    name: "bun",
    lockfiles: ["bun.lockb", "bun.lock"],
    buildSpec: (runtime) => {
      const bunCli = runtime.resolveBunCli();
      return {
        name: "bun",
        install: [bunCli.command, "install", "--frozen-lockfile"],
        runBuild: [bunCli.command, "run", "build"],
        ...(bunCli.env && { extraEnv: bunCli.env })
      };
    }
  },
  {
    name: "pnpm",
    lockfiles: ["pnpm-lock.yaml"],
    buildSpec: () => ({
      name: "pnpm",
      install: ["pnpm", "install", "--frozen-lockfile"],
      runBuild: ["pnpm", "run", "build"]
    })
  },
  {
    name: "yarn",
    lockfiles: ["yarn.lock"],
    buildSpec: () => ({
      name: "yarn",
      install: ["yarn", "install", "--frozen-lockfile"],
      runBuild: ["yarn", "build"]
    })
  },
  {
    name: "npm",
    lockfiles: ["package-lock.json"],
    buildSpec: () => ({
      name: "npm",
      install: ["npm", "ci"],
      runBuild: ["npm", "run", "build"]
    })
  }
];

export const detectNodePackageManager = async (
  repoDir: string,
  runtime: BuildRuntime
): Promise<NodePackageManager> => {
  for (const detector of NODE_PACKAGE_MANAGER_DETECTORS) {
    for (const lockfile of detector.lockfiles) {
      if (await runtime.exists(path.join(repoDir, lockfile))) {
        return detector.buildSpec(runtime);
      }
    }
  }

  throw new Error(
    "No supported Node lockfile found. Expected one of: bun.lockb, bun.lock, pnpm-lock.yaml, yarn.lock, package-lock.json"
  );
};
