import Docker from "dockerode";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { config } from "./config";
import { getBytes } from "./storage";

type DeploymentRecord = {
  id: string;
  runtimeImageArtifactKey: string | null;
  runtimeConfig: {
    port?: number;
  } | null;
};

const DOCKER_SOCKET_PATH =
  (process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock").trim() || "/var/run/docker.sock";
const dockerClient = new Docker({ socketPath: DOCKER_SOCKET_PATH });
const PREVIEW_RUNTIME_LABEL = "io.pdploy.preview=true";
const PREVIEW_DEPLOYMENT_LABEL = "io.pdploy.preview.deployment";
const PREVIEW_EXPIRES_LABEL = "io.pdploy.preview.expires_at";
const PREVIEW_TTL_MS = 30 * 60 * 1000;
const loadImageCache = new Map<string, Promise<string>>();

const sanitizeLabelValue = (value: string) => value.replace(/[^A-Za-z0-9_.-]/g, "_");

const readStreamText = async (stream: ReadableStream<Uint8Array> | null): Promise<string> => {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) output += decoder.decode(value, { stream: true });
  }
  output += decoder.decode();
  return output;
};

const removeContainerIfExists = async (containerId: string) => {
  try {
    await dockerClient.getContainer(containerId).remove({ force: true });
  } catch {
    // ignore
  }
};

const extractLoadedImageName = async (artifactKey: string): Promise<string> => {
  const cached = loadImageCache.get(artifactKey);
  if (cached) return cached;

  const promise = (async () => {
    const bytes = await getBytes(artifactKey);
    const stream = await dockerClient.loadImage(Readable.from([Buffer.from(bytes)]));
    const output = await readStreamText(stream as unknown as ReadableStream<Uint8Array> | null);
    const loadedMatch = output.match(/Loaded image:\s+([^\s]+)/i);
    if (loadedMatch?.[1]) return loadedMatch[1];
    const imageName = `pdploy-preview:${artifactKey.split("/").slice(-2, -1)[0] ?? randomUUID()}`;
    return imageName;
  })();

  loadImageCache.set(artifactKey, promise);
  try {
    return await promise;
  } catch (error) {
    loadImageCache.delete(artifactKey);
    throw error;
  }
};

const getDeploymentPreviewContainers = async (deploymentId: string) =>
  dockerClient.listContainers({
    all: true,
    filters: {
      label: [
        PREVIEW_RUNTIME_LABEL,
        `${PREVIEW_DEPLOYMENT_LABEL}=${sanitizeLabelValue(deploymentId)}`
      ]
    }
  });

const getContainerIp = (
  inspection: Awaited<ReturnType<Docker.Container["inspect"]>>
): string | null => {
  type NetworkInfo = { IPAddress?: string | null };
  type NetworkSettingsWithIp = { IPAddress?: string | null; Networks?: Record<string, NetworkInfo> };
  const preferredNetwork = config.runner.network?.trim();
  const networkSettings = (inspection.NetworkSettings ?? {}) as NetworkSettingsWithIp;
  const networks = networkSettings.Networks ?? {};
  if (preferredNetwork) {
    const preferred = networks[preferredNetwork];
    if (preferred?.IPAddress) return preferred.IPAddress;
  }

  for (const value of Object.values(networks)) {
    if (value?.IPAddress) return value.IPAddress;
  }

  return networkSettings.IPAddress || null;
};

const pruneExpiredPreviewContainers = async () => {
  const containers = await dockerClient.listContainers({
    all: true,
    filters: { label: [PREVIEW_RUNTIME_LABEL] }
  });

  const now = Date.now();
  await Promise.all(
    containers.map(async (container) => {
      const labels = container.Labels ?? {};
      const expiresAt = Number.parseInt(labels[PREVIEW_EXPIRES_LABEL] ?? "", 10);
      if (!Number.isFinite(expiresAt) || expiresAt > now) return;
      await removeContainerIfExists(container.Id);
    })
  );
};

export const ensureTrustedLocalPreviewContainer = async (
  deployment: DeploymentRecord
): Promise<{ baseUrl: string }> => {
  if (!config.runner.trustedLocalDocker) {
    throw new Error("Trusted local Docker previews are disabled");
  }
  if (!deployment.runtimeImageArtifactKey) {
    throw new Error("No runtime image artifact is available for this deployment");
  }

  await pruneExpiredPreviewContainers();

  const existing = await getDeploymentPreviewContainers(deployment.id);
  for (const entry of existing) {
    const inspection = await dockerClient.getContainer(entry.Id).inspect();
    if (!inspection.State?.Running) continue;
    const ip = getContainerIp(inspection);
    if (!ip) continue;
    const port = deployment.runtimeConfig?.port ?? 3000;
    return { baseUrl: `http://${ip}:${port}` };
  }

  const image = await extractLoadedImageName(deployment.runtimeImageArtifactKey);
  const port = deployment.runtimeConfig?.port ?? 3000;
  const labels = {
    [PREVIEW_RUNTIME_LABEL]: "true",
    [PREVIEW_DEPLOYMENT_LABEL]: sanitizeLabelValue(deployment.id),
    [PREVIEW_EXPIRES_LABEL]: String(Date.now() + PREVIEW_TTL_MS)
  };
  const container = await dockerClient.createContainer({
    name: `pdploy-preview-${sanitizeLabelValue(deployment.id).slice(0, 18)}-${randomUUID().slice(0, 6)}`,
    Image: image,
    Labels: labels,
    ExposedPorts: { [`${port}/tcp`]: {} },
    HostConfig: {
      AutoRemove: true,
      Memory: 1024 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      ReadonlyRootfs: false,
      NetworkMode: config.runner.network?.trim() || undefined
    }
  });

  try {
    await container.start();
    const inspection = await container.inspect();
    const ip = getContainerIp(inspection);
    if (!ip) {
      throw new Error("Trusted local Docker preview container does not have a reachable IP address");
    }
    return { baseUrl: `http://${ip}:${port}` };
  } catch (error) {
    await removeContainerIfExists(container.id);
    throw error;
  }
};
