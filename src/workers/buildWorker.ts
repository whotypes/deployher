import { and, eq } from "drizzle-orm";
import { getBuildContainerConfig, type BuildContainerConfig } from "../admin/buildSettings";
import { cp, mkdir, mkdtemp, readdir, rm, stat } from "fs/promises";
import Docker from "dockerode";
import { finished } from "node:stream/promises";
import { Writable } from "node:stream";
import { tmpdir } from "os";
import path from "path";
import { config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { parseExampleRepoUrl, resolveLocalExample } from "../examples";
import { buildZipballUrl, parseGitHubRepoUrl } from "../github";
import { ackDeployment, dequeueDeployment, type DeploymentJob } from "../queue";
import { getRedisClient } from "../redis";
import { isStorageConfigured, upload } from "../storage";
import { guessContentType } from "../utils/contentType";
import { detectBuildStrategy } from "./build/registry";
import type { BuildRuntime, DeploymentBuildStrategy, RunCommandResult, ServeStrategy } from "./build/types";

const buildPreviewUrl = (shortId: string) =>
  `${config.devProtocol}://${shortId}.${config.devDomain}:${config.port}`;

const DEPLOYMENT_LOG_CHANNEL_PREFIX = "deployment:";
const DEPLOYMENT_LOG_CHANNEL_SUFFIX = ":logs";
const MAX_DEPLOYMENT_ENV_FILE_BYTES = 64 * 1024;

const DOCKER_MANAGED_LABEL = "io.pdploy.build=true";
const DOCKER_RUNTIME_LABEL = "io.pdploy.runtime=true";
const DOCKER_DEPLOYMENT_LABEL_KEY = "io.pdploy.deployment";
const DOCKER_NODE_IMAGE = (process.env.BUILD_NODE_IMAGE ?? "node:22-bookworm").trim();
const DOCKER_BUN_IMAGE = (process.env.BUILD_BUN_IMAGE ?? "oven/bun:1").trim();
const DOCKER_PYTHON_IMAGE = (process.env.BUILD_PYTHON_IMAGE ?? "python:3.12-bookworm").trim();
const RUNTIME_STATIC_BASE_IMAGE = (process.env.RUNTIME_STATIC_BASE_IMAGE ?? "nginx:alpine").trim();
const BUILD_WORKDIR_ROOT = (process.env.BUILD_WORKDIR ?? path.join(tmpdir(), "pdploy-builds")).trim();
const DOCKER_SOCKET_PATH = (process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock").trim() || "/var/run/docker.sock";
const CONTAINER_REPO_DIR = "/workspace";

type BuildContext = {
  repoDir: string;
  artifactPrefix: string;
  deploymentId: string;
  logs: string[];
};

type StrategyRuntimeId = Exclude<DeploymentBuildStrategy, "unknown">;
type OciRuntimeArtifact = {
  ref: string;
  artifactKey: string;
};

const publishDeploymentLog = (deploymentId: string, content: string): void => {
  getRedisClient()
    .then((client) => {
      if (!client) return;
      const channel = `${DEPLOYMENT_LOG_CHANNEL_PREFIX}${deploymentId}${DEPLOYMENT_LOG_CHANNEL_SUFFIX}`;
      return client.publish(channel, content);
    })
    .catch(() => {});
};

const logLine = (ctx: BuildContext, line: string) => {
  const formatted = `[${new Date().toISOString()}] ${line}\n`;
  ctx.logs.push(formatted.trimEnd());
  publishDeploymentLog(ctx.deploymentId, formatted);
};

const parseDeploymentEnvFile = (content: string): Record<string, string> => {
  const parsed: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = withoutExport.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(separatorIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
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

const prepareBuildEnv = async (
  repoDir: string,
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

    const parsed = parseDeploymentEnvFile(normalized);
    Object.assign(mergedEnv, parsed);
    logLine(ctx, `Applied deployment .env with ${Object.keys(parsed).length} variable(s)`);
  }

  await writeProjectDotEnv(repoDir, mergedEnv);
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

const runHostCommand = async (
  cmd: string[],
  options: {
    cwd: string;
    env?: Record<string, string>;
    onStdoutChunk?: (chunk: string) => void;
    onStderrChunk?: (chunk: string) => void;
  }
): Promise<RunCommandResult> => {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe"
  });
  const stdoutPromise = readProcessStream(proc.stdout, options.onStdoutChunk);
  const stderrPromise = readProcessStream(proc.stderr, options.onStderrChunk);
  const [stdout, stderr, code] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);
  return { code, stdout, stderr };
};

const sanitizeDockerLabelValue = (value: string): string => value.replace(/[^A-Za-z0-9_.-]/g, "_");

const runHostCommandWithDeploymentLogs = async (
  cmd: string[],
  options: { cwd: string; env?: Record<string, string>; ctx: BuildContext }
): Promise<RunCommandResult> => {
  const result = await runHostCommand(cmd, {
    cwd: options.cwd,
    env: options.env,
    onStdoutChunk: (chunk) => publishDeploymentLog(options.ctx.deploymentId, chunk),
    onStderrChunk: (chunk) => publishDeploymentLog(options.ctx.deploymentId, chunk)
  });

  if (result.stdout.trim()) {
    options.ctx.logs.push(result.stdout.trimEnd());
  }
  if (result.stderr.trim()) {
    options.ctx.logs.push(result.stderr.trimEnd());
  }

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

const ensureDockerImage = async (image: string, deploymentId: string): Promise<void> => {
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

    publishDeploymentLog(deploymentId, `[docker] Pulling image ${image}\n`);
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
          publishDeploymentLog(deploymentId, `[docker] ${parts.join(" ")}\n`);
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
    deploymentId: string;
    strategyId: StrategyRuntimeId;
    buildConfig: BuildContainerConfig;
  }
): Promise<RunCommandResult> => {
  if (cmd.length === 0) {
    return { code: 1, stdout: "", stderr: "No command provided" };
  }

  const image = resolveDockerImageForCommand(options.strategyId, cmd);
  const memoryBytes = parseMemoryBytes(options.buildConfig.memory);
  const nanoCpus = parseNanoCpus(options.buildConfig.cpus);
  const managedLabel = labelToPair(DOCKER_MANAGED_LABEL);
  const labels: Record<string, string> = {
    [managedLabel.key]: managedLabel.value,
    [DOCKER_DEPLOYMENT_LABEL_KEY]: sanitizeDockerLabelValue(options.deploymentId)
  };

  await ensureDockerImage(image, options.deploymentId);

  const stdoutCollector = createStreamCollector((chunk) =>
    publishDeploymentLog(options.deploymentId, chunk)
  );
  const stderrCollector = createStreamCollector((chunk) =>
    publishDeploymentLog(options.deploymentId, chunk)
  );

  let containerId = "";
  try {
    const container = await dockerClient.createContainer({
      Image: image,
      Cmd: cmd,
      WorkingDir: CONTAINER_REPO_DIR,
      Env: toDockerEnv(options.env),
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
      Labels: labels,
      HostConfig: {
        Binds: [`${options.cwd}:${CONTAINER_REPO_DIR}`],
        Memory: memoryBytes,
        NanoCpus: nanoCpus
      }
    });
    containerId = container.id;

    const stream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true
    });
    dockerClient.modem.demuxStream(stream, stdoutCollector.stream, stderrCollector.stream);

    await container.start();
    const waitResult = await container.wait();
    await finished(stream).catch(() => {});

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
    if (containerId) {
      try {
        await dockerClient.getContainer(containerId).remove({ force: true });
      } catch (error) {
        if (!isDockerNotFoundError(error)) {
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
      if (!isDockerNotFoundError(error)) {
        throw error;
      }
    }
  }

  return removed;
};

const createBuildRuntime = (
  ctx: BuildContext,
  strategyId: StrategyRuntimeId,
  buildConfig: BuildContainerConfig
): BuildRuntime => ({
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
      deploymentId: ctx.deploymentId,
      strategyId,
      buildConfig
    }),
  resolveBunCli: () => ({ command: "bun" })
});

const detectionRuntime: BuildRuntime = {
  exists,
  isDirectory,
  which: Bun.which,
  readJson,
  readToml,
  runCommand: runHostCommand,
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

const uploadArtifacts = async (ctx: BuildContext, outputDir: string) => {
  const files = await collectFiles(outputDir);

  logLine(ctx, `Found ${files.length} files to upload`);

  for (const filePath of files) {
    const relative = path.relative(outputDir, filePath).replace(/\\/g, "/");
    const key = `${ctx.artifactPrefix}/${relative}`;
    const contentType = guessContentType(filePath);
    const blob = Bun.file(filePath);
    await upload(key, blob, { contentType });
  }
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

const buildOciArchiveFromContext = async (
  contextDir: string,
  outputPath: string,
  ctx: BuildContext
): Promise<void> => {
  const result = await runHostCommandWithDeploymentLogs(
    [
      "docker",
      "buildx",
      "build",
      "--progress",
      "plain",
      "--pull",
      "--label",
      DOCKER_RUNTIME_LABEL,
      "--label",
      `${DOCKER_DEPLOYMENT_LABEL_KEY}=${sanitizeDockerLabelValue(ctx.deploymentId)}`,
      "--output",
      `type=oci,dest=${outputPath}`,
      contextDir
    ],
    { cwd: contextDir, ctx }
  );

  if (result.code !== 0) {
    throw new Error(`OCI image build failed: ${result.stderr || result.stdout}`);
  }
};

const buildAndUploadStaticRuntimeOciArtifact = async (
  ctx: BuildContext,
  outputDir: string,
  workDir: string
): Promise<OciRuntimeArtifact> => {
  const ociArchivePath = path.join(workDir, "runtime-image.oci.tar");
  const contextDir = await createStaticRuntimeImageContext(outputDir, workDir);
  await buildOciArchiveFromContext(contextDir, ociArchivePath, ctx);

  const artifactKey = `${ctx.artifactPrefix}/runtime-image.oci.tar`;
  await upload(artifactKey, Bun.file(ociArchivePath), {
    contentType: "application/vnd.oci.image.layer.v1.tar"
  });

  return {
    ref: `oci://${artifactKey}`,
    artifactKey
  };
};

const buildAndUploadServerRuntimeOciArtifact = async (
  ctx: BuildContext,
  repoDir: string,
  workDir: string
): Promise<OciRuntimeArtifact | null> => {
  const dockerfilePath = path.join(repoDir, "Dockerfile");
  if (!(await exists(dockerfilePath))) {
    logLine(ctx, "No Dockerfile found for server runtime image export; skipping OCI runtime artifact");
    return null;
  }

  const ociArchivePath = path.join(workDir, "runtime-image.oci.tar");
  await buildOciArchiveFromContext(repoDir, ociArchivePath, ctx);

  const artifactKey = `${ctx.artifactPrefix}/runtime-image.oci.tar`;
  await upload(artifactKey, Bun.file(ociArchivePath), {
    contentType: "application/vnd.oci.image.layer.v1.tar"
  });

  return {
    ref: `oci://${artifactKey}`,
    artifactKey
  };
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

const getProjectBuildEnv = async (projectId: string): Promise<Record<string, string>> => {
  const rows = await db
    .select({
      key: schema.projectEnvs.key,
      value: schema.projectEnvs.value,
      isPublic: schema.projectEnvs.isPublic
    })
    .from(schema.projectEnvs)
    .where(eq(schema.projectEnvs.projectId, projectId));

  const env: Record<string, string> = {};
  for (const row of rows) {
    if (row.isPublic) {
      env[row.key] = row.value;
    }
  }

  return env;
};

const buildProject = async (
  repoUrl: string,
  branch: string,
  ctx: BuildContext,
  githubToken: string | null,
  envFile: string | undefined,
  projectBuildEnv: Record<string, string>
): Promise<{
  buildStrategy: DeploymentBuildStrategy;
  serveStrategy: ServeStrategy;
  runtimeImageRef: string | null;
  runtimeImageArtifactKey: string | null;
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

    ctx.repoDir = extractedRoot;
    const combinedBuildEnv = await prepareBuildEnv(extractedRoot, projectBuildEnv, envFile, ctx);

    const strategy = await detectBuildStrategy(extractedRoot, detectionRuntime);
    if (!strategy) {
      throw new Error(
        "Unsupported project type. Expected Node (package.json) or Python (pyproject.toml/requirements.txt)."
      );
    }

    logLine(ctx, `Detected build strategy: ${strategy.id}`);
    const buildConfig = await getBuildContainerConfig();
    const runtime = createBuildRuntime(ctx, strategy.id, buildConfig);

    const result = await strategy.build(
      extractedRoot,
      {
        deploymentId: ctx.deploymentId,
        logs: ctx.logs,
        log: (line: string) => logLine(ctx, line),
        env: combinedBuildEnv
      },
      runtime
    );

    let runtimeImageRef: string | null = null;
    let runtimeImageArtifactKey: string | null = null;

    if (result.serveStrategy === "static") {
      if (!result.outputDir) {
        throw new Error(`Build strategy '${result.buildStrategy}' did not provide an output directory`);
      }

      logLine(ctx, `Uploading artifacts from ${path.basename(result.outputDir)}`);
      await uploadArtifacts(ctx, result.outputDir);
      logLine(ctx, "Artifact upload complete");

      try {
        logLine(ctx, "Building standardized OCI runtime artifact for static output");
        const runtimeArtifact = await buildAndUploadStaticRuntimeOciArtifact(ctx, result.outputDir, workDir);
        runtimeImageRef = runtimeArtifact.ref;
        runtimeImageArtifactKey = runtimeArtifact.artifactKey;
        logLine(ctx, `OCI runtime artifact uploaded (${runtimeImageArtifactKey})`);
      } catch (error) {
        logLine(
          ctx,
          `OCI runtime artifact generation skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      logLine(ctx, "Build completed with server serve strategy; skipping static artifact upload");

      try {
        logLine(ctx, "Building standardized OCI runtime artifact for server output");
        const runtimeArtifact = await buildAndUploadServerRuntimeOciArtifact(ctx, extractedRoot, workDir);
        if (runtimeArtifact) {
          runtimeImageRef = runtimeArtifact.ref;
          runtimeImageArtifactKey = runtimeArtifact.artifactKey;
          logLine(ctx, `OCI runtime artifact uploaded (${runtimeImageArtifactKey})`);
        }
      } catch (error) {
        logLine(
          ctx,
          `OCI runtime artifact generation skipped: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    return {
      buildStrategy: result.buildStrategy,
      serveStrategy: result.serveStrategy,
      runtimeImageRef,
      runtimeImageArtifactKey
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

  let githubToken: string | null = null;
  if (project.userId) {
    const [account] = await db
      .select({ accessToken: schema.accounts.accessToken })
      .from(schema.accounts)
      .where(
        and(eq(schema.accounts.userId, project.userId), eq(schema.accounts.providerId, "github"))
      )
      .limit(1);
    if (account?.accessToken) {
      githubToken = account.accessToken;
    }
  }

  const buildEnv = await getProjectBuildEnv(project.id);

  await db
    .update(schema.deployments)
    .set({ status: "building" })
    .where(eq(schema.deployments.id, deployment.id));

  const logs: string[] = [];
  const ctx: BuildContext = {
    repoDir: "",
    artifactPrefix: deployment.artifactPrefix,
    deploymentId: deployment.id,
    logs
  };

  logLine(ctx, `Loaded ${Object.keys(buildEnv).length} persisted build environment variable(s)`);

  let status: "success" | "failed" = "success";
  let buildStrategy: DeploymentBuildStrategy = "unknown";
  let serveStrategy: ServeStrategy = "static";
  let runtimeImageRef: string | null = null;
  let runtimeImageArtifactKey: string | null = null;

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
      buildEnv
    );
    buildStrategy = buildResult.buildStrategy;
    serveStrategy = buildResult.serveStrategy;
    runtimeImageRef = buildResult.runtimeImageRef;
    runtimeImageArtifactKey = buildResult.runtimeImageArtifactKey;
  } catch (error) {
    status = "failed";
    logLine(ctx, `Build error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
    try {
      const cleanedAfter = await pruneBuildContainers({ deploymentId: deployment.id, includeRunning: true });
      if (cleanedAfter > 0) {
        logLine(ctx, `Pruned ${cleanedAfter} build container(s) after completion`);
      }
    } catch (cleanupError) {
      console.error("Failed to cleanup build containers:", cleanupError);
    }

    const logKey = `${deployment.artifactPrefix}/build.log`;
    const logBody = logs.join("\n") + "\n";
    let uploadedLogKey: string | null = null;
    if (isStorageConfigured()) {
      try {
        await upload(logKey, logBody, { contentType: "text/plain; charset=utf-8" });
        uploadedLogKey = logKey;
      } catch (err) {
        console.error("Failed to upload build logs:", err);
      }
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
        runtimeImageArtifactKey
      })
      .where(eq(schema.deployments.id, deployment.id));
  }
};

export const runLoop = async () => {
  try {
    const cleaned = await pruneBuildContainers();
    if (cleaned > 0) {
      console.warn(`Recovered by pruning ${cleaned} stale build container(s).`);
    }
  } catch (error) {
    console.error("Failed to prune stale build containers at worker startup:", error);
  }

  while (true) {
    const payload = await dequeueDeployment(5);
    if (!payload) continue;

    let job: DeploymentJob | null = null;
    try {
      job = JSON.parse(payload) as DeploymentJob;
    } catch (err) {
      console.error("Invalid deployment payload:", err);
    }

    if (!job || !job.deploymentId) {
      try {
        await ackDeployment(payload);
      } catch (err) {
        console.error("Failed to ack invalid deployment payload:", err);
      }
      continue;
    }

    try {
      await processJob(job);
    } catch (error) {
      console.error("Build failed:", error);
    } finally {
      try {
        await ackDeployment(payload);
      } catch (err) {
        console.error("Failed to ack deployment:", err);
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
