import type Docker from "dockerode";

export type RuntimeConfig = {
  workingDir?: string;
  port: number;
  command: string[];
  framework?: "nextjs" | "node";
  env?: Record<string, string>;
};

const toContainerEnv = (runtimeConfig: RuntimeConfig): string[] => {
  const env: string[] = [];
  const extraEnv = runtimeConfig.env ?? {};
  for (const [key, value] of Object.entries(extraEnv)) {
    if (!key || key === "PORT") continue;
    env.push(`${key}=${value}`);
  }
  env.push(`PORT=${String(runtimeConfig.port)}`);
  return env;
};

export type PreviewStartupFailureStage =
  | "create"
  | "start"
  | "network"
  | "readiness"
  | "exited";

export type PreviewStartupFailure = {
  error: string;
  deploymentId: string;
  stage: PreviewStartupFailureStage;
  containerId?: string;
  containerName?: string;
  exitCode?: number;
  logs?: string;
};

export const PREVIEW_PROJECT_LABEL = "io.deployher.preview.project";

export const PREVIEW_STARTUP_REQUEST_TIMEOUT_MS = 2000;
export const PREVIEW_STARTUP_POLL_INTERVAL_MS = 500;
export const PREVIEW_STARTUP_MAX_ATTEMPTS = 120;
export const PREVIEW_STARTUP_LOG_TAIL = 120;

type NetworkEndpoint = { IPAddress?: string | null };

export const getContainerHost = (
  inspection: Awaited<ReturnType<Docker.Container["inspect"]>>,
  dockerNetwork?: string
): string | null => {
  const networks = (inspection.NetworkSettings?.Networks ?? {}) as Record<string, NetworkEndpoint>;
  if (dockerNetwork?.trim()) {
    const n = networks[dockerNetwork.trim()];
    if (n?.IPAddress) return n.IPAddress;
  }
  for (const net of Object.values(networks)) {
    if (net?.IPAddress) return net.IPAddress;
  }
  const rootNetworkIp = (inspection.NetworkSettings as NetworkEndpoint | undefined)?.IPAddress;
  return rootNetworkIp || null;
};

export const waitForHttp = async (
  baseUrl: string,
  maxAttempts = PREVIEW_STARTUP_MAX_ATTEMPTS,
  delayMs = PREVIEW_STARTUP_POLL_INTERVAL_MS
): Promise<boolean> => {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch(baseUrl, {
        method: "GET",
        signal: AbortSignal.timeout(PREVIEW_STARTUP_REQUEST_TIMEOUT_MS)
      });
      if (r.ok || r.status === 404 || r.status === 304) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
};

export const waitForPreviewHttpProbe = async (
  baseUrl: string,
  getRunningState: () => Promise<{ running: boolean; exitCode?: number }>,
  maxAttempts = PREVIEW_STARTUP_MAX_ATTEMPTS,
  delayMs = PREVIEW_STARTUP_POLL_INTERVAL_MS
): Promise<boolean> => {
  for (let i = 0; i < maxAttempts; i++) {
    const state = await getRunningState();
    if (!state.running) {
      return false;
    }
    try {
      const r = await fetch(baseUrl, {
        method: "GET",
        signal: AbortSignal.timeout(PREVIEW_STARTUP_REQUEST_TIMEOUT_MS)
      });
      if (r.ok || r.status === 404 || r.status === 304) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
};

export class PreviewStartupError extends Error {
  readonly details: PreviewStartupFailure;

  constructor(details: PreviewStartupFailure) {
    super(details.error);
    this.name = "PreviewStartupError";
    this.details = details;
  }
}

export const isPreviewStartupFailure = (value: unknown): value is PreviewStartupFailure => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate["error"] === "string" &&
    typeof candidate["deploymentId"] === "string" &&
    typeof candidate["stage"] === "string"
  );
};

export const formatPreviewStartupFailureText = (failure: PreviewStartupFailure): string => {
  const lines = [`${failure.error}`];
  if (typeof failure.exitCode === "number") {
    lines.push(`Exit code: ${failure.exitCode}`);
  }
  if (failure.logs?.trim()) {
    lines.push("");
    lines.push("Startup logs:");
    lines.push(failure.logs.trimEnd());
  }
  return `${lines.join("\n")}\n`;
};

export const buildPreviewStartupFailureMessage = (
  details: Omit<PreviewStartupFailure, "error">
): PreviewStartupFailure => {
  const stageLabel =
    details.stage === "create"
      ? "create the preview container"
      : details.stage === "start"
        ? "start the preview container"
        : details.stage === "network"
          ? "discover the preview container network address"
          : details.stage === "readiness"
            ? "wait for the preview server to become ready"
            : "keep the preview container running during startup";

  return {
    error: `Preview startup failed while trying to ${stageLabel}.`,
    ...details
  };
};

type EnsurePreviewContainerOptions = {
  deploymentId: string;
  projectId?: string;
  runtimeImagePullRef?: string;
  runtimeImageKey?: string;
  runtimeConfig: RuntimeConfig;
  ttlMs: number;
  memoryBytes: number;
  nanoCpus: number;
  dockerNetwork?: string;
  onRuntimeImageProgress?: (line: string) => void;
};

type EnsurePreviewContainerDeps = {
  dockerClient: {
    listContainers(options: unknown): Promise<Array<{ Id?: string }>>;
    getContainer(id: string): {
      inspect(): Promise<Awaited<ReturnType<Docker.Container["inspect"]>>>;
      start(): Promise<void>;
      logs(...args: unknown[]): unknown;
      id?: string;
    };
    createContainer(options: import("dockerode").ContainerCreateOptions): Promise<{
      id: string;
      start(): Promise<void>;
      inspect(): Promise<Awaited<ReturnType<Docker.Container["inspect"]>>>;
      logs(...args: unknown[]): unknown;
    }>;
  };
  pruneExpiredPreviewContainers(): Promise<void>;
  removeContainerIfExists(containerId: string): Promise<void>;
  resolvePreviewImageId(options: {
    runtimeImagePullRef?: string;
    runtimeImageKey?: string;
    onProgress?: (line: string) => void;
  }): Promise<string>;
  sanitizeLabelValue(value: string): string;
  waitForHttp?(baseUrl: string): Promise<boolean>;
  getContainerHost?(
    inspection: Awaited<ReturnType<Docker.Container["inspect"]>>,
    dockerNetwork?: string
  ): string | null;
  readContainerLogTail?(container: { logs(...args: unknown[]): unknown }): Promise<string>;
};

type DockerLogsCallback = (err: Error | null, result?: Buffer | NodeJS.ReadableStream) => void;

const bufferFromLogResult = async (result: Buffer | NodeJS.ReadableStream): Promise<Buffer> => {
  if (Buffer.isBuffer(result)) return result;
  const chunks: Buffer[] = [];
  for await (const chunk of result) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const defaultReadContainerLogTail = async (container: {
  logs(...args: unknown[]): unknown;
}): Promise<string> =>
  await new Promise<string>((resolve) => {
    container.logs(
      {
        stdout: true,
        stderr: true,
        follow: false,
        tail: PREVIEW_STARTUP_LOG_TAIL
      },
      async (err: Error | null, result?: Buffer | NodeJS.ReadableStream) => {
        if (err || !result) {
          resolve("");
          return;
        }
        try {
          const buffer = await bufferFromLogResult(result);
          resolve(buffer.toString("utf8").trim());
        } catch {
          resolve("");
        }
      }
    );
  });

const buildStartupFailure = async (
  details: Omit<PreviewStartupFailure, "error">,
  deps: Pick<EnsurePreviewContainerDeps, "readContainerLogTail">,
  container?: { logs(...args: unknown[]): unknown }
): Promise<PreviewStartupFailure> => {
  const readContainerLogTail = deps.readContainerLogTail ?? defaultReadContainerLogTail;
  const logs = details.logs?.trim() || (!container ? "" : (await readContainerLogTail(container)).trim());
  return buildPreviewStartupFailureMessage({
    ...details,
    logs: logs || undefined
  });
};

export const ensurePreviewContainerWithDeps = async (
  options: EnsurePreviewContainerOptions,
  deps: EnsurePreviewContainerDeps
): Promise<{ upstreamBase: string }> => {
  const {
    deploymentId,
    projectId,
    runtimeImagePullRef,
    runtimeImageKey,
    runtimeConfig,
    ttlMs,
    memoryBytes,
    nanoCpus,
    dockerNetwork
  } = options;
  const sanitizeLabelValue = deps.sanitizeLabelValue;
  const resolveHost = deps.getContainerHost ?? getContainerHost;
  const waitForUpstream = async (
    baseUrl: string,
    getRunningState?: () => Promise<{ running: boolean; exitCode?: number }>
  ): Promise<boolean> => {
    if (deps.waitForHttp) {
      return deps.waitForHttp(baseUrl);
    }
    if (getRunningState) {
      return waitForPreviewHttpProbe(baseUrl, getRunningState);
    }
    return waitForHttp(baseUrl);
  };
  const depSan = sanitizeLabelValue(deploymentId);
  const port = runtimeConfig.port ?? 3000;

  await deps.pruneExpiredPreviewContainers();

  const projectSan = projectId?.trim() ? sanitizeLabelValue(projectId.trim()) : "";
  if (projectSan) {
    const siblings = await deps.dockerClient.listContainers({
      all: true,
      filters: {
        label: ["io.deployher.preview=true", `${PREVIEW_PROJECT_LABEL}=${projectSan}`]
      }
    });
    for (const entry of siblings) {
      if (!entry.Id) continue;
      const labels = (entry as { Labels?: Record<string, string> }).Labels ?? {};
      const otherDep = labels["io.deployher.preview.deployment"] ?? "";
      if (!otherDep || otherDep === depSan) continue;
      await deps.removeContainerIfExists(entry.Id);
    }
  }

  const existing = await deps.dockerClient.listContainers({
    all: true,
    filters: {
      label: [
        "io.deployher.preview=true",
        `io.deployher.preview.deployment=${depSan}`
      ]
    }
  });

  for (const entry of existing) {
    if (!entry.Id) continue;
    const existingContainer = deps.dockerClient.getContainer(entry.Id);
    const inspection = await existingContainer.inspect();
    const labels = inspection.Config?.Labels ?? {};
    const expiresAt = Number.parseInt(labels["io.deployher.preview.expires_at"] ?? "", 10);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      await deps.removeContainerIfExists(entry.Id);
      continue;
    }
    if (!inspection.State?.Running) {
      await deps.removeContainerIfExists(entry.Id);
      continue;
    }
    const ip = resolveHost(inspection, dockerNetwork);
    if (!ip) {
      await deps.removeContainerIfExists(entry.Id);
      continue;
    }
    const base = `http://${ip}:${port}`;
    if (
      await waitForUpstream(`${base}/`, async () => {
        const inspection = await existingContainer.inspect();
        return {
          running: !!inspection.State?.Running,
          exitCode:
            typeof inspection.State?.ExitCode === "number" ? inspection.State.ExitCode : undefined
        };
      })
    ) {
      return { upstreamBase: base };
    }
    await deps.removeContainerIfExists(entry.Id);
  }

  const imageName = await deps.resolvePreviewImageId({
    runtimeImagePullRef,
    runtimeImageKey,
    onProgress: options.onRuntimeImageProgress
  });
  const expiresAt = Date.now() + ttlMs;
  const labels: Record<string, string> = {
    "io.deployher.preview": "true",
    "io.deployher.preview.deployment": depSan,
    "io.deployher.preview.expires_at": String(expiresAt),
    ...(projectSan ? { [PREVIEW_PROJECT_LABEL]: projectSan } : {})
  };

  const containerName = `deployher-preview-${depSan.slice(0, 24)}-${crypto.randomUUID().slice(0, 6)}`;
  const exposed: Record<string, Record<string, unknown>> = { [`${port}/tcp`]: {} };
  const hostConfig = {
    Memory: memoryBytes,
    NanoCpus: nanoCpus,
    ...(dockerNetwork?.trim() ? { NetworkMode: dockerNetwork.trim() } : {})
  };

  let container: Awaited<ReturnType<EnsurePreviewContainerDeps["dockerClient"]["createContainer"]>>;
  try {
    container = await deps.dockerClient.createContainer({
      name: containerName,
      Image: imageName,
      Labels: labels,
      ExposedPorts: exposed,
      Env: toContainerEnv(runtimeConfig),
      ...(runtimeConfig.command.length ? { Cmd: runtimeConfig.command } : {}),
      ...(runtimeConfig.workingDir ? { WorkingDir: runtimeConfig.workingDir } : {}),
      HostConfig: hostConfig
    });
  } catch {
    throw new PreviewStartupError(
      buildPreviewStartupFailureMessage({
        deploymentId,
        stage: "create",
        containerName
      })
    );
  }

  try {
    await container.start();
  } catch {
    const failure = await buildStartupFailure(
      {
        deploymentId,
        stage: "start",
        containerId: container.id,
        containerName
      },
      deps,
      container
    );
    await deps.removeContainerIfExists(container.id);
    throw new PreviewStartupError(failure);
  }

  const inspection = await container.inspect();
  const ip = resolveHost(inspection, dockerNetwork);
  if (!ip) {
    const failure = await buildStartupFailure(
      {
        deploymentId,
        stage: "network",
        containerId: container.id,
        containerName
      },
      deps,
      container
    );
    await deps.removeContainerIfExists(container.id);
    throw new PreviewStartupError(failure);
  }

  const base = `http://${ip}:${port}`;
  const ok = await waitForUpstream(`${base}/`, async () => {
    const inspection = await container.inspect();
    return {
      running: !!inspection.State?.Running,
      exitCode: typeof inspection.State?.ExitCode === "number" ? inspection.State.ExitCode : undefined
    };
  });
  if (ok) {
    return { upstreamBase: base };
  }

  const finalInspection = await container.inspect();
  const failure = await buildStartupFailure(
    {
      deploymentId,
      stage: finalInspection.State?.Running ? "readiness" : "exited",
      containerId: container.id,
      containerName,
      exitCode:
        typeof finalInspection.State?.ExitCode === "number" ? finalInspection.State.ExitCode : undefined
    },
    deps,
    container
  );
  await deps.removeContainerIfExists(container.id);
  throw new PreviewStartupError(failure);
};
