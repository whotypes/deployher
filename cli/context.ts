import type { CliContext, LogLevel } from "./types";
import {
  defaultBackendEnvFile,
  defaultGarageEnvFile,
  getComposeFile,
  getInfraDir,
  getRepoRoot,
} from "./lib/paths";

export type BuildContextOptions = {
  verbose?: boolean;
  quiet?: boolean;
  noColor?: boolean;
  yes?: boolean;
  bunImage?: string;
  garageEnvFile?: string;
  garageBucketName?: string;
  garageKeyName?: string;
};

export const buildContext = (opts: BuildContextOptions): CliContext => {
  const repoRoot = getRepoRoot();
  const infraDir = getInfraDir(repoRoot);
  const logLevel: LogLevel = opts.quiet ? "quiet" : opts.verbose ? "verbose" : "normal";
  const ci = process.env.CI === "1" || process.env.CI === "true";

  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://app:app@localhost:5432/placeholder";
  }

  const noColor = Boolean(opts.noColor);
  if (noColor) {
    process.env.NO_COLOR = "1";
  }

  return {
    repoRoot,
    infraDir,
    composeFile: getComposeFile(repoRoot),
    garageEnvFile: opts.garageEnvFile ?? defaultGarageEnvFile(infraDir),
    backendEnvFile: defaultBackendEnvFile(repoRoot),
    bunImage: opts.bunImage ?? process.env.BUN_IMAGE ?? "oven/bun:1.3.5",
    garageBucketName: opts.garageBucketName ?? process.env.GARAGE_BUCKET_NAME ?? "placeholder-bucket",
    garageKeyName: opts.garageKeyName ?? process.env.GARAGE_KEY_NAME ?? "devkey",
    noColor: noColor || process.env.NO_COLOR === "1",
    yes: Boolean(opts.yes),
    ci,
    logLevel,
  };
};
