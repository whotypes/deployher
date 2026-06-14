import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { loadTomlAppConfigSync } from "./loadAppConfigFiles";

let appEnvLoaded = false;

export const getRepoRoot = (): string => {
  const meta = import.meta as ImportMeta & { dir?: string };
  if (typeof meta.dir === "string" && meta.dir.length > 0) {
    return path.resolve(meta.dir, "..", "..");
  }
  if (typeof meta.url === "string" && meta.url.length > 0) {
    const bootstrapDir = path.dirname(fileURLToPath(meta.url));
    return path.resolve(bootstrapDir, "..", "..");
  }
  return process.cwd();
};

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
