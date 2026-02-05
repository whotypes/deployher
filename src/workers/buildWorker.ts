import { eq } from "drizzle-orm";
import { mkdir, mkdtemp, readdir, rm, stat } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { ackDeployment, dequeueDeployment, type DeploymentJob } from "../queue";
import { buildZipballUrl, parseGitHubRepoUrl } from "../github";
import { getRedisClient } from "../redis";
import { isStorageConfigured, upload } from "../storage";
import { guessContentType } from "../utils/contentType";

const buildPreviewUrl = (shortId: string) =>
  `${config.devProtocol}://${shortId}.${config.devDomain}:${config.port}`;

const BUILD_OUTPUT_DIRS = ["dist", "build", "out", ".next", "public"];

const DEPLOYMENT_LOG_CHANNEL_PREFIX = "deployment:";
const DEPLOYMENT_LOG_CHANNEL_SUFFIX = ":logs";

type BuildContext = {
  repoDir: string;
  artifactPrefix: string;
  deploymentId: string;
  logs: string[];
};

type PackageManager = {
  name: "bun" | "pnpm" | "yarn" | "npm";
  install: string[];
  runBuild: string[];
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

const readJson = async <T>(filePath: string): Promise<T | null> => {
  try {
    const text = await Bun.file(filePath).text();
    return JSON.parse(text) as T;
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

const detectPackageManager = async (repoDir: string): Promise<PackageManager> => {
  const bunLock = path.join(repoDir, "bun.lockb");
  const bunLockText = path.join(repoDir, "bun.lock");
  const pnpmLock = path.join(repoDir, "pnpm-lock.yaml");
  const yarnLock = path.join(repoDir, "yarn.lock");
  const npmLock = path.join(repoDir, "package-lock.json");

  if (await exists(bunLock) || (await exists(bunLockText))) {
    return { name: "bun", install: ["bun", "install", "--frozen-lockfile"], runBuild: ["bun", "run", "build"] };
  }
  if (await exists(pnpmLock)) {
    return {
      name: "pnpm",
      install: ["pnpm", "install", "--frozen-lockfile"],
      runBuild: ["pnpm", "run", "build"]
    };
  }
  if (await exists(yarnLock)) {
    return {
      name: "yarn",
      install: ["yarn", "install", "--frozen-lockfile"],
      runBuild: ["yarn", "build"]
    };
  }
  if (await exists(npmLock)) {
    return { name: "npm", install: ["npm", "ci"], runBuild: ["npm", "run", "build"] };
  }
  return { name: "npm", install: ["npm", "install"], runBuild: ["npm", "run", "build"] };
};

const detectOutputDir = async (repoDir: string): Promise<string | null> => {
  for (const candidate of BUILD_OUTPUT_DIRS) {
    const full = path.join(repoDir, candidate);
    try {
      const s = await stat(full);
      if (s.isDirectory()) return full;
    } catch {
      // ignore
    }
  }
  return null;
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

const downloadRepo = async (repoUrl: string, targetDir: string, ctx: BuildContext) => {
  const spec = parseGitHubRepoUrl(repoUrl);
  if (!spec) {
    throw new Error("Only https://github.com/<owner>/<repo> URLs are supported for now.");
  }
  const zipUrl = buildZipballUrl(spec);
  logLine(ctx, `Downloading ${zipUrl}`);
  const response = await fetch(zipUrl, {
    headers: {
      "User-Agent": "vercel-clone-build",
      Accept: "application/vnd.github+json"
    }
  });
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

const runNodeBuild = async (repoDir: string, ctx: BuildContext) => {
  const pkg = await readJson<{ scripts?: Record<string, string> }>(path.join(repoDir, "package.json"));
  if (!pkg) throw new Error("package.json is unreadable");
  const manager = await detectPackageManager(repoDir);
  logLine(ctx, `Using ${manager.name} for install/build`);
  const env = {
    ...process.env,
    CI: "1",
    NODE_ENV: "production"
  };
  logLine(ctx, `Installing dependencies (${manager.install.join(" ")})`);
  const install = await runCommand(manager.install, { cwd: repoDir, env });
  if (install.stdout) ctx.logs.push(install.stdout.trim());
  if (install.stderr) ctx.logs.push(install.stderr.trim());
  if (install.code !== 0) {
    throw new Error(`Install failed: ${install.stderr || install.stdout}`);
  }
  if (pkg.scripts?.build) {
    logLine(ctx, `Running build (${manager.runBuild.join(" ")})`);
    const build = await runCommand(manager.runBuild, { cwd: repoDir, env });
    if (build.stdout) ctx.logs.push(build.stdout.trim());
    if (build.stderr) ctx.logs.push(build.stderr.trim());
    if (build.code !== 0) {
      throw new Error(`Build failed: ${build.stderr || build.stdout}`);
    }
  } else {
    logLine(ctx, "No build script found; skipping build step");
  }
};

const buildProject = async (repoUrl: string, ctx: BuildContext) => {
  if (!isStorageConfigured()) {
    throw new Error("S3 storage is not configured");
  }
  const workDir = await mkdtemp(path.join(tmpdir(), "build-"));
  try {
    const zipPath = await downloadRepo(repoUrl, workDir, ctx);
    const extractedRoot = await extractRepo(zipPath, path.join(workDir, "repo"), ctx);
    ctx.repoDir = extractedRoot;

    if (await exists(path.join(extractedRoot, "package.json"))) {
      await runNodeBuild(extractedRoot, ctx);
    } else {
      throw new Error("Unsupported project type (missing package.json)");
    }

    const outputDir = await detectOutputDir(extractedRoot);
    if (!outputDir) {
      throw new Error(`No build output found. Looked for: ${BUILD_OUTPUT_DIRS.join(", ")}`);
    }

    logLine(ctx, `Uploading artifacts from ${path.basename(outputDir)}`);
    await uploadArtifacts(ctx, outputDir);
    logLine(ctx, "Artifact upload complete");
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
  try {
    await buildProject(project.repoUrl, ctx);
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
      .set({ status, finishedAt: new Date(), buildLogKey: uploadedLogKey, previewUrl })
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
