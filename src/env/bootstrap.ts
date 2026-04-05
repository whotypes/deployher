import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { loadTomlAppConfigSync } from "./loadAppConfigFiles";

let appEnvLoaded = false;

export const getRepoRoot = (): string => path.join(import.meta.dir, "..", "..");

export const ensureAppEnvLoaded = (): void => {
  if (appEnvLoaded) return;
  appEnvLoaded = true;

  const repoRoot = getRepoRoot();
  loadDotenv({ path: path.join(repoRoot, ".env") });

  const fromToml = loadTomlAppConfigSync(repoRoot);
  for (const [key, value] of Object.entries(fromToml)) {
    const current = process.env[key];
    if (current === undefined || current === "") {
      process.env[key] = value;
    }
  }
};

ensureAppEnvLoaded();
