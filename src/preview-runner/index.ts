import "../env/bootstrap";
import { RedisClient, S3Client } from "bun";
import { randomUUID, timingSafeEqual } from "node:crypto";
import Docker from "dockerode";
import { PassThrough, Readable } from "node:stream";
import { finished } from "node:stream/promises";
import {
  assertAllowedPullRef,
  loadPreviewRuntimeRegistryConfig,
  PREVIEW_PREWARM_CHANNEL
} from "../preview";
import { sanitizeProxyResponseHeaders } from "../lib/proxyHeaders";
import {
  ensurePreviewContainerWithDeps,
  getContainerHost,
  type PreviewStartupFailure,
  PreviewStartupError,
  PREVIEW_STARTUP_LOG_TAIL,
  type RuntimeConfig,
  waitForHttp
} from "./core";

const DOCKER_SOCKET_PATH =
  (process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock").trim() || "/var/run/docker.sock";
const PREVIEW_LABEL_KEY = "io.deployher.preview";
const PREVIEW_DEPLOYMENT_LABEL = "io.deployher.preview.deployment";
const PREVIEW_EXPIRES_LABEL = "io.deployher.preview.expires_at";

const parsePort = (raw: string | undefined, fallback: number): number => {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
};

const parsePositiveInt = (raw: string | undefined, fallback: number): number => {
  if (!raw?.trim()) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const parseMemoryBytes = (raw: string | undefined, fallback: number): number => {
  if (!raw?.trim()) return fallback;
  const v = raw.trim().toLowerCase();
  const m = v.match(/^(\d+)([kmg]?)$/);
  if (!m?.[1]) return fallback;
  const n = Number.parseInt(m[1], 10);
  if (!Number.isFinite(n)) return fallback;
  const u = m[2] ?? "";
  const mult = u === "g" ? 1024 ** 3 : u === "m" ? 1024 ** 2 : u === "k" ? 1024 : 1;
  return n * mult;
};

const parseNanoCpus = (raw: string | undefined, fallback: number): number => {
  if (!raw?.trim()) return fallback;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n * 1_000_000_000) : fallback;
};

const sanitizeLabelValue = (value: string): string => value.replace(/[^A-Za-z0-9_.-]/g, "_");

const timingSafeEqualStr = (a: string, b: string): boolean => {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
};

type RegistryPullAuth = {
  username: string;
  password: string;
  serveraddress: string;
};

const resolveRegistryPullAuth = (): RegistryPullAuth | undefined => {
  const user = (process.env.NEXUS_USER ?? "").trim();
  const password = (process.env.NEXUS_PASSWORD ?? "").trim();
  if (!user || !password) return undefined;
  const cfg = loadPreviewRuntimeRegistryConfig();
  if (!cfg.registryHost.trim()) return undefined;
  const override = (process.env.PREVIEW_RUNTIME_REGISTRY_AUTH_ADDRESS ?? "").trim();
  const useHttps = (process.env.PREVIEW_RUNTIME_REGISTRY_HTTPS ?? "").trim() === "1";
  const serveraddress = override || `${useHttps ? "https" : "http"}://${cfg.registryHost}`;
  return { username: user, password, serveraddress };
};

const registryPullAuth = resolveRegistryPullAuth();
if (registryPullAuth) {
  console.log(`preview-runner: registry pull auth enabled for ${registryPullAuth.serveraddress}`);
}

const getS3Client = (): S3Client | null => {
  const endpoint = (process.env.S3_ENDPOINT ?? "").trim();
  const bucket = (process.env.S3_BUCKET ?? process.env.AWS_BUCKET ?? "").trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID ?? process.env.AWS_ACCESS_KEY_ID ?? "").trim();
  const secretAccessKey = (
    process.env.S3_SECRET_ACCESS_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? ""
  ).trim();
  const region = (process.env.S3_REGION ?? process.env.AWS_REGION ?? "garage").trim() || "garage";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return new S3Client({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    virtualHostedStyle: false
  });
};

const readDockerLoadOutput = async (stream: NodeJS.ReadableStream): Promise<string> => {
  const chunks: Buffer[] = [];
  stream.on("data", (c: Buffer) => chunks.push(c));
  await finished(stream);
  return Buffer.concat(chunks).toString("utf8");
};

const dockerClient = new Docker({ socketPath: DOCKER_SOCKET_PATH });
const loadImageCache = new Map<string, Promise<string>>();
const pullImageCache = new Map<string, Promise<void>>();

const extractImageNameFromLoadOutput = (output: string, fallbackTag: string): string => {
  const loadedMatch = output.match(/Loaded image:\s+([^\s]+)/i);
  if (loadedMatch?.[1]) return loadedMatch[1];
  return fallbackTag;
};

const loadImageFromS3Key = async (artifactKey: string): Promise<string> => {
  const cached = loadImageCache.get(artifactKey);
  if (cached) return cached;

  const client = getS3Client();
  if (!client) throw new Error("S3 is not configured for preview runner");

  const promise = (async () => {
    const stream = client.file(artifactKey).stream();
    const nodeReadable = Readable.fromWeb(stream as unknown as import("stream/web").ReadableStream);
    const loadStream = await dockerClient.loadImage(nodeReadable as NodeJS.ReadableStream);
    const output = await readDockerLoadOutput(loadStream as NodeJS.ReadableStream);
    const fallbackTag = `deployher-preview:${sanitizeLabelValue(artifactKey).slice(-40)}_${randomUUID().slice(0, 8)}`;
    return extractImageNameFromLoadOutput(output, fallbackTag);
  })();

  loadImageCache.set(artifactKey, promise);
  try {
    return await promise;
  } catch (e) {
    loadImageCache.delete(artifactKey);
    throw e;
  }
};

const ensureImagePulled = async (pullRef: string): Promise<void> => {
  const ref = pullRef.trim();
  const cfg = loadPreviewRuntimeRegistryConfig();
  assertAllowedPullRef(ref, cfg);
  const cached = pullImageCache.get(ref);
  if (cached) return cached;

  const pullOpts = registryPullAuth ? { authconfig: registryPullAuth } : {};

  const promise = new Promise<void>((resolve, reject) => {
    dockerClient.pull(ref, pullOpts, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) {
        reject(err);
        return;
      }
      if (!stream) {
        reject(new Error("docker pull returned no stream"));
        return;
      }
      dockerClient.modem.followProgress(stream, (err2: Error | null) => {
        if (err2) reject(err2);
        else resolve();
      });
    });
  });

  pullImageCache.set(ref, promise);
  try {
    await promise;
  } catch (e) {
    pullImageCache.delete(ref);
    throw e;
  }
};

const removeContainerIfExists = async (containerId: string) => {
  try {
    await dockerClient.getContainer(containerId).remove({ force: true });
  } catch {
    // ignore
  }
};

const pruneExpiredPreviewContainers = async () => {
  const containers = await dockerClient.listContainers({
    all: true,
    filters: { label: [`${PREVIEW_LABEL_KEY}=true`] }
  });
  const now = Date.now();
  await Promise.all(
    containers.map(async (c) => {
      const labels = c.Labels ?? {};
      const expiresAt = Number.parseInt(labels[PREVIEW_EXPIRES_LABEL] ?? "", 10);
      if (!Number.isFinite(expiresAt) || expiresAt > now) return;
      if (c.Id) await removeContainerIfExists(c.Id);
    })
  );
};

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host"
]);

const resolvePreviewContainerWorkingDir = (raw: string | undefined): string | undefined => {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === "." || trimmed === "./") return undefined;
  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return normalized;
  const tail = normalized.replace(/^\.\/+/, "");
  const segments = tail.split("/").filter(Boolean);
  if (segments.some((s) => s === "..")) {
    throw new Error("runtime workingDir must not use .. segments");
  }
  return `/workspace/${segments.join("/")}`;
};

const resolvePreviewContainerCommand = (command: string[] | undefined): string[] | undefined => {
  if (!command?.length) return undefined;
  if (command.length === 1 && command[0] === "noop") return undefined;
  return command;
};

const resolvePreviewImageId = async (options: {
  runtimeImagePullRef?: string;
  runtimeImageKey?: string;
}): Promise<string> => {
  const pullRef = options.runtimeImagePullRef?.trim() ?? "";
  const key = options.runtimeImageKey?.trim() ?? "";
  if (pullRef && key) {
    throw new Error("Conflicting runtime image headers");
  }
  if (pullRef) {
    await ensureImagePulled(pullRef);
    return pullRef;
  }
  if (key) {
    return loadImageFromS3Key(key);
  }
  throw new Error("No runtime image reference provided");
};

const findRunningPreviewContainerId = async (deploymentId: string): Promise<string | null> => {
  const depSan = sanitizeLabelValue(deploymentId);
  await pruneExpiredPreviewContainers();
  const existing = await dockerClient.listContainers({
    all: true,
    filters: {
      label: [`${PREVIEW_LABEL_KEY}=true`, `${PREVIEW_DEPLOYMENT_LABEL}=${depSan}`]
    }
  });
  for (const entry of existing) {
    if (!entry.Id) continue;
    const inspection = await dockerClient.getContainer(entry.Id).inspect();
    if (!inspection.State?.Running) continue;
    const labels = inspection.Config?.Labels ?? {};
    const expiresAt = Number.parseInt(labels[PREVIEW_EXPIRES_LABEL] ?? "", 10);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) continue;
    return entry.Id;
  }
  return null;
};

const startupFailureCache = new Map<string, { failure: PreviewStartupFailure; recordedAt: number }>();

const rememberStartupFailure = (failure: PreviewStartupFailure) => {
  startupFailureCache.set(failure.deploymentId, {
    failure,
    recordedAt: Date.now()
  });
};

const clearStartupFailure = (deploymentId: string) => {
  startupFailureCache.delete(deploymentId);
};

const getRecentStartupFailure = (deploymentId: string, ttlMs: number): PreviewStartupFailure | null => {
  const entry = startupFailureCache.get(deploymentId);
  if (!entry) return null;
  if (Date.now() - entry.recordedAt > ttlMs) {
    startupFailureCache.delete(deploymentId);
    return null;
  }
  return entry.failure;
};

const matchRuntimeLogsPath = (pathname: string): string | null => {
  const m = pathname.match(/^\/internal\/runtime-logs\/([^/]+)$/);
  return m?.[1]?.trim() ? m[1].trim() : null;
};

const parseRuntimeLogTail = (raw: string | null): number => {
  if (!raw) return 500;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 500;
  return Math.min(n, 10_000);
};

const dockerLogsToMergedTextStream = (
  logStream: NodeJS.ReadableStream,
  onCleanup: (fn: () => void) => void
): Readable => {
  const merged = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const writeStdout = (chunk: Buffer) => {
    if (!merged.destroyed) merged.write(chunk);
  };
  const writeStderr = (chunk: Buffer) => {
    if (!merged.destroyed) merged.write(chunk);
  };
  stdout.on("data", writeStdout);
  stderr.on("data", writeStderr);
  dockerClient.modem.demuxStream(logStream, stdout, stderr);

  const cleanup = () => {
    stdout.off("data", writeStdout);
    stderr.off("data", writeStderr);
    try {
      (logStream as NodeJS.ReadableStream & { destroy?: () => void }).destroy?.();
    } catch {
      /* ignore */
    }
    stdout.destroy();
    stderr.destroy();
    merged.destroy();
  };
  onCleanup(cleanup);

  void finished(logStream)
    .catch(() => {})
    .finally(() => {
      if (!merged.destroyed) merged.end();
    });

  return merged;
};

const serveRuntimeLogs = async (req: Request, deploymentId: string): Promise<Response> => {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);
  const follow =
    url.searchParams.get("follow") === "1" || url.searchParams.get("follow") === "true";
  const tail = parseRuntimeLogTail(url.searchParams.get("tail"));

  const containerId = await findRunningPreviewContainerId(deploymentId);
  if (!containerId) {
    const startupFailure = getRecentStartupFailure(deploymentId, previewTtlMs);
    if (startupFailure) {
      return new Response(JSON.stringify(startupFailure), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }
    return new Response("No running preview container for this deployment.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  const container = dockerClient.getContainer(containerId);
  const baseOpts = {
    stdout: true,
    stderr: true,
    timestamps: true,
    tail
  } as const;

  if (!follow) {
    let buffer: Buffer;
    try {
      buffer = await new Promise<Buffer>((resolve, reject) => {
        container.logs({ ...baseOpts, follow: false }, (err, result) => {
          if (err) {
            reject(err);
            return;
          }
          if (Buffer.isBuffer(result)) {
            resolve(result);
            return;
          }
          reject(new Error("docker logs returned unexpected result"));
        });
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to open container logs";
      console.error("runtime-logs docker:", e);
      return new Response(message, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    const logStream = Readable.from([buffer]);
    const merged = dockerLogsToMergedTextStream(logStream, () => {});
    const text = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      merged.on("data", (c: Buffer) => chunks.push(Buffer.from(c)));
      merged.once("error", reject);
      merged.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

    return new Response(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  }

  let logStream: NodeJS.ReadableStream;
  try {
    logStream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
      container.logs({ ...baseOpts, follow: true }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        if (!stream) {
          reject(new Error("docker logs returned no stream"));
          return;
        }
        resolve(stream);
      });
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to open container logs";
    console.error("runtime-logs docker:", e);
    return new Response(message, {
      status: 500,
      headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }

  let disposeFollow: (() => void) | null = null;
  const merged = dockerLogsToMergedTextStream(logStream, (fn) => {
    disposeFollow = fn;
  });

  const onAbort = () => {
    const d = disposeFollow;
    disposeFollow = null;
    if (d) (d as () => void)();
  };
  req.signal.addEventListener("abort", onAbort, { once: true });
  merged.once("close", () => {
    req.signal.removeEventListener("abort", onAbort);
  });

  const webBody = Readable.toWeb(merged) as unknown as ReadableStream<Uint8Array>;
  return new Response(webBody, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
};

const ensurePreviewContainer = async (options: {
  deploymentId: string;
  projectId?: string;
  runtimeImagePullRef?: string;
  runtimeImageKey?: string;
  runtimeConfig: RuntimeConfig;
  ttlMs: number;
  memoryBytes: number;
  nanoCpus: number;
  dockerNetwork?: string;
}): Promise<{ upstreamBase: string }> => {
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
  const normalizedRuntimeConfig: RuntimeConfig = {
    ...runtimeConfig,
    workingDir: resolvePreviewContainerWorkingDir(runtimeConfig.workingDir),
    command: resolvePreviewContainerCommand(runtimeConfig.command) ?? []
  };
  const result = await ensurePreviewContainerWithDeps(
    {
      deploymentId,
      projectId,
      runtimeImagePullRef,
      runtimeImageKey,
      runtimeConfig: normalizedRuntimeConfig,
      ttlMs,
      memoryBytes,
      nanoCpus,
      dockerNetwork
    },
    {
      dockerClient,
      pruneExpiredPreviewContainers,
      removeContainerIfExists,
      resolvePreviewImageId,
      sanitizeLabelValue,
      waitForHttp,
      getContainerHost,
      readContainerLogTail: async (container) =>
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
                const chunks: Buffer[] = [];
                if (Buffer.isBuffer(result)) {
                  chunks.push(result);
                } else {
                  for await (const chunk of result) {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                  }
                }
                resolve(Buffer.concat(chunks).toString("utf8").trim());
              } catch {
                resolve("");
              }
            }
          );
        })
    }
  );
  clearStartupFailure(deploymentId);
  return result;
};

const parseRuntimeConfigPayload = (v: unknown): RuntimeConfig | null => {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const port = typeof o.port === "number" && Number.isFinite(o.port) ? o.port : 3000;
  const command = Array.isArray(o.command)
    ? o.command.filter((x): x is string => typeof x === "string")
    : [];
  const workingDir = typeof o.workingDir === "string" ? o.workingDir : undefined;
  const framework =
    o.framework === "nextjs" || o.framework === "node" ? o.framework : undefined;
  const env =
    o.env && typeof o.env === "object" && !Array.isArray(o.env)
      ? Object.fromEntries(
          Object.entries(o.env as Record<string, unknown>).filter(
            (entry): entry is [string, string] =>
              typeof entry[0] === "string" && typeof entry[1] === "string"
          )
        )
      : undefined;
  return { port, command, workingDir, framework, env };
};

const parseRuntimeConfigHeader = (raw: string | null): RuntimeConfig | null => {
  if (!raw?.trim()) return null;
  try {
    return parseRuntimeConfigPayload(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

const matchPreviewPath = (pathname: string): { deploymentId: string; assetPath: string } | null => {
  const m = pathname.match(/^\/preview\/([^/]+)(?:\/(.*))?$/);
  if (!m?.[1]) return null;
  return { deploymentId: m[1], assetPath: m[2] ?? "" };
};

const runPreviewImageGc = async (): Promise<void> => {
  const maxAgeMs = parsePositiveInt(process.env.PREVIEW_RUNNER_IMAGE_MAX_AGE_MS, 7 * 24 * 60 * 60 * 1000);
  const cfg = loadPreviewRuntimeRegistryConfig();
  const needle = `/${cfg.dockerRepo}/${cfg.imageName}`;
  const containers = await dockerClient.listContainers({ all: true });
  const usedIds = new Set<string>();
  for (const c of containers) {
    if (c.ImageID) usedIds.add(c.ImageID);
  }
  const images = await dockerClient.listImages();
  const now = Date.now();
  for (const img of images) {
    const id = img.Id;
    if (!id || usedIds.has(id)) continue;
    const createdSec = typeof img.Created === "number" ? img.Created : 0;
    const createdMs = createdSec > 0 ? createdSec * 1000 : 0;
    if (!createdMs || now - createdMs < maxAgeMs) continue;
    const labels = img.Labels ?? {};
    const tags = img.RepoTags ?? [];
    const isRuntime = labels["io.deployher.runtime"] === "true";
    const matchesName = tags.some((t) => t.includes(needle));
    if (!isRuntime && !matchesName) continue;
    try {
      await dockerClient.getImage(id).remove({ force: true });
    } catch {
      // ignore
    }
  }
};

const gcIntervalMs = parsePositiveInt(process.env.PREVIEW_RUNNER_IMAGE_GC_INTERVAL_MS, 15 * 60 * 1000);
setInterval(() => {
  void runPreviewImageGc().catch((e) => console.error("preview-runner image GC:", e));
}, gcIntervalMs);

const startRedisPrewarmSubscriber = async (): Promise<void> => {
  const url = (process.env.REDIS_URL ?? "").trim();
  if (!url) return;
  try {
    const client = new RedisClient(url);
    client.onclose = (err: unknown) => console.error("preview-runner redis prewarm client closed", err);
    await client.connect();
    const sub = await client.duplicate();
    await sub.subscribe(PREVIEW_PREWARM_CHANNEL, (message: string) => {
      if (!message?.trim()) return;
      try {
        const o = JSON.parse(message) as { pullRef?: string };
        const pullRef = o.pullRef?.trim();
        if (!pullRef) return;
        const cfg = loadPreviewRuntimeRegistryConfig();
        assertAllowedPullRef(pullRef, cfg);
        void ensureImagePulled(pullRef).catch((e) =>
          console.error("preview-runner redis prewarm pull failed:", e)
        );
      } catch (e) {
        console.error("preview-runner redis prewarm message:", e);
      }
    });
    console.log("preview-runner: subscribed to Redis prewarm channel");
  } catch (e) {
    console.error("preview-runner: Redis prewarm subscriber failed:", e);
  }
};

void startRedisPrewarmSubscriber();

const port = parsePort(process.env.PORT, 8787);
const sharedSecret = (process.env.RUNNER_SHARED_SECRET ?? "").trim();
const previewTtlMs = parsePositiveInt(process.env.PREVIEW_TTL_MS, 30 * 60 * 1000);
const previewMemoryBytes = parseMemoryBytes(process.env.PREVIEW_MEMORY_BYTES, 1024 ** 3);
const previewNanoCpus = parseNanoCpus(process.env.PREVIEW_NANO_CPUS, 1_000_000_000);
const dockerNetwork = (process.env.RUNNER_DOCKER_NETWORK ?? "").trim();

console.log(`deployher preview-runner listening on :${port}`);

Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(req, server) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "deployher-preview-runner" });
    }

    if (url.pathname.startsWith("/preview/") || url.pathname.startsWith("/internal/runtime-logs/")) {
      server.timeout(req, 0);
    }

    if (sharedSecret) {
      const got = req.headers.get("x-deployher-runner-secret") ?? "";
      if (!timingSafeEqualStr(got, sharedSecret)) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const runtimeLogsDeploymentId = matchRuntimeLogsPath(url.pathname);
    if (runtimeLogsDeploymentId) {
      try {
        return await serveRuntimeLogs(req, runtimeLogsDeploymentId);
      } catch (e) {
        console.error("runtime-logs:", e);
        return new Response("Failed to read container logs", { status: 500 });
      }
    }

    if (url.pathname === "/internal/prewarm" && req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const o = body as { pullRef?: string };
      const pullRef = o.pullRef?.trim() ?? "";
      if (!pullRef) {
        return new Response(JSON.stringify({ error: "Missing pullRef" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      try {
        const cfg = loadPreviewRuntimeRegistryConfig();
        assertAllowedPullRef(pullRef, cfg);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Invalid pullRef";
        return new Response(JSON.stringify({ error: message }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      void ensureImagePulled(pullRef).catch((err) =>
        console.error("preview-runner prewarm pull failed:", err)
      );
      return new Response(null, { status: 202 });
    }

    if (url.pathname === "/internal/ensure-preview" && req.method === "POST") {
      let body: unknown;
      try {
        body = await req.json();
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const o = body as Record<string, unknown>;
      const deploymentId = typeof o.deploymentId === "string" ? o.deploymentId.trim() : "";
      const projectId = typeof o.projectId === "string" ? o.projectId.trim() : "";
      const pullRef = typeof o.runtimeImagePullRef === "string" ? o.runtimeImagePullRef.trim() : "";
      const artifactKey =
        typeof o.runtimeImageArtifactKey === "string" ? o.runtimeImageArtifactKey.trim() : "";
      const runtimeConfig = parseRuntimeConfigPayload(o.runtimeConfig);
      if (!deploymentId) {
        return new Response(JSON.stringify({ error: "Missing deploymentId" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      if ((!pullRef && !artifactKey) || (pullRef && artifactKey)) {
        return new Response(
          JSON.stringify({ error: "Provide exactly one of runtimeImagePullRef or runtimeImageArtifactKey" }),
          {
            status: 400,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      if (!runtimeConfig) {
        return new Response(JSON.stringify({ error: "Invalid or missing runtimeConfig" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const normalizedRuntimeConfig: RuntimeConfig = {
        ...runtimeConfig,
        workingDir: resolvePreviewContainerWorkingDir(runtimeConfig.workingDir),
        command: resolvePreviewContainerCommand(runtimeConfig.command) ?? []
      };

      void ensurePreviewContainer({
        deploymentId,
        projectId: projectId || undefined,
        runtimeImagePullRef: pullRef || undefined,
        runtimeImageKey: artifactKey || undefined,
        runtimeConfig: normalizedRuntimeConfig,
        ttlMs: previewTtlMs,
        memoryBytes: previewMemoryBytes,
        nanoCpus: previewNanoCpus,
        dockerNetwork: dockerNetwork || undefined
      })
        .then(() => {
          console.log(`preview-runner: ensured preview container for deployment ${deploymentId}`);
        })
        .catch((err) => {
          console.error(`preview-runner: ensure-preview failed for ${deploymentId}:`, err);
        });

      return new Response(null, { status: 202 });
    }

    const matched = matchPreviewPath(url.pathname);
    if (!matched) {
      return new Response("Not found", { status: 404 });
    }

    const runtimeImagePullRef = req.headers.get("x-deployher-runtime-image-pull-ref")?.trim() ?? "";
    const runtimeImageKey = req.headers.get("x-deployher-runtime-image-key")?.trim() ?? "";
    const runtimeConfig = parseRuntimeConfigHeader(req.headers.get("x-deployher-runtime-config"));
    if (!runtimeImagePullRef && !runtimeImageKey) {
      return new Response(
        JSON.stringify({
          error: "Missing x-deployher-runtime-image-pull-ref or x-deployher-runtime-image-key"
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (runtimeImagePullRef && runtimeImageKey) {
      return new Response(
        JSON.stringify({ error: "Conflicting runtime image headers" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
    if (!runtimeConfig) {
      return new Response(JSON.stringify({ error: "Invalid or missing x-deployher-runtime-config" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    const projectIdHeader = req.headers.get("x-deployher-project-id")?.trim() ?? "";

    let upstreamBase: string;
    try {
      const ensured = await ensurePreviewContainer({
        deploymentId: matched.deploymentId,
        projectId: projectIdHeader || undefined,
        runtimeImagePullRef: runtimeImagePullRef || undefined,
        runtimeImageKey: runtimeImageKey || undefined,
        runtimeConfig,
        ttlMs: previewTtlMs,
        memoryBytes: previewMemoryBytes,
        nanoCpus: previewNanoCpus,
        dockerNetwork: dockerNetwork || undefined
      });
      upstreamBase = ensured.upstreamBase;
    } catch (err) {
      console.error("preview-runner ensure container:", err);
      if (err instanceof PreviewStartupError) {
        rememberStartupFailure(err.details);
        return new Response(JSON.stringify(err.details), {
          status: 503,
          headers: { "Content-Type": "application/json" }
        });
      }
      const message = err instanceof Error ? err.message : "Preview unavailable";
      return new Response(JSON.stringify({ error: message }), {
        status: 503,
        headers: { "Content-Type": "application/json" }
      });
    }

    const pathSeg = matched.assetPath.replace(/^\/+/, "");
    const upstreamUrl = new URL(pathSeg || "/", `${upstreamBase.replace(/\/$/, "")}/`);
    upstreamUrl.search = url.search;

    const outHeaders = new Headers();
    for (const [k, v] of req.headers) {
      if (HOP_BY_HOP.has(k.toLowerCase())) continue;
      if (k.toLowerCase().startsWith("x-deployher-")) continue;
      outHeaders.set(k, v);
    }
    const forwardedHost = outHeaders.get("x-forwarded-host")?.split(",")[0]?.trim();
    if (forwardedHost) {
      outHeaders.set("host", forwardedHost);
    } else {
      outHeaders.delete("host");
    }

    try {
      const upstreamResponse = await fetch(upstreamUrl, {
        method: req.method,
        headers: outHeaders,
        ...(req.method === "GET" || req.method === "HEAD" ? {} : { body: req.body }),
        redirect: "manual",
        signal: AbortSignal.timeout(600_000)
      });
      return new Response(upstreamResponse.body, {
        status: upstreamResponse.status,
        headers: sanitizeProxyResponseHeaders(upstreamResponse.headers)
      });
    } catch (err) {
      console.error("preview-runner proxy:", err);
      return new Response(JSON.stringify({ error: "Upstream preview failed" }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
});

const schedulePreviewRehydrateTriggerFromApp = (): void => {
  const url = (process.env.PREVIEW_REHYDRATE_TRIGGER_URL ?? "").trim();
  if (!url) {
    return;
  }
  const secret = (process.env.RUNNER_SHARED_SECRET ?? "").trim();
  const attempt = (n: number): void => {
    void (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(secret ? { "x-deployher-runner-secret": secret } : {})
          },
          body: "{}",
          signal: AbortSignal.timeout(15_000)
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        console.log("preview-runner: app preview rehydrate trigger accepted");
      } catch (e) {
        if (n < 6) {
          setTimeout(() => attempt(n + 1), 4000);
        } else {
          console.error("preview-runner: app preview rehydrate trigger failed after retries:", e);
        }
      }
    })();
  };
  setTimeout(() => attempt(1), 5000);
};

schedulePreviewRehydrateTriggerFromApp();
