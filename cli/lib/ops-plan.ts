import { maskEnvValueForDisplay } from "./bootstrap-env";
import type { EnvPatchDiff, EnvPatchOperation } from "./env-file";

export type OpsEnvironment = "local" | "production";

export const DEFAULT_APP_SERVICES = ["app-api", "marketing", "edge", "deployment-worker"] as const;
export const BUILDER_SERVICES = ["node-build-image", "bun-build-image"] as const;

const BUILDER_IMPACT_KEYS = new Set([
  "BUILD_IMAGE_REGISTRY",
  "BUILD_BUN_IMAGE",
  "NEXUS_REGISTRY",
  "NEXUS_USER",
  "NEXUS_PASSWORD",
  "PREVIEW_RUNTIME_REGISTRY",
  "PREVIEW_RUNTIME_DOCKER_DAEMON_REGISTRY",
  "PREVIEW_RUNTIME_DOCKER_REPO",
  "PREVIEW_RUNTIME_IMAGE_NAME",
]);

export const parseOpsEnvironment = (raw: string | undefined): OpsEnvironment | null => {
  const t = (raw ?? "").trim().toLowerCase();
  if (t === "local" || t === "development" || t === "dev") return "local";
  if (t === "production" || t === "prod") return "production";
  return null;
};

export const inferOpsEnvironment = (appEnv: string | undefined): OpsEnvironment | null =>
  parseOpsEnvironment(appEnv);

export const parseServiceList = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const defaultServicesForEnvKeys = (keys: readonly string[]): string[] => {
  const services: string[] = [...DEFAULT_APP_SERVICES];
  if (keys.some((key) => BUILDER_IMPACT_KEYS.has(key))) {
    services.unshift(...BUILDER_SERVICES);
  }
  return [...new Set(services)];
};

export const summarizeEnvDiffs = (diffs: readonly EnvPatchDiff[]): string[] =>
  diffs.map((d) => {
    const before = d.before === undefined ? "(unset)" : maskEnvValueForDisplay(d.key, d.before);
    const after = d.after === undefined ? "(removed)" : maskEnvValueForDisplay(d.key, d.after);
    return `${d.key}: ${before} -> ${after}`;
  });

export const operationKeys = (ops: readonly EnvPatchOperation[]): string[] =>
  [...new Set(ops.map((op) => op.key))];
