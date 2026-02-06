import { and, eq } from "drizzle-orm";
import { mkdir, mkdtemp, readdir, rm, stat } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { buildZipballUrl, parseGitHubRepoUrl } from "../github";
import { ackDeployment, dequeueDeployment, type DeploymentJob } from "../queue";
import { getRedisClient } from "../redis";
import { isStorageConfigured, upload } from "../storage";
import { guessContentType } from "../utils/contentType";
import { detectBuildStrategy } from "./build/registry";
import type { BuildRuntime, DeploymentBuildStrategy, ServeStrategy } from "./build/types";

const buildPreviewUrl = (shortId: string) =>
  `${config.devProtocol}://${shortId}.${config.devDomain}:${config.port}`;

const DEPLOYMENT_LOG_CHANNEL_PREFIX = "deployment:";
const DEPLOYMENT_LOG_CHANNEL_SUFFIX = ":logs";

type BuildContext = {
  repoDir: string;
  artifactPrefix: string;
  deploymentId: string;
  logs: string[];
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

const runCommand = async (
  cmd: string[],
  options: { cwd: string; env?: Record<string, string> }
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const proc = Bun.spawn(cmd, {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe"
  });
  const stdoutPromise = proc.stdout ? new Response(proc.stdout).text() : Promise.resolve("");
  const stderrPromise = proc.stderr ? new Response(proc.stderr).text() : Promise.resolve("");
  const [stdout, stderr, code] = await Promise.all([stdoutPromise, stderrPromise, proc.exited]);
  return { code, stdout, stderr };
};

const resolveBunCli = (): { command: string; env?: Record<string, string> } => {
  const bunBinary = Bun.which("bun");
  if (bunBinary) {
    return { command: bunBinary };
  }
  return {
    command: process.execPath,
    env: { BUN_BE_BUN: "1" }
  };
};

const buildRuntime: BuildRuntime = {
  exists,
  isDirectory,
  readJson,
  readToml,
  runCommand,
  resolveBunCli
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
  const result = await runCommand(["unzip", "-q", zipPath, "-d", targetDir], { cwd: targetDir });
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

const buildProject = async (
  repoUrl: string,
  branch: string,
  ctx: BuildContext,
  githubToken: string | null
): Promise<{ buildStrategy: DeploymentBuildStrategy; serveStrategy: ServeStrategy }> => {
  if (!isStorageConfigured()) {
    throw new Error("S3 storage is not configured");
  }

  const workDir = await mkdtemp(path.join(tmpdir(), "build-"));
  try {
    const zipPath = await downloadRepo(repoUrl, branch, workDir, ctx, githubToken);
    const extractedRoot = await extractRepo(zipPath, path.join(workDir, "repo"), ctx);
    ctx.repoDir = extractedRoot;

    const strategy = await detectBuildStrategy(extractedRoot, buildRuntime);
    if (!strategy) {
      throw new Error(
        "Unsupported project type. Expected Node (package.json) or Python (pyproject.toml/requirements.txt)."
      );
    }

    logLine(ctx, `Detected build strategy: ${strategy.id}`);

    const result = await strategy.build(
      extractedRoot,
      {
        deploymentId: ctx.deploymentId,
        logs: ctx.logs,
        log: (line: string) => logLine(ctx, line)
      },
      buildRuntime
    );

    if (result.serveStrategy === "static") {
      if (!result.outputDir) {
        throw new Error(`Build strategy '${result.buildStrategy}' did not provide an output directory`);
      }

      logLine(ctx, `Uploading artifacts from ${path.basename(result.outputDir)}`);
      await uploadArtifacts(ctx, result.outputDir);
      logLine(ctx, "Artifact upload complete");
    } else {
      logLine(ctx, "Build completed with server serve strategy; skipping static artifact upload");
    }

    return {
      buildStrategy: result.buildStrategy,
      serveStrategy: result.serveStrategy
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
  let status: "success" | "failed" = "success";
  let buildStrategy: DeploymentBuildStrategy = "unknown";
  let serveStrategy: ServeStrategy = "static";
  try {
    const buildResult = await buildProject(project.repoUrl, project.branch, ctx, githubToken);
    buildStrategy = buildResult.buildStrategy;
    serveStrategy = buildResult.serveStrategy;
  } catch (error) {
    status = "failed";
    logLine(ctx, `Build error: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  } finally {
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
        serveStrategy
      })
      .where(eq(schema.deployments.id, deployment.id));
  }
};

const runLoop = async () => {
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

runLoop().catch((err) => {
  console.error("Build worker crashed:", err);
  process.exit(1);
});
