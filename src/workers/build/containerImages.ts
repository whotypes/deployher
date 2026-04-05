export type BuildContainerImageKind = "node" | "bun" | "python";

const trimRegistryPrefix = (raw: string): string => {
  const s = raw.trim().replace(/\/+$/, "");
  if (!s) return "";
  return s.replace(/^https?:\/\//i, "");
};

const imageNameForKind = (kind: BuildContainerImageKind): string => {
  switch (kind) {
    case "node":
      return "deployher-node-build-image:latest";
    case "bun":
      return "deployher-bun-build-image:latest";
    case "python":
      return "python:3.12-bookworm";
  }
};

const envKeyForKind = (kind: BuildContainerImageKind): string => {
  switch (kind) {
    case "node":
      return "BUILD_NODE_IMAGE";
    case "bun":
      return "BUILD_BUN_IMAGE";
    case "python":
      return "BUILD_PYTHON_IMAGE";
  }
};

const legacyAliasKey = (kind: BuildContainerImageKind): string | undefined => {
  switch (kind) {
    case "node":
      return "BUILD_NODE_BUILDER_IMAGE";
    case "bun":
      return "BUILD_BUN_BUILDER_IMAGE";
    case "python":
      return undefined;
  }
};

export const resolveBuildContainerImage = (
  kind: BuildContainerImageKind,
  env: NodeJS.ProcessEnv = process.env
): string => {
  const direct = env[envKeyForKind(kind)]?.trim();
  if (direct) return direct;

  const legacy = legacyAliasKey(kind);
  if (legacy) {
    const legacyVal = env[legacy]?.trim();
    if (legacyVal) return legacyVal;
  }

  const registry = trimRegistryPrefix(env.BUILD_IMAGE_REGISTRY ?? "");
  if (registry) {
    return `${registry}/${imageNameForKind(kind)}`;
  }

  return imageNameForKind(kind);
};
