const trimRegistryHost = (raw: string): string => {
  let v = raw.trim().replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
  return v;
};

export const normalizePreviewRuntimeRegistryEnv = (raw: string | undefined): string => {
  const fromNexus = (process.env.NEXUS_REGISTRY ?? "").trim();
  const primary = (raw ?? "").trim();
  return trimRegistryHost(primary || fromNexus);
};

export type PreviewRuntimeRegistryConfig = {
  registryHost: string;
  dockerRepo: string;
  imageName: string;
  allowedPullRefPrefix: string;
};

export const loadPreviewRuntimeRegistryConfig = (): PreviewRuntimeRegistryConfig => {
  const registryHost = normalizePreviewRuntimeRegistryEnv(process.env.PREVIEW_RUNTIME_REGISTRY);
  const dockerRepo = (process.env.PREVIEW_RUNTIME_DOCKER_REPO ?? "docker-hosted").trim() || "docker-hosted";
  const imageName =
    (process.env.PREVIEW_RUNTIME_IMAGE_NAME ?? "deployher-preview-runtime").trim() ||
    "deployher-preview-runtime";
  const allowedPullRefPrefix = `${registryHost}/${dockerRepo}/${imageName}@`;
  return { registryHost, dockerRepo, imageName, allowedPullRefPrefix };
};

export const buildRuntimeImageTagOnly = (
  cfg: PreviewRuntimeRegistryConfig,
  deploymentId: string
): string => {
  const id = deploymentId.trim();
  if (!id) throw new Error("deploymentId is required for runtime image tag");
  return `${cfg.registryHost}/${cfg.dockerRepo}/${cfg.imageName}:${id}`;
};

export const assertAllowedPullRef = (pullRef: string, cfg: PreviewRuntimeRegistryConfig): void => {
  if (!cfg.registryHost.trim()) {
    throw new Error("PREVIEW_RUNTIME_REGISTRY or NEXUS_REGISTRY must be configured");
  }
  const ref = pullRef.trim();
  if (!ref.includes("@sha256:")) {
    throw new Error("runtime pull ref must include a sha256 digest");
  }
  if (!ref.startsWith(cfg.allowedPullRefPrefix)) {
    throw new Error("runtime pull ref is not under the configured preview registry");
  }
  const digestPart = ref.slice(ref.indexOf("@sha256:") + "@sha256:".length);
  if (!/^[a-f0-9]{64}$/i.test(digestPart)) {
    throw new Error("runtime pull ref has an invalid digest");
  }
};

export const requireNexusCredentialsForRuntimePush = (): { user: string; password: string } => {
  const user = (process.env.NEXUS_USER ?? "").trim();
  const password = (process.env.NEXUS_PASSWORD ?? "").trim();
  if (!user || !password) {
    throw new Error(
      "NEXUS_USER and NEXUS_PASSWORD must be set for pushing preview runtime images to the registry"
    );
  }
  return { user, password };
};

export const requirePreviewRuntimeRegistryForPush = (): PreviewRuntimeRegistryConfig => {
  const cfg = loadPreviewRuntimeRegistryConfig();
  if (!cfg.registryHost) {
    throw new Error(
      "PREVIEW_RUNTIME_REGISTRY or NEXUS_REGISTRY must be set for preview runtime image push"
    );
  }
  return cfg;
};

export const PREVIEW_PREWARM_CHANNEL = "deployher:preview:prewarm";

export type PreviewPrewarmPayload = {
  pullRef: string;
};

export const publishPreviewPrewarm = async (pullRef: string): Promise<void> => {
  const { getRedisClient } = await import("./redis");
  const client = await getRedisClient();
  if (!client) return;
  const payload: PreviewPrewarmPayload = { pullRef: pullRef.trim() };
  if (!payload.pullRef) return;
  await client.publish(PREVIEW_PREWARM_CHANNEL, JSON.stringify(payload));
};

export const notifyPreviewRunnersPrewarm = async (pullRef: string): Promise<void> => {
  const trimmed = pullRef.trim();
  if (!trimmed) return;
  await publishPreviewPrewarm(trimmed);
  const runnerUrl = (process.env.RUNNER_URL ?? "").trim().replace(/\/+$/, "");
  if (!runnerUrl) return;
  const secret = (process.env.RUNNER_SHARED_SECRET ?? "").trim();
  try {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (secret) headers.set("x-deployher-runner-secret", secret);
    await fetch(`${runnerUrl}/internal/prewarm`, {
      method: "POST",
      headers,
      body: JSON.stringify({ pullRef: trimmed }),
      signal: AbortSignal.timeout(8000)
    });
  } catch (e) {
    console.error("preview prewarm HTTP notify failed:", e);
  }
};
