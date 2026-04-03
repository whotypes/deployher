import { nodeBuildStrategy } from "./strategies/node";
import { pythonBuildStrategy } from "./strategies/python";
import { staticBuildStrategy } from "./strategies/static";
import type { BuildRuntime, BuildStrategy } from "./types";

const BUILD_STRATEGIES: BuildStrategy[] = [nodeBuildStrategy, pythonBuildStrategy, staticBuildStrategy];

export const detectBuildStrategy = async (
  repoDir: string,
  runtime: BuildRuntime
): Promise<BuildStrategy | null> => {
  for (const strategy of BUILD_STRATEGIES) {
    if (await strategy.detect(repoDir, runtime)) {
      return strategy;
    }
  }
  return null;
};
