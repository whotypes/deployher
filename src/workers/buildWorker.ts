import Docker from "dockerode";
import { and, eq, sql } from "drizzle-orm";
import { cp, mkdir, mkdtemp, readdir, rm, stat } from "fs/promises";
import { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { tmpdir } from "os";
import path from "path";
import { getBuildContainerConfig, type BuildContainerConfig } from "../admin/buildSettings";
import { buildDevSubdomainUrl, config } from "../config";
import {
  DOCKER_DEPLOYMENT_LABEL_KEY,
  sanitizeDockerLabelValue
} from "../docker/buildContainerCleanup";
import { publishDeploymentEvent } from "../deploymentEvents";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { parseExampleRepoUrl, resolveLocalExample } from "../examples";
import { buildZipballUrl, parseGitHubRepoUrl } from "../github";
import { refreshProjectSiteMetadata } from "../lib/projectSiteMetadata";
import {
  buildPreviewManifestKey,
  cachePreviewManifest,
  createPreviewManifest,
  type PreviewManifest
} from "../lib/previewServe";
import {
  ackDeployment,
  dequeueDeployment,
  reclaimDeployment,
  touchPendingDeployment,
  type DeploymentJob
} from "../queue";
import { consumeRepoCredential } from "../repoCredentials";
import { isStorageConfigured, upload } from "../storage";
import { parseEnvFileContent } from "../lib/parseEnvFileContent";
import { parseStoredProjectCommandForBuild } from "../lib/parseProjectCommandLine";
import { mergeBuildProjectConfigWithRepoDeployherToml } from "../lib/repoDeployherConfig";
import { requestRunnerEnsurePreview } from "../lib/previewRunnerRehydrate";
import { onDeploymentTerminalStatus } from "../lib/projectAlerts";
import {
  buildRuntimeImageTagOnly,
  notifyPreviewRunnersPrewarm,
  requireNexusCredentialsForRuntimePush,
  requirePreviewRuntimeRegistryForPush
} from "../preview";
import {
  resolveProjectRoots,
  sanitizeRelativeWorkdir,
  type RuntimeImageMode
} from "../lib/projectPaths";
import { guessContentType } from "../utils/contentType";
import { detectFrameworkRecord, LocalFileSystemDetector } from "@vercel/fs-detectors";
import { frameworkList } from "@vercel/frameworks";
import { detectBuildStrategy } from "./build/registry";
import type {
  BuildRuntime,
  DeploymentBuildStrategy,
  PreviewResolution,
  RunCommandResult,
  RuntimeConfig,
  RuntimeImageMode as WorkerRuntimeImageMode,
  ServeStrategy
} from "./build/types";
import {
  getEffectivePendingHeartbeatMs,
  hasFreshWorkerHeartbeat
} from "./workerTiming";
import { resolveBuildContainerImage } from "./build/containerImages";

const buildPreviewUrl = (shortId: string) =>
  buildDevSubdomainUrl(shortId);

const resolveCanonicalServeStrategy = (
  previewMode: typeof schema.projects.$inferSelect.previewMode,
  resolvedServeStrategy: ServeStrategy
): ServeStrategy => {
  if (previewMode === "server" || previewMode === "static") {
    return previewMode;
  }
  return resolvedServeStrategy;
};

const MAX_DEPLOYMENT_ENV_FILE_BYTES = 64 * 1024;

const DOCKER_MANAGED_LABEL = "io.deployher.build=true";
const DOCKER_RUNTIME_LABEL = "io.deployher.runtime=true";
const DOCKER_NODE_IMAGE = resolveBuildContainerImage("node");
const DOCKER_BUN_IMAGE = resolveBuildContainerImage("bun");
const DOCKER_PYTHON_IMAGE = resolveBuildContainerImage("python");
const RUNTIME_STATIC_BASE_IMAGE = (process.env.RUNTIME_STATIC_BASE_IMAGE ?? "nginx:alpine").trim();
const BUILD_WORKDIR_ROOT = (process.env.BUILD_WORKDIR ?? path.join(tmpdir(), "deployher-builds")).trim();
const DOCKER_SOCKET_PATH = (process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock").trim() || "/var/run/docker.sock";
const CONTAINER_REPO_DIR = "/workspace";
const BUILD_RECLAIM_IDLE_MS = config.build.reclaimIdleMs;
const BUILD_PENDING_HEARTBEAT_MS = config.build.pendingHeartbeatMs;
const BUILD_COMMAND_INACTIVITY_TIMEOUT_MS = Number.parseInt(
  process.env.BUILD_COMMAND_INACTIVITY_TIMEOUT_MS ?? "30000",
  10
);
const PREVIEW_RUNTIME_PUSH_INACTIVITY_TIMEOUT_MS = Number.parseInt(
  process.env.PREVIEW_RUNTIME_PUSH_INACTIVITY_TIMEOUT_MS ?? "300000",
  10
);
const DOCKER_LONG_BUILD_INACTIVITY_TIMEOUT_MS = Number.parseInt(
  process.env.DOCKER_LONG_BUILD_INACTIVITY_TIMEOUT_MS ?? "300000",
  10
);

const EFFECTIVE_BUILD_PENDING_HEARTBEAT_MS = getEffectivePendingHeartbeatMs(
  BUILD_RECLAIM_IDLE_MS,
  BUILD_PENDING_HEARTBEAT_MS
);
const RUNTIME_BUILD_ARG_ALLOWLIST = ["NEXUS_REGISTRY"] as const;

type BuildContext = {
  repoDir: string;
  artifactPrefix: string;
  deploymentId: string;
  logs: string[];
  buildLogKey: string;
  scheduleLogFlush: (delayMs?: number) => void;
};

type StrategyRuntimeId = Exclude<DeploymentBuildStrategy, "unknown">;
type RegistryRuntimeArtifact = {
  ref: string;
  pullRef: string;
  artifactKey: null;
};

const isPreviewRuntimePushCommand = (cmd: string[]): boolean =>
  cmd[0] === "docker" && cmd[1] === "push";

const isPreviewRuntimeInspectCommand = (cmd: string[]): boolean =>
  cmd[0] === "docker" &&
  cmd[1] === "inspect" &&
  cmd.some((part) => part.includes(".RepoDigests"));

const isPreviewRuntimeDockerBuildCommand = (cmd: string[]): boolean =>
  cmd[0] === "docker" && cmd[1] === "build";

export const resolveHostCommandInactivityTimeoutMs = (cmd: string[]): number => {
  if (isPreviewRuntimePushCommand(cmd) || isPreviewRuntimeInspectCommand(cmd)) {
    return PREVIEW_RUNTIME_PUSH_INACTIVITY_TIMEOUT_MS;
  }
  if (isPreviewRuntimeDockerBuildCommand(cmd)) {
    if (
      !Number.isFinite(DOCKER_LONG_BUILD_INACTIVITY_TIMEOUT_MS) ||
      DOCKER_LONG_BUILD_INACTIVITY_TIMEOUT_MS <= 0
    ) {
      return BUILD_COMMAND_INACTIVITY_TIMEOUT_MS;
    }
    return DOCKER_LONG_BUILD_INACTIVITY_TIMEOUT_MS;
  }
  return BUILD_COMMAND_INACTIVITY_TIMEOUT_MS;
};

const isLongQuietPackageBuildCommand = (cmd: string[]): boolean => {
  const j = cmd.join(" ").toLowerCase();
  return (
    /\bnext\s+build\b/.test(j) ||
    /\bnpx\s+next\s+build\b/.test(j) ||
    /\bbun\s+run\s+build\b/.test(j) ||
    /\bnpm\s+run\s+build\b/.test(j) ||
    /\bpnpm\s+run\s+build\b/.test(j) ||
    /\byarn\s+run\s+build\b/.test(j) ||
    /\byarn\s+build\b/.test(j)
  );
};

export const resolveDockerCommandInactivityTimeoutMs = (cmd: string[]): number => {
  if (!isLongQuietPackageBuildCommand(cmd)) {
    return BUILD_COMMAND_INACTIVITY_TIMEOUT_MS;
  }
  if (
    !Number.isFinite(DOCKER_LONG_BUILD_INACTIVITY_TIMEOUT_MS) ||
    DOCKER_LONG_BUILD_INACTIVITY_TIMEOUT_MS <= 0
  ) {
    return BUILD_COMMAND_INACTIVITY_TIMEOUT_MS;
  }
  return DOCKER_LONG_BUILD_INACTIVITY_TIMEOUT_MS;
};

export const resolveDeploymentTerminalStatus = (options: {
  status: "success" | "failed";
  serveStrategy: ServeStrategy;
  runtimeImagePullRef: string | null;
  runtimeImageArtifactKey: string | null;
}): "success" | "failed" => {
  if (options.status !== "success") return options.status;
  if (options.serveStrategy !== "server") return options.status;
  const hasRuntimeImage =
    Boolean(options.runtimeImagePullRef?.trim()) || Boolean(options.runtimeImageArtifactKey?.trim());
  return hasRuntimeImage ? "success" : "failed";
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const buildEphemeralContainerName = (deploymentId: string) => {
  const normalizedId = deploymentId.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 12) || "job";
  const suffix = Math.random().toString(36).slice(2, 8);
  return `deployher-deploy-step-${normalizedId}-${suffix}`;
};

const buildConsumerName = (): string => {
  const rawHost = Bun.env.HOSTNAME ?? process.env.HOSTNAME ?? "worker";
  const host = rawHost.replace(/[^A-Za-z0-9_.-]/g, "_");
  return `${host}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
};

const publishDeploymentLog = (deploymentId: string, content: string): void => {
  publishDeploymentEvent(deploymentId, { type: "log", content })
    .catch(() => {});
};

const logLine = (ctx: BuildContext, line: string) => {
  const formatted = `[${new Date().toISOString()}] ${line}\n`;
  ctx.logs.push(formatted);
  ctx.scheduleLogFlush();
  publishDeploymentLog(ctx.deploymentId, formatted);
};

const appendBuildLogChunk = (ctx: BuildContext, content: string) => {
  if (!content) return;
  ctx.logs.push(content);
  ctx.scheduleLogFlush();
  publishDeploymentLog(ctx.deploymentId, content);
};

const formatDotEnvValue = (value: string): string => {
  if (value === "") return '""';
  if (/^[A-Za-z0-9_./:@%-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
};

const writeProjectDotEnv = async (repoDir: string, env: Record<string, string>) => {
  const keys = Object.keys(env);
  if (keys.length === 0) {
    return;
  }

  const content = keys
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${formatDotEnvValue(env[key] ?? "")}`)
    .join("\n");

  const envFilePath = path.join(repoDir, ".env");
  await Bun.write(envFilePath, `${content}\n`);
};

type ProjectEnvRow = {
  key: string;
  value: string;
  isPublic: boolean;
};

export const splitProjectEnvs = (
  rows: ProjectEnvRow[]
): { buildEnv: Record<string, string>; runtimeEnv: Record<string, string> } => {
  const buildEnv: Record<string, string> = {};
  const runtimeEnv: Record<string, string> = {};

  for (const row of rows) {
    if (row.isPublic) {
      buildEnv[row.key] = row.value;
    } else {
      runtimeEnv[row.key] = row.value;
    }
  }

  return { buildEnv, runtimeEnv };
};

const prepareBuildEnv = async (
  workspaceDir: string,
  projectDir: string,
  projectBuildEnv: Record<string, string>,
  envFile: string | undefined,
  ctx: BuildContext
): Promise<Record<string, string>> => {
  const mergedEnv: Record<string, string> = { ...projectBuildEnv };

  if (envFile) {
    const normalized = envFile.replace(/\r\n?/g, "\n");
    const byteLength = Buffer.byteLength(normalized, "utf8");
    if (byteLength > MAX_DEPLOYMENT_ENV_FILE_BYTES) {
      throw new Error(
        `Deployment .env file is too large (${byteLength} bytes). Max allowed is ${MAX_DEPLOYMENT_ENV_FILE_BYTES} bytes.`
      );
    }

    const parsed = parseEnvFileContent(normalized);
    Object.assign(mergedEnv, parsed);
    logLine(ctx, `Applied deployment .env with ${Object.keys(parsed).length} variable(s)`);
  }

  await writeProjectDotEnv(workspaceDir, mergedEnv);
  if (projectDir !== workspaceDir) {
    await writeProjectDotEnv(projectDir, mergedEnv);
    logLine(ctx, "Wrote build .env files to the workspace root and project root");
  } else {
    logLine(ctx, "Wrote build .env file to the project workspace");
  }
  logLine(ctx, `Using ${Object.keys(mergedEnv).length} build environment variable(s)`);

  return mergedEnv;
};

const exists = async (filePath: string): Promise<boolean> => {
  try {
    const s = await stat(filePath);
    return s.isFile() || s.isDirectory();
  } catch {
    return false;
  }
};

const isDirectory = async (filePath: string): Promise<boolean> => {
  try {
    const s = await stat(filePath);
    return s.isDirectory();
  } catch {
    return false;
  }
};

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    const text = await Bun.file(filePath).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const readToml = async <T>(filePath: string): Promise<T | null> => {
  try {
    const text = await Bun.file(filePath).text();
    return Bun.TOML.parse(text) as T;
  } catch {
    return null;
  }
};

const readProcessStream = async (
  stream: ReadableStream<Uint8Array> | null,
  onChunk?: (chunk: string) => void
): Promise<string> => {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (!chunk) continue;
    output += chunk;
    if (onChunk) onChunk(chunk);
  }

  const finalChunk = decoder.decode();
  if (finalChunk) {
    output += finalChunk;
    if (onChunk) onChunk(finalChunk);
  }

  return output;
};

const describeSilentCommandHint = (cmd: string[]): string | null => {
  const joined = cmd.join(" ").toLowerCase();
  if (joined.includes("bun install") || joined.includes("npm install") || joined.includes("npm ci") || joined.includes("pnpm install")) {
    return "Dependency installs can go quiet during native module builds like node-gyp, canvas, or sharp.";
  }
  if (isLongQuietPackageBuildCommand(cmd)) {
    return "Production app builds (e.g. Next.js) often go quiet during TypeScript, data collection, or static generation.";
  }
  if (joined.includes("node-gyp")) {
    return "node-gyp rebuilds can hang on missing native toolchains, headers, or prebuilt binary downloads.";
  }
  return null;
};

const buildInactivityMessage = (cmd: string[], timeoutMs: number): string => {
  const base = `Command timed out after ${Math.floor(timeoutMs / 1000)}s without output: ${cmd.join(" ")}`;
  const hint = describeSilentCommandHint(cmd);
  return hint ? `${base}\n${hint}` : base;
};

const runHostCommand = async (
  cmd: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    stdin?: string;
    onStdoutChunk?: (chunk: string) => void;
    onStderrChunk?: (chunk: string) => void;
    onInactivityWarning?: (message: string) => void;
    inactivityTimeoutMs?: number;
  }
): Promise<RunCommandResult> => {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: options.env,
    stdin: options.stdin !== undefined ? "pipe" : undefined,
    stdout: "pipe",
    stderr: "pipe"
  });
  if (options.stdin !== undefined) {
    const sink = proc.stdin;
    if (!sink) {
      throw new Error("stdin pipe is not available for subprocess");
    }
    await sink.write(new TextEncoder().encode(options.stdin));
    await sink.end();
  }
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let warningTimer: ReturnType<typeof setTimeout> | null = null;
  const clearTimers = () => {
    if (timer) clearTimeout(timer);
    if (warningTimer) clearTimeout(warningTimer);
    timer = null;
    warningTimer = null;
  };
  const inactivityTimeoutMs = options.inactivityTimeoutMs ?? resolveHostCommandInactivityTimeoutMs(cmd);
  const resetInactivityTimers = () => {
    clearTimers();
    if (!Number.isFinite(inactivityTimeoutMs) || inactivityTimeoutMs <= 0) {
      return;
    }
    const warningDelay = Math.max(1000, Math.floor(inactivityTimeoutMs / 2));
    warningTimer = setTimeout(() => {
      options.onInactivityWarning?.(
        `No output for ${Math.floor(warningDelay / 1000)}s while running: ${cmd.join(" ")}`
      );
    }, warningDelay);
    timer = setTimeout(() => {
      timedOut = true;
      options.onInactivityWarning?.(buildInactivityMessage(cmd, inactivityTimeoutMs));
      proc.kill();
    }, inactivityTimeoutMs);
  };
  resetInactivityTimers();
  const stdoutPromise = readProcessStream(proc.stdout, options.onStdoutChunk);
  const stderrPromise = readProcessStream(proc.stderr, options.onStderrChunk);
  const [stdout, stderr, code] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);
  clearTimers();
  if (timedOut) {
    const timeoutMessage = buildInactivityMessage(cmd, inactivityTimeoutMs);
    return {
      code: 124,
      stdout,
      stderr: stderr ? `${stderr}\n${timeoutMessage}` : timeoutMessage
    };
  }
  return { code, stdout, stderr };
};

const runHostCommandWithDeploymentLogs = async (
  cmd: string[],
  options: { cwd: string; env?: Record<string, string>; ctx: BuildContext }
): Promise<RunCommandResult> => {
  const result = await runHostCommand(cmd, {
    cwd: options.cwd,
    env: options.env,
    onStdoutChunk: (chunk) => appendBuildLogChunk(options.ctx, chunk),
    onStderrChunk: (chunk) => appendBuildLogChunk(options.ctx, chunk),
    onInactivityWarning: (message) => logLine(options.ctx, message)
  });

  return result;
};

const resolveDockerImageForCommand = (strategyId: StrategyRuntimeId, cmd: string[]): string => {
  const first = cmd[0] ?? "";

  if (strategyId === "python") {
    return DOCKER_PYTHON_IMAGE;
  }

  if (first === "bun") {
    return DOCKER_BUN_IMAGE;
  }

  return DOCKER_NODE_IMAGE;
};

const dockerClient = new Docker({ socketPath: DOCKER_SOCKET_PATH });
const dockerImageEnsureCache = new Map<string, Promise<void>>();

const isDockerNotFoundError = (error: unknown): boolean => {
  const statusCode =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode?: unknown }).statusCode
      : undefined;
  if (statusCode === 404) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /No such (container|image)/i.test(message);
};

const isDockerRemovalInProgressError = (error: unknown): boolean => {
  const err = error as {
    statusCode?: unknown;
    json?: { message?: string };
    message?: string;
  };
  const statusCode = typeof err?.statusCode === "number" ? err.statusCode : undefined;
  if (statusCode !== 409) return false;
  const message =
    err?.json?.message ?? (error instanceof Error ? error.message : String(error ?? ""));
  return /removal of container .* is already in progress/i.test(message);
};

const isDockerDaemonUnavailableError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Cannot connect to the Docker daemon/i.test(message) ||
    /connect ECONNREFUSED/i.test(message) ||
    /ENOENT.*docker\.sock/i.test(message) ||
    /EACCES.*docker\.sock/i.test(message)
  );
};

const parseMemoryBytes = (value: string): number => {
  const raw = value.trim().toLowerCase();
  if (!raw || raw === "0") return 0;

  const match = raw.match(/^(\d+(?:\.\d+)?)([kmgtp]?)(?:i?b?)?$/);
  if (!match) {
    throw new Error(`Invalid build container memory setting: '${value}'`);
  }

  const amountRaw = match[1];
  if (!amountRaw) {
    throw new Error(`Invalid build container memory setting: '${value}'`);
  }
  const amount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid build container memory setting: '${value}'`);
  }

  const unit = (match[2] ?? "").toLowerCase();
  const multipliers: Record<string, number> = {
    "": 1,
    k: 1024,
    m: 1024 ** 2,
    g: 1024 ** 3,
    t: 1024 ** 4,
    p: 1024 ** 5
  };
  const multiplier = multipliers[unit];
  if (multiplier === undefined) {
    throw new Error(`Invalid build container memory unit: '${value}'`);
  }
  return Math.floor(amount * multiplier);
};

const parseNanoCpus = (value: string): number => {
  const raw = value.trim();
  if (!raw || raw === "0") return 0;

  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid build container CPUs setting: '${value}'`);
  }
  return Math.floor(parsed * 1_000_000_000);
};

const toDockerEnv = (env?: Record<string, string>): string[] =>
  Object.entries(env ?? {})
    .filter(([key]) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
    .map(([key, value]) => `${key}=${value}`);

const labelToPair = (label: string): { key: string; value: string } => {
  const separator = label.indexOf("=");
  if (separator < 0) {
    return { key: label, value: "true" };
  }
  return {
    key: label.slice(0, separator),
    value: label.slice(separator + 1)
  };
};

const createStreamCollector = (onChunk?: (chunk: string) => void) => {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      output += text;
      if (text && onChunk) onChunk(text);
      callback();
    }
  });

  return {
    stream,
    getOutput: () => output
  };
};

type EnsureDockerImageOptions = {
  deploymentId: string;
  onLog?: (line: string) => void;
};

const ensureDockerImage = async (
  image: string,
  options: EnsureDockerImageOptions
): Promise<void> => {
  const { deploymentId, onLog } = options;
  const existing = dockerImageEnsureCache.get(image);
  if (existing) {
    await existing;
    return;
  }

  const ensurePromise = (async () => {
    try {
      await dockerClient.getImage(image).inspect();
      return;
    } catch (error) {
      if (!isDockerNotFoundError(error)) {
        throw error;
      }
    }

    const pullMsg = `[docker] Pulling image ${image}\n`;
    publishDeploymentLog(deploymentId, pullMsg);
    onLog?.(pullMsg.trimEnd());
    const pullStream = await dockerClient.pull(image);
    await new Promise<void>((resolve, reject) => {
      dockerClient.modem.followProgress(
        pullStream,
        (error: Error | null) => (error ? reject(error) : resolve()),
        (event: unknown) => {
          const status =
            typeof event === "object" && event !== null && "status" in event
              ? (event as { status?: unknown }).status
              : undefined;
          const id =
            typeof event === "object" && event !== null && "id" in event
              ? (event as { id?: unknown }).id
              : undefined;
          const progress =
            typeof event === "object" && event !== null && "progress" in event
              ? (event as { progress?: unknown }).progress
              : undefined;

          if (typeof status !== "string" || !status) return;
          const parts = [
            status,
            typeof id === "string" ? id : "",
            typeof progress === "string" ? progress : ""
          ].filter(Boolean);
          const progressMsg = `[docker] ${parts.join(" ")}\n`;
          publishDeploymentLog(deploymentId, progressMsg);
          onLog?.(progressMsg.trimEnd());
        }
      );
    });
  })();

  dockerImageEnsureCache.set(image, ensurePromise);
  try {
    await ensurePromise;
  } catch (error) {
    dockerImageEnsureCache.delete(image);
    throw error;
  }
};

const runDockerCommand = async (
  cmd: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    workdirRelative?: string;
    deploymentId: string;
    strategyId: StrategyRuntimeId;
    buildConfig: BuildContainerConfig;
    onLog?: (line: string) => void;
  }
): Promise<RunCommandResult> => {
  if (cmd.length === 0) {
    return { code: 1, stdout: "", stderr: "No command provided" };
  }

  const dockerInactivityMs = resolveDockerCommandInactivityTimeoutMs(cmd);
  const image = resolveDockerImageForCommand(options.strategyId, cmd);
  let memoryBytes = parseMemoryBytes(options.buildConfig.memory);
  if (options.strategyId === "python" && memoryBytes > 0 && memoryBytes < 2 * 1024 * 1024 * 1024) {
    memoryBytes = 2 * 1024 * 1024 * 1024;
  }
  const nanoCpus = parseNanoCpus(options.buildConfig.cpus);
  const managedLabel = labelToPair(DOCKER_MANAGED_LABEL);
  const labels: Record<string, string> = {
    [managedLabel.key]: managedLabel.value,
    [DOCKER_DEPLOYMENT_LABEL_KEY]: sanitizeDockerLabelValue(options.deploymentId)
  };

  const hostConfig: {
    Binds: string[];
    Memory?: number;
    NanoCpus?: number;
  } = {
    Binds: [`${options.cwd}:${CONTAINER_REPO_DIR}`]
  };
  if (memoryBytes > 0) hostConfig.Memory = memoryBytes;
  if (nanoCpus > 0) hostConfig.NanoCpus = nanoCpus;

  await ensureDockerImage(image, {
    deploymentId: options.deploymentId,
    onLog: options.onLog
  });

  const stdoutCollector = createStreamCollector((chunk) =>
    publishDeploymentLog(options.deploymentId, chunk)
  );
  const stderrCollector = createStreamCollector((chunk) =>
    publishDeploymentLog(options.deploymentId, chunk)
  );

  let containerId = "";
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let warningTimer: ReturnType<typeof setTimeout> | null = null;
  const clearInactivityTimers = () => {
    if (timer) clearTimeout(timer);
    if (warningTimer) clearTimeout(warningTimer);
    timer = null;
    warningTimer = null;
  };
  try {
    const workdirRelative = sanitizeRelativeWorkdir(options.workdirRelative ?? ".");
    const workingDir =
      workdirRelative === "."
        ? CONTAINER_REPO_DIR
        : path.posix.join(CONTAINER_REPO_DIR, workdirRelative);
    const container = await dockerClient.createContainer({
      name: buildEphemeralContainerName(options.deploymentId),
      Image: image,
      Cmd: cmd,
      WorkingDir: workingDir,
      Env: toDockerEnv(options.env),
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      Labels: labels,
      HostConfig: hostConfig
    });
    containerId = container.id;

    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true
    });
    dockerClient.modem.demuxStream(stream, stdoutCollector.stream, stderrCollector.stream);
    const resetInactivityTimers = () => {
      clearInactivityTimers();
      if (!Number.isFinite(dockerInactivityMs) || dockerInactivityMs <= 0) {
        return;
      }
      const warningDelay = Math.max(1000, Math.floor(dockerInactivityMs / 2));
      warningTimer = setTimeout(() => {
        options.onLog?.(`No output for ${Math.floor(warningDelay / 1000)}s while running: ${cmd.join(" ")}`);
      }, warningDelay);
      timer = setTimeout(async () => {
        timedOut = true;
        options.onLog?.(buildInactivityMessage(cmd, dockerInactivityMs));
        try {
          await container.remove({ force: true });
        } catch {
          // ignore, finally block also cleans up
        }
      }, dockerInactivityMs);
    };
    resetInactivityTimers();
    stdoutCollector.stream.on("data", () => resetInactivityTimers());
    stderrCollector.stream.on("data", () => resetInactivityTimers());

    await container.start();
    const waitResult = await container.wait();
    await finished(stream).catch(() => {});
    clearInactivityTimers();

    if (timedOut) {
      const timeoutMessage = buildInactivityMessage(cmd, dockerInactivityMs);
      return {
        code: 124,
        stdout: stdoutCollector.getOutput(),
        stderr: stderrCollector.getOutput()
          ? `${stderrCollector.getOutput()}\n${timeoutMessage}`
          : timeoutMessage
      };
    }
    return {
      code: typeof waitResult.StatusCode === "number" ? waitResult.StatusCode : 1,
      stdout: stdoutCollector.getOutput(),
      stderr: stderrCollector.getOutput()
    };
  } catch (error) {
    if (isDockerDaemonUnavailableError(error)) {
      const stderr = stderrCollector.getOutput().trimEnd();
      const withHint = stderr
        ? `${stderr}\nBuild worker requires Docker daemon access (check /var/run/docker.sock mount).`
        : "Build worker requires Docker daemon access (check /var/run/docker.sock mount).";
      return {
        code: 1,
        stdout: stdoutCollector.getOutput(),
        stderr: withHint
      };
    }
    throw error;
  } finally {
    clearInactivityTimers();
    if (containerId) {
      try {
        await dockerClient.getContainer(containerId).remove({ force: true });
      } catch (error) {
        if (!isDockerNotFoundError(error) && !isDockerRemovalInProgressError(error)) {
          console.error("Failed to remove build container:", error);
        }
      }
    }
  }
};

const pruneBuildContainers = async (
  options: { deploymentId?: string; includeRunning?: boolean } = {}
): Promise<number> => {
  const labelFilters = [DOCKER_MANAGED_LABEL];
  const filters: Record<string, string[]> = {
    label: labelFilters
  };

  if (options.deploymentId) {
    labelFilters.push(
      `${DOCKER_DEPLOYMENT_LABEL_KEY}=${sanitizeDockerLabelValue(options.deploymentId)}`
    );
  }
  if (!options.includeRunning) {
    filters.status = ["exited", "dead"];
  }

  const containers = await dockerClient.listContainers({ all: true, filters });
  if (containers.length === 0) {
    return 0;
  }

  let removed = 0;
  for (const containerInfo of containers) {
    const id = containerInfo.Id;
    if (!id) continue;
    try {
      await dockerClient.getContainer(id).remove({ force: true });
      removed += 1;
    } catch (error) {
      if (isDockerNotFoundError(error) || isDockerRemovalInProgressError(error)) continue;
      console.warn("Failed to remove build container:", error);
    }
  }

  return removed;
};

const createBuildRuntime = (
  ctx: BuildContext,
  strategyId: StrategyRuntimeId,
  buildConfig: BuildContainerConfig
): BuildRuntime => ({
  containerRepoDir: CONTAINER_REPO_DIR,
  exists,
  isDirectory,
  which: (command: string) => {
    if (strategyId === "python" && (command === "python" || command === "python3")) {
      return command;
    }
    if (strategyId === "node" && (command === "node" || command === "npm" || command === "corepack" || command === "bun")) {
      return command;
    }
    return Bun.which(command);
  },
  readJson,
  readToml,
  runCommand: (cmd, options) =>
    runDockerCommand(cmd, {
      cwd: options.cwd,
      env: options.env,
      workdirRelative: options.workdirRelative,
      deploymentId: ctx.deploymentId,
      strategyId,
      buildConfig,
      onLog: (line) => logLine(ctx, line)
    }),
  resolveBunCli: () => ({ command: "bun" })
});

const detectionRuntime: BuildRuntime = {
  exists,
  isDirectory,
  which: Bun.which,
  readJson,
  readToml,
  runCommand: (cmd, options) =>
    runHostCommand(cmd, {
      cwd: options.cwd,
      env: options.env
    }),
  resolveBunCli: () => ({ command: "bun" })
};

const collectFiles = async (rootDir: string): Promise<string[]> => {
  const files: string[] = [];
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) continue;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files;
};

const uploadArtifacts = async (
  ctx: BuildContext,
  outputDir: string
): Promise<{ previewManifestKey: string; manifest: PreviewManifest }> => {
  const files = await collectFiles(outputDir);
  const previewManifest = createPreviewManifest(ctx.artifactPrefix, outputDir, files);

  logLine(ctx, `Found ${files.length} files to upload`);

  for (const filePath of files) {
    const relative = path.relative(outputDir, filePath).replace(/\\/g, "/");
    const key = `${ctx.artifactPrefix}/${relative}`;
    const contentType = guessContentType(filePath);
    const blob = Bun.file(filePath);
    await upload(key, blob, { contentType });
  }

  const previewManifestKey = buildPreviewManifestKey(ctx.artifactPrefix);
  await upload(previewManifestKey, JSON.stringify(previewManifest), {
    contentType: "application/json; charset=utf-8"
  });
  await cachePreviewManifest(ctx.deploymentId, previewManifest);

  return {
    previewManifestKey,
    manifest: previewManifest
  };
};

const createStaticRuntimeImageContext = async (outputDir: string, workDir: string): Promise<string> => {
  const contextDir = path.join(workDir, "runtime-static-context");
  const publicDir = path.join(contextDir, "public");
  await mkdir(contextDir, { recursive: true });
  await cp(outputDir, publicDir, { recursive: true, force: true });

  const dockerfilePath = path.join(contextDir, "Dockerfile");
  const dockerfile = [
    `FROM ${RUNTIME_STATIC_BASE_IMAGE}`,
    "WORKDIR /usr/share/nginx/html",
    "RUN rm -rf /usr/share/nginx/html/*",
    "COPY public/ /usr/share/nginx/html/"
  ].join("\n");
  await Bun.write(dockerfilePath, `${dockerfile}\n`);

  return contextDir;
};

const resolveRuntimeBaseImage = (runtimeConfig: RuntimeConfig): string => {
  const firstCommand = runtimeConfig.command[0] ?? "node";
  if (firstCommand === "bun") {
    return DOCKER_BUN_IMAGE;
  }
  return DOCKER_NODE_IMAGE;
};

const resolveRuntimeWorkingDir = (runtimeConfig: RuntimeConfig): string => {
  const rawWorkingDir = runtimeConfig.workingDir?.trim() || ".";
  const normalized = rawWorkingDir.replace(/\\/g, "/");
  if (path.isAbsolute(normalized)) {
    throw new Error("runtimeConfig.workingDir must be relative");
  }
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new Error("runtimeConfig.workingDir must stay inside the repository root");
  }
  return normalized === "." ? "/workspace" : `/workspace/${normalized.replace(/^\.\/+/, "")}`;
};

export const createServerRuntimeImageContext = async (
  repoDir: string,
  workDir: string,
  runtimeConfig: RuntimeConfig
): Promise<string> => {
  const contextDir = path.join(workDir, "runtime-server-context");
  const appDir = path.join(contextDir, "app");
  await mkdir(contextDir, { recursive: true });
  await cp(repoDir, appDir, { recursive: true, force: true, dereference: true });

  const dockerfilePath = path.join(contextDir, "Dockerfile");
  const dockerfile = [
    `FROM ${resolveRuntimeBaseImage(runtimeConfig)}`,
    "WORKDIR /workspace",
    "COPY app/ /workspace/",
    `WORKDIR ${resolveRuntimeWorkingDir(runtimeConfig)}`,
    "ENV NODE_ENV=production",
    `ENV PORT=${runtimeConfig.port}`,
    "ENV HOST=0.0.0.0",
    "ENV HOSTNAME=0.0.0.0",
    `EXPOSE ${runtimeConfig.port}`,
    `CMD ${JSON.stringify(runtimeConfig.command)}`
  ].join("\n");
  await Bun.write(dockerfilePath, `${dockerfile}\n`);

  return contextDir;
};

const RUNTIME_IMAGE_TEMP_TAG = "deployher-runtime-temp";

const collectRuntimeBuildArgs = (): string[] => {
  const args: string[] = [];
  for (const key of RUNTIME_BUILD_ARG_ALLOWLIST) {
    const value = process.env[key]?.trim();
    if (!value) continue;
    args.push("--build-arg", `${key}=${value}`);
  }
  return args;
};

let dockerPreviewPushLoginHost: string | null = null;

const ensureDockerLoginForPreviewPush = async (
  ctx: BuildContext,
  registryHost: string,
  user: string,
  password: string
): Promise<void> => {
  if (dockerPreviewPushLoginHost === registryHost) return;
  const r = await runHostCommand(
    ["docker", "login", registryHost, "-u", user, "--password-stdin"],
    { cwd: "/", stdin: `${password}\n` }
  );
  if (r.code !== 0) {
    throw new Error(
      `docker login failed for ${registryHost}: ${r.stderr || r.stdout || "unknown error"}`
    );
  }
  dockerPreviewPushLoginHost = registryHost;
  logLine(ctx, `Logged in to preview runtime registry ${registryHost}`);
};

const parseDigestPullRefFromPush = (
  cfg: ReturnType<typeof requirePreviewRuntimeRegistryForPush>,
  combinedOut: string
): string | null => {
  const matches = [...combinedOut.matchAll(/digest:\s*(sha256:[a-f0-9]{64})/gi)];
  const last = matches.length > 0 ? matches[matches.length - 1]?.[1] : undefined;
  if (!last) return null;
  const hex = last.replace(/^sha256:/i, "");
  return `${cfg.registryHost}/${cfg.dockerRepo}/${cfg.imageName}@sha256:${hex}`;
};

const buildRuntimeImageToLocalTag = async (
  contextDir: string,
  ctx: BuildContext,
  options: {
    dockerfilePath?: string;
    buildTarget?: string | null;
  } = {}
): Promise<string> => {
  const tag = `${RUNTIME_IMAGE_TEMP_TAG}:${ctx.deploymentId}`;
  const dockerBuildArgs = collectRuntimeBuildArgs();
  const normalizedDockerfilePath = options.dockerfilePath?.trim();

  logLine(ctx, "Starting host docker build for preview runtime image (this may take several minutes)…");
  const buildResult = await runHostCommandWithDeploymentLogs(
    [
      "docker",
      "build",
      "--progress=plain",
      "--label",
      DOCKER_RUNTIME_LABEL,
      "--label",
      `${DOCKER_DEPLOYMENT_LABEL_KEY}=${sanitizeDockerLabelValue(ctx.deploymentId)}`,
      ...(normalizedDockerfilePath ? ["-f", normalizedDockerfilePath] : []),
      ...(options.buildTarget ? ["--target", options.buildTarget] : []),
      ...dockerBuildArgs,
      "-t",
      tag,
      ".",
    ],
    { cwd: contextDir, ctx }
  );

  if (buildResult.code !== 0) {
    throw new Error(`Runtime image build failed: ${buildResult.stderr || buildResult.stdout}`);
  }

  return tag;
};

const pushLocalRuntimeTagToRegistry = async (
  ctx: BuildContext,
  contextDir: string,
  localTag: string
): Promise<string> => {
  const cfg = requirePreviewRuntimeRegistryForPush();
  const { user, password } = requireNexusCredentialsForRuntimePush();
  await ensureDockerLoginForPreviewPush(ctx, cfg.registryHost, user, password);
  const remoteTag = buildRuntimeImageTagOnly(cfg, ctx.deploymentId);
  const tagResult = await runHostCommandWithDeploymentLogs(
    ["docker", "tag", localTag, remoteTag],
    { cwd: contextDir, ctx }
  );
  if (tagResult.code !== 0) {
    throw new Error(`docker tag failed: ${tagResult.stderr || tagResult.stdout}`);
  }
  logLine(ctx, "Pushing preview runtime image to registry (large layers can be quiet for a while)…");
  const pushResult = await runHostCommandWithDeploymentLogs(["docker", "push", remoteTag], {
    cwd: contextDir,
    ctx
  });
  if (pushResult.code !== 0) {
    await runHostCommand(["docker", "rmi", remoteTag], { cwd: contextDir }).catch(() => {});
    await runHostCommand(["docker", "rmi", localTag], { cwd: contextDir }).catch(() => {});
    throw new Error(`docker push failed: ${pushResult.stderr || pushResult.stdout}`);
  }
  const inspectResult = await runHostCommand(
    ["docker", "inspect", "--format={{index .RepoDigests 0}}", remoteTag],
    { cwd: contextDir }
  );
  let pullRef = inspectResult.code === 0 ? inspectResult.stdout.trim() : "";
  if (!pullRef || !pullRef.includes("@sha256:")) {
    const fallback = parseDigestPullRefFromPush(
      cfg,
      `${pushResult.stdout}\n${pushResult.stderr}`
    );
    if (!fallback) {
      await runHostCommand(["docker", "rmi", remoteTag], { cwd: contextDir }).catch(() => {});
      await runHostCommand(["docker", "rmi", localTag], { cwd: contextDir }).catch(() => {});
      throw new Error("Could not resolve registry digest for preview runtime image");
    }
    pullRef = fallback;
  }
  await runHostCommand(["docker", "rmi", remoteTag], { cwd: contextDir }).catch(() => {});
  await runHostCommand(["docker", "rmi", localTag], { cwd: contextDir }).catch(() => {});
  logLine(ctx, `Preview runtime image pushed (${pullRef})`);
  return pullRef;
};

const buildAndPushStaticRuntimeRegistryArtifact = async (
  ctx: BuildContext,
  outputDir: string,
  workDir: string
): Promise<RegistryRuntimeArtifact> => {
  const contextDir = await createStaticRuntimeImageContext(outputDir, workDir);
  const localTag = await buildRuntimeImageToLocalTag(contextDir, ctx);
  const pullRef = await pushLocalRuntimeTagToRegistry(ctx, contextDir, localTag);
  return { ref: pullRef, pullRef, artifactKey: null };
};

const buildAndPushServerRuntimeRegistryArtifact = async (
  ctx: BuildContext,
  repoDir: string,
  workDir: string,
  runtimeConfig: RuntimeConfig,
  options: {
    runtimeImageMode: WorkerRuntimeImageMode;
    dockerfilePath: string | null;
    dockerBuildTarget: string | null;
  }
): Promise<RegistryRuntimeArtifact | null> => {
  const resolvedDockerfilePath = path.join(repoDir, options.dockerfilePath ?? "Dockerfile");
  const hasRepoDockerfile = await exists(resolvedDockerfilePath);

  let contextDir = repoDir;
  let dockerfileArgPath: string | undefined;
  if (options.runtimeImageMode === "platform") {
    contextDir = await createServerRuntimeImageContext(repoDir, workDir, runtimeConfig);
  } else if (options.runtimeImageMode === "dockerfile") {
    if (!hasRepoDockerfile) {
      throw new Error(`Dockerfile not found for runtime image build: ${options.dockerfilePath ?? "Dockerfile"}`);
    }
    dockerfileArgPath = path.relative(contextDir, resolvedDockerfilePath).replace(/\\/g, "/") || "Dockerfile";
  } else if (hasRepoDockerfile) {
    dockerfileArgPath = path.relative(contextDir, resolvedDockerfilePath).replace(/\\/g, "/") || "Dockerfile";
  } else {
    contextDir = await createServerRuntimeImageContext(repoDir, workDir, runtimeConfig);
    logLine(ctx, "No runtime Dockerfile found; synthesizing platform runtime image context");
  }

  const localTag = await buildRuntimeImageToLocalTag(contextDir, ctx, {
    dockerfilePath: dockerfileArgPath,
    buildTarget: options.dockerBuildTarget
  });
  const pullRef = await pushLocalRuntimeTagToRegistry(ctx, contextDir, localTag);
  return { ref: pullRef, pullRef, artifactKey: null };
};

const downloadRepo = async (
  repoUrl: string,
  branch: string,
  targetDir: string,
  ctx: BuildContext,
  githubToken: string | null
) => {
  const spec = parseGitHubRepoUrl(repoUrl);
  if (!spec) {
    throw new Error("Only https://github.com/<owner>/<repo> URLs are supported for now.");
  }
  const ref = branch.trim();
  if (!ref) {
    throw new Error("Branch is required for deployment");
  }
  const zipUrl = buildZipballUrl(spec, ref);
  logLine(ctx, `Downloading ${zipUrl}`);
  const headers: Record<string, string> = {
    "User-Agent": "vercel-clone-build",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`;
  }
  const response = await fetch(zipUrl, { headers });
  if (!response.ok) {
    throw new Error(`GitHub download failed with status ${response.status}`);
  }
  const zipPath = path.join(targetDir, "repo.zip");
  if (response.body) {
    const buffer = await new Response(response.body).arrayBuffer();
    await Bun.write(zipPath, Buffer.from(buffer));
  } else {
    const buffer = await response.arrayBuffer();
    await Bun.write(zipPath, Buffer.from(buffer));
  }
  logLine(ctx, "Download complete");
  return zipPath;
};

const extractRepo = async (zipPath: string, targetDir: string, ctx: BuildContext) => {
  await mkdir(targetDir, { recursive: true });
  logLine(ctx, "Extracting archive");
  const result = await runHostCommand(["unzip", "-q", zipPath, "-d", targetDir], { cwd: targetDir });
  if (result.code !== 0) {
    throw new Error(`Unzip failed: ${result.stderr || result.stdout}`);
  }
  const entries = await readdir(targetDir, { withFileTypes: true });
  const rootEntry = entries.find((e) => e.isDirectory());
  if (!rootEntry) {
    throw new Error("Extracted archive is empty");
  }
  return path.join(targetDir, rootEntry.name);
};

const getProjectScopedEnvs = async (
  projectId: string
): Promise<{ buildEnv: Record<string, string>; runtimeEnv: Record<string, string> }> => {
  const rows = await db
    .select({
      key: schema.projectEnvs.key,
      value: schema.projectEnvs.value,
      isPublic: schema.projectEnvs.isPublic
    })
    .from(schema.projectEnvs)
    .where(eq(schema.projectEnvs.projectId, projectId));

  return splitProjectEnvs(rows);
};

const buildProject = async (
  repoUrl: string,
  branch: string,
  ctx: BuildContext,
  githubToken: string | null,
  envFile: string | undefined,
  projectBuildEnv: Record<string, string>,
  projectConfig: Pick<
    typeof schema.projects.$inferSelect,
    | "previewMode"
    | "serverPreviewTarget"
    | "workspaceRootDir"
    | "projectRootDir"
    | "frameworkHint"
    | "runtimeImageMode"
    | "dockerfilePath"
    | "dockerBuildTarget"
    | "skipHostStrategyBuild"
    | "runtimeContainerPort"
    | "installCommand"
    | "buildCommand"
  >
): Promise<{
  buildStrategy: DeploymentBuildStrategy;
  serveStrategy: ServeStrategy;
  runtimeImageRef: string | null;
  runtimeImagePullRef: string | null;
  runtimeImageArtifactKey: string | null;
  runtimeConfig: RuntimeConfig | null;
  previewManifestKey: string | null;
  previewResolution: PreviewResolution;
}> => {
  if (!isStorageConfigured()) {
    throw new Error("S3 storage is not configured");
  }

  await mkdir(BUILD_WORKDIR_ROOT, { recursive: true });
  const workDir = await mkdtemp(path.join(BUILD_WORKDIR_ROOT, "build-"));

  try {
    const exampleName = parseExampleRepoUrl(repoUrl);
    let extractedRoot = "";

    if (exampleName) {
      const sourceExample = await resolveLocalExample(exampleName);
      if (!sourceExample) {
        throw new Error(`Local example not found: ${exampleName}`);
      }
      const targetDir = path.join(workDir, "repo", sourceExample.name);
      logLine(ctx, `Using local example source: ${sourceExample.name}`);
      await mkdir(path.dirname(targetDir), { recursive: true });
      await cp(sourceExample.path, targetDir, { recursive: true, force: true });
      extractedRoot = targetDir;
    } else {
      const zipPath = await downloadRepo(repoUrl, branch, workDir, ctx, githubToken);
      extractedRoot = await extractRepo(zipPath, path.join(workDir, "repo"), ctx);
    }

    const roots = resolveProjectRoots(
      extractedRoot,
      projectConfig.workspaceRootDir,
      projectConfig.projectRootDir
    );
    const workspaceDirStat = await stat(roots.workspaceDir).catch(() => null);
    if (!workspaceDirStat?.isDirectory()) {
      throw new Error(`Workspace root directory not found in repository: ${roots.workspaceRootDir}`);
    }
    const selectedProjectDirStat = await stat(roots.projectDir).catch(() => null);
    if (!selectedProjectDirStat?.isDirectory()) {
      throw new Error(`Project root directory not found in repository: ${roots.projectRootDir}`);
    }

    ctx.repoDir = roots.projectDir;
    logLine(ctx, `Selected workspace root: ${roots.workspaceRelative}`);
    logLine(ctx, `Selected project root: ${roots.projectRelative}`);

    const projectConfigForBuild = await mergeBuildProjectConfigWithRepoDeployherToml(
      projectConfig,
      roots.projectDir,
      (line) => logLine(ctx, line)
    );

    logLine(ctx, `Framework hint: ${projectConfigForBuild.frameworkHint}`);
    logLine(ctx, `Runtime image mode: ${projectConfigForBuild.runtimeImageMode}`);

    try {
      const fsDetect = new LocalFileSystemDetector(roots.projectDir);
      const fwRec = await detectFrameworkRecord({
        fs: fsDetect,
        frameworkList,
        useExperimentalFrameworks: true
      });
      if (fwRec?.slug) {
        const ver = fwRec.detectedVersion ? ` @ ${fwRec.detectedVersion}` : "";
        logLine(ctx, `Framework preset: ${fwRec.name} (${fwRec.slug}${ver})`);
      }
    } catch {
      // optional telemetry only
    }

    const combinedBuildEnv = await prepareBuildEnv(
      roots.workspaceDir,
      roots.projectDir,
      projectBuildEnv,
      envFile,
      ctx
    );

    if (projectConfigForBuild.skipHostStrategyBuild && projectConfigForBuild.previewMode !== "server") {
      throw new Error("skipHostStrategyBuild requires Preview type Server");
    }

    const resolvedDockerfilePath = path.join(
      roots.projectDir,
      projectConfigForBuild.dockerfilePath?.trim()
        ? projectConfigForBuild.dockerfilePath.trim()
        : "Dockerfile"
    );
    const hasProjectDockerfile = await exists(resolvedDockerfilePath);

    const strategy = projectConfigForBuild.skipHostStrategyBuild
      ? null
      : await detectBuildStrategy(roots.projectDir, detectionRuntime);

    let useDockerfileOnlyHostSkip = projectConfigForBuild.skipHostStrategyBuild;

    if (!strategy) {
      if (projectConfigForBuild.skipHostStrategyBuild) {
        logLine(ctx, "Skipping host strategy build; runtime image will be built directly from Docker configuration");
      } else if (
        hasProjectDockerfile &&
        (projectConfigForBuild.previewMode === "auto" ||
          projectConfigForBuild.previewMode === "server")
      ) {
        useDockerfileOnlyHostSkip = true;
        logLine(
          ctx,
          "No host build strategy matched; building server runtime from Dockerfile only"
        );
      } else if (hasProjectDockerfile && projectConfigForBuild.previewMode === "static") {
        throw new Error(
          "This project has a Dockerfile but no host build produces static output. Set Preview type to Server or Auto-detect to run the container, or add mkdocs.yml or [tool.deployher] in pyproject.toml for static Python builds."
        );
      } else {
        throw new Error(
          "Unsupported project type. Expected Node (package.json), Python (pyproject.toml or requirements.txt with mkdocs.yml or [tool.deployher]), or a static site entrypoint at index.html, public/index.html, dist/index.html, or build/index.html. For a Dockerfile-only server app, include a Dockerfile and use Preview type Server or Auto-detect."
        );
      }
    }

    const buildConfig = await getBuildContainerConfig();
    const runtime = strategy ? createBuildRuntime(ctx, strategy.id, buildConfig) : null;

    const installParsed = parseStoredProjectCommandForBuild(projectConfig.installCommand);
    const buildParsed = parseStoredProjectCommandForBuild(projectConfig.buildCommand);
    if (installParsed.warning) {
      logLine(ctx, `Invalid stored install command ignored: ${installParsed.warning}`);
    }
    if (buildParsed.warning) {
      logLine(ctx, `Invalid stored build command ignored: ${buildParsed.warning}`);
    }

    const rawInstallSetting = projectConfig.installCommand;
    if (rawInstallSetting != null && rawInstallSetting.trim() !== "") {
      if (installParsed.argv && installParsed.argv.length > 0) {
        logLine(
          ctx,
          `Resolved project install command from settings: ${installParsed.argv.join(" ")}`
        );
      }
    } else {
      logLine(ctx, "No project install command in settings (package manager default for Node builds).");
    }

    const result = useDockerfileOnlyHostSkip
      ? {
          buildStrategy: "unknown" as DeploymentBuildStrategy,
          serveStrategy: "server" as const,
          runtimeConfig: {
            port: projectConfigForBuild.runtimeContainerPort,
            framework: "node" as const,
            command: ["noop"],
            workingDir: "."
          },
          previewResolution: {
            code: "dockerfile_only_server" as const,
            detail: projectConfigForBuild.skipHostStrategyBuild
              ? "Docker build only (host strategy skipped)"
              : "Docker build only (no matching host strategy)"
          }
        }
      : await strategy!.build(
          roots.projectDir,
          {
            deploymentId: ctx.deploymentId,
            logs: ctx.logs,
            log: (line: string) => logLine(ctx, line),
            appendLogChunk: (content: string) => appendBuildLogChunk(ctx, content),
            env: combinedBuildEnv,
            repoDir: roots.projectDir,
            workspaceDir: roots.workspaceDir,
            repoRelativeDir: roots.projectRelative,
            workspaceRelativeDir: roots.workspaceRelative,
            previewMode: projectConfigForBuild.previewMode,
            serverPreviewTarget: projectConfigForBuild.serverPreviewTarget,
            frameworkHint: projectConfigForBuild.frameworkHint,
            installCommandOverride: installParsed.argv,
            buildCommandOverride: buildParsed.argv
          },
          runtime!
        );
    if (strategy) {
      logLine(ctx, `Detected build strategy: ${strategy.id}`);
    } else if (useDockerfileOnlyHostSkip) {
      logLine(ctx, "Detected build strategy: dockerfile (host steps skipped)");
    }
    logLine(
      ctx,
      `Resolved preview strategy: ${result.serveStrategy} (${result.previewResolution.code})`
    );
    if (result.previewResolution.detail) {
      logLine(ctx, result.previewResolution.detail);
    }
    logLine(ctx, `Server preview target: ${projectConfigForBuild.serverPreviewTarget}`);
    if (
      result.serveStrategy === "static" &&
      (projectConfigForBuild.skipHostStrategyBuild ||
        projectConfigForBuild.runtimeImageMode === "dockerfile")
    ) {
      throw new Error(
        "Static deployments cannot use Dockerfile-only runtime image builds. Use Preview type Server or switch runtimeImageMode to auto/platform."
      );
    }

    let runtimeImageRef: string | null = null;
    let runtimeImagePullRef: string | null = null;
    let runtimeImageArtifactKey: string | null = null;
    let runtimeConfig: RuntimeConfig | null = result.runtimeConfig ?? null;
    let previewManifestKey: string | null = null;

    if (result.serveStrategy === "static") {
      if (!result.outputDir) {
        throw new Error(`Build strategy '${result.buildStrategy}' did not provide an output directory`);
      }

      logLine(ctx, `Uploading artifacts from ${path.basename(result.outputDir)}`);
      const uploadResult = await uploadArtifacts(ctx, result.outputDir);
      previewManifestKey = uploadResult.previewManifestKey;
      logLine(ctx, "Artifact upload complete");

      try {
        logLine(ctx, "Building container image for static output");
        const runtimeArtifact = await buildAndPushStaticRuntimeRegistryArtifact(
          ctx,
          result.outputDir,
          workDir
        );
        runtimeImageRef = runtimeArtifact.ref;
        runtimeImagePullRef = runtimeArtifact.pullRef;
        runtimeImageArtifactKey = runtimeArtifact.artifactKey;
        logLine(ctx, `Runtime image pushed (${runtimeImagePullRef})`);
      } catch (error) {
        logLine(
          ctx,
          `Runtime image generation skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      logLine(ctx, "Build completed with server serve strategy; skipping static artifact upload");

      try {
        logLine(ctx, "Building container image for server output");
        if (!runtimeConfig) {
          throw new Error("Server deployment did not provide runtimeConfig");
        }
        const runtimeArtifact = await buildAndPushServerRuntimeRegistryArtifact(
          ctx,
          extractedRoot,
          workDir,
          runtimeConfig,
          {
            runtimeImageMode: projectConfigForBuild.runtimeImageMode,
            dockerfilePath: projectConfigForBuild.dockerfilePath,
            dockerBuildTarget: projectConfigForBuild.dockerBuildTarget
          }
        );
        if (runtimeArtifact) {
          runtimeImageRef = runtimeArtifact.ref;
          runtimeImagePullRef = runtimeArtifact.pullRef;
          runtimeImageArtifactKey = runtimeArtifact.artifactKey;
          logLine(ctx, `Runtime image pushed (${runtimeImagePullRef})`);
        }
      } catch (error) {
        logLine(
          ctx,
          `Runtime image generation skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      buildStrategy: result.buildStrategy,
      serveStrategy: result.serveStrategy,
      runtimeImageRef,
      runtimeImagePullRef,
      runtimeImageArtifactKey,
      runtimeConfig,
      previewManifestKey,
      previewResolution: result.previewResolution
    };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
};

const processJob = async (job: DeploymentJob) => {
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, job.deploymentId))
    .limit(1);

  if (!deployment) {
    throw new Error(`Deployment not found: ${job.deploymentId}`);
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, deployment.projectId))
    .limit(1);

  if (!project) {
    throw new Error(`Project not found for deployment ${deployment.id}`);
  }

  const githubToken = job.repoCredentialId
    ? await consumeRepoCredential(job.repoCredentialId)
    : null;

  const { buildEnv, runtimeEnv } = await getProjectScopedEnvs(project.id);
  const buildLogKey = `${deployment.artifactPrefix}/build.log`;

  const logs: string[] = [];
  const ctx: BuildContext = {
    repoDir: "",
    artifactPrefix: deployment.artifactPrefix,
    deploymentId: deployment.id,
    logs,
    buildLogKey,
    scheduleLogFlush: () => {}
  };

  let lastUploadedLogBody = "";
  let flushChain: Promise<void> = Promise.resolve();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const flushLogsToStorage = async () => {
    if (!isStorageConfigured()) return;
    const logBody = logs.join("");
    if (logBody === lastUploadedLogBody) return;
    await upload(buildLogKey, logBody, {
      contentType: "text/plain; charset=utf-8"
    });
    lastUploadedLogBody = logBody;
  };

  const enqueueLogFlush = (delayMs = 500) => {
    if (!isStorageConfigured()) return;
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushChain = flushChain
        .then(() => flushLogsToStorage())
        .catch((error) => {
          console.error("Failed to flush in-progress build log:", error);
        });
    }, delayMs);
  };

  ctx.scheduleLogFlush = enqueueLogFlush;

  logLine(ctx, `Loaded ${Object.keys(buildEnv).length} persisted build environment variable(s)`);
  logLine(ctx, `Loaded ${Object.keys(runtimeEnv).length} persisted runtime environment variable(s)`);
  enqueueLogFlush(0);

  let status: "success" | "failed" = "success";
  let buildStrategy: DeploymentBuildStrategy = "unknown";
  let serveStrategy: ServeStrategy = "static";
  let runtimeImageRef: string | null = null;
  let runtimeImagePullRef: string | null = null;
  let runtimeImageArtifactKey: string | null = null;
  let runtimeConfig: RuntimeConfig | null = null;
  let previewManifestKey: string | null = null;
  let previewResolution: PreviewResolution | null = null;

  try {
    const cleaned = await pruneBuildContainers({ deploymentId: deployment.id, includeRunning: true });
    if (cleaned > 0) {
      logLine(ctx, `Pruned ${cleaned} stale build container(s) before starting`);
    }

    const buildResult = await buildProject(
      project.repoUrl,
      project.branch,
      ctx,
      githubToken,
      job.envFile,
      buildEnv,
      {
        previewMode: deployment.buildPreviewMode ?? project.previewMode,
        serverPreviewTarget:
          deployment.buildServerPreviewTarget ?? project.serverPreviewTarget,
        workspaceRootDir: project.workspaceRootDir,
        projectRootDir: project.projectRootDir,
        frameworkHint: project.frameworkHint,
        runtimeImageMode: project.runtimeImageMode,
        dockerfilePath: project.dockerfilePath,
        dockerBuildTarget: project.dockerBuildTarget,
        skipHostStrategyBuild: project.skipHostStrategyBuild,
        runtimeContainerPort: project.runtimeContainerPort,
        installCommand: project.installCommand,
        buildCommand: project.buildCommand
      }
    );
    buildStrategy = buildResult.buildStrategy;
    serveStrategy = resolveCanonicalServeStrategy(
      deployment.buildPreviewMode ?? project.previewMode,
      buildResult.serveStrategy
    );
    runtimeImageRef = buildResult.runtimeImageRef;
    runtimeImagePullRef = buildResult.runtimeImagePullRef;
    runtimeImageArtifactKey = buildResult.runtimeImageArtifactKey;
    runtimeConfig = buildResult.runtimeConfig;
    if (runtimeConfig && serveStrategy === "server" && Object.keys(runtimeEnv).length > 0) {
      runtimeConfig = {
        ...runtimeConfig,
        env: runtimeEnv
      };
    }
    previewManifestKey = buildResult.previewManifestKey;
    previewResolution = buildResult.previewResolution;

    const pull = runtimeImagePullRef?.trim() ?? "";
    if (pull && serveStrategy === "server") {
      await db
        .update(schema.deployments)
        .set({
          buildStrategy,
          serveStrategy,
          runtimeImageRef,
          runtimeImagePullRef,
          runtimeImageArtifactKey,
          runtimeConfig
        })
        .where(eq(schema.deployments.id, deployment.id));
      void notifyPreviewRunnersPrewarm(pull);
    }
  } catch (error) {
      status = "failed";
      logLine(ctx, `Build error: ${error instanceof Error ? error.message : String(error)}`);
      enqueueLogFlush(0);
  } finally {
    if (flushTimer !== null) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    try {
      const cleanedAfter = await pruneBuildContainers({
        deploymentId: deployment.id,
        includeRunning: false
      });
      if (cleanedAfter > 0) {
        logLine(ctx, `Pruned ${cleanedAfter} exited build container(s) after completion`);
      }
    } catch (cleanupError) {
      console.error("Failed to cleanup build containers:", cleanupError);
    }

    let uploadedLogKey: string | null = null;
    if (isStorageConfigured()) {
      try {
        await flushChain;
        await flushLogsToStorage();
        uploadedLogKey = buildLogKey;
      } catch (err) {
        console.error("Failed to upload build logs:", err);
      }
    }

    const terminalStatus = resolveDeploymentTerminalStatus({
      status,
      serveStrategy,
      runtimeImagePullRef,
      runtimeImageArtifactKey
    });
    if (terminalStatus !== status && serveStrategy === "server") {
      logLine(
        ctx,
        "Marking deployment failed because server preview runtime image generation did not produce a runnable image reference"
      );
      status = terminalStatus;
    }

    const previewUrl = status === "success" ? buildPreviewUrl(deployment.shortId) : null;

    await db
      .update(schema.deployments)
      .set({
        status,
        finishedAt: new Date(),
        buildLogKey: uploadedLogKey,
        previewUrl,
        buildStrategy,
        serveStrategy,
        runtimeImageRef,
        runtimeImagePullRef,
        runtimeImageArtifactKey,
        runtimeConfig,
        previewManifestKey,
        previewResolution,
        buildPreviewMode: deployment.buildPreviewMode ?? project.previewMode,
        buildServerPreviewTarget:
          deployment.buildServerPreviewTarget ?? project.serverPreviewTarget
      })
      .where(eq(schema.deployments.id, deployment.id));

    if (status === "success" && previewUrl) {
      void refreshProjectSiteMetadata(deployment.projectId, { previewPageUrl: previewUrl }).catch((err) => {
        console.error("Failed to refresh project site metadata:", err);
      });
    }

    if (status === "success" && serveStrategy === "server" && (runtimeImagePullRef?.trim() || runtimeImageArtifactKey?.trim())) {
      const [currentRow] = await db
        .select({ currentDeploymentId: schema.projects.currentDeploymentId })
        .from(schema.projects)
        .where(eq(schema.projects.id, deployment.projectId))
        .limit(1);
      if (currentRow?.currentDeploymentId === deployment.id) {
        void requestRunnerEnsurePreview({
          deploymentId: deployment.id,
          projectId: deployment.projectId,
          runtimeImagePullRef: runtimeImagePullRef?.trim() || undefined,
          runtimeImageArtifactKey: runtimeImageArtifactKey?.trim() || undefined,
          runtimeConfig
        }).catch((err) => {
          console.error("Failed to request preview container ensure after build:", err);
        });
      }
    }

    await publishDeploymentEvent(deployment.id, { type: "status", status });
    await publishDeploymentEvent(deployment.id, { type: "done", status });
    await onDeploymentTerminalStatus(project.id, status);
  }
};

export const runLoop = async () => {
  if (EFFECTIVE_BUILD_PENDING_HEARTBEAT_MS !== BUILD_PENDING_HEARTBEAT_MS) {
    console.warn(
      `Adjusted build heartbeat interval from ${BUILD_PENDING_HEARTBEAT_MS}ms to ${EFFECTIVE_BUILD_PENDING_HEARTBEAT_MS}ms so active jobs are not reclaimed early.`
    );
  }

  try {
    const cleaned = await pruneBuildContainers();
    if (cleaned > 0) {
      console.warn(`Recovered by pruning ${cleaned} stale build container(s).`);
    }
  } catch (error) {
    console.error("Failed to prune stale build containers at worker startup:", error);
  }

  const consumerName = buildConsumerName();
  console.log(`Build worker stream consumer: ${consumerName}`);

  while (true) {
    let message = await dequeueDeployment(consumerName, 2000);
    if (!message) {
      try {
        message = await reclaimDeployment(consumerName, BUILD_RECLAIM_IDLE_MS);
      } catch (error) {
        console.error("Failed to reclaim stale deployment stream entry:", error);
      }
    }
    if (!message) continue;

    const job: DeploymentJob = message.job;
    if (!job.deploymentId) {
      try {
        await ackDeployment(message.streamId);
      } catch (err) {
        console.error("Failed to ack invalid deployment message:", err);
      }
      continue;
    }

    const [deploymentCheck] = await db
      .select({
        status: schema.deployments.status,
        workerId: schema.deployments.workerId,
        lastHeartbeatAt: schema.deployments.lastHeartbeatAt,
        artifactPrefix: schema.deployments.artifactPrefix
      })
      .from(schema.deployments)
      .where(eq(schema.deployments.id, job.deploymentId))
      .limit(1);
    if (!deploymentCheck || deploymentCheck.status === "success" || deploymentCheck.status === "failed") {
      try {
        await ackDeployment(message.streamId);
      } catch (err) {
        console.error("Failed to ack already-completed deployment:", err);
      }
      continue;
    }

    if (
      deploymentCheck.status === "building" &&
      deploymentCheck.workerId &&
      deploymentCheck.workerId !== consumerName &&
      hasFreshWorkerHeartbeat(deploymentCheck.lastHeartbeatAt, BUILD_RECLAIM_IDLE_MS)
    ) {
      try {
        await ackDeployment(message.streamId);
      } catch (err) {
        console.error("Failed to ack duplicate in-flight deployment:", err);
      }
      continue;
    }

    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
    try {
      const now = new Date();
      await db
        .update(schema.deployments)
        .set({
          status: "building",
          workerId: consumerName,
          lastHeartbeatAt: now,
          buildLogKey: `${deploymentCheck.artifactPrefix}/build.log`,
          runAttempt: sql`${schema.deployments.runAttempt} + 1`
        })
        .where(eq(schema.deployments.id, job.deploymentId));
      await publishDeploymentEvent(job.deploymentId, { type: "status", status: "building" });

      heartbeatInterval = setInterval(() => {
        touchPendingDeployment(message.streamId, consumerName).catch((error) => {
          console.error("Failed to heartbeat deployment stream entry:", error);
        });
        db.update(schema.deployments)
          .set({ lastHeartbeatAt: new Date() })
          .where(eq(schema.deployments.id, job.deploymentId))
          .catch((error) => {
            console.error("Failed to update deployment heartbeat:", error);
          });
      }, EFFECTIVE_BUILD_PENDING_HEARTBEAT_MS);

      await processJob(job);
    } catch (error) {
      console.error("Build failed:", error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        console.error(error.stack);
      }
    } finally {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }

      try {
        await ackDeployment(message.streamId);
      } catch (err) {
        console.error(`Failed to ack deployment stream entry ${message.streamId}:`, err);
      }
    }
  }
};

if (!Bun.isMainThread) {
  runLoop().catch((err) => {
    console.error("Build worker crashed:", err);
    process.exit(1);
  });
}
