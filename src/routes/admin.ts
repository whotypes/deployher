import { and, eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { buildExampleRowsForUser } from "../admin/exampleDeployments";
import {
  getBuildContainerConfig,
  updateBuildContainerConfig,
  type BuildContainerConfig
} from "../admin/buildSettings";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { parseExampleRepoUrl, resolveLocalExample, toExampleRepoUrl } from "../examples";
import { json, notFound } from "../http/helpers";
import { enqueueDeployment } from "../queue";
import { isRedisConfigured } from "../redis";
import { isStorageConfigured } from "../storage";
import { generateShortId } from "../utils/shortId";
import { onDeploymentTerminalStatus } from "../lib/projectAlerts";

const pythonServerStreamProjectSeed = {
  previewMode: "server" as const,
  skipHostStrategyBuild: true,
  runtimeImageMode: "dockerfile" as const,
  runtimeContainerPort: 3000,
  frameworkHint: "python" as const
};

const exampleProjectSeed = (
  exampleName: string
): Partial<typeof schema.projects.$inferInsert> | undefined => {
  if (exampleName === "python-server-stream") {
    return pythonServerStreamProjectSeed;
  }
  return undefined;
};

const needsPythonServerStreamProjectFix = (project: typeof schema.projects.$inferSelect): boolean => {
  if (parseExampleRepoUrl(project.repoUrl) !== "python-server-stream") {
    return false;
  }
  return (
    !project.skipHostStrategyBuild ||
    project.previewMode !== "server" ||
    project.runtimeImageMode !== "dockerfile"
  );
};

const getOrCreateExampleProject = async (userId: string, exampleName: string) => {
  const repoUrl = toExampleRepoUrl(exampleName);
  const [existing] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.userId, userId), eq(schema.projects.repoUrl, repoUrl)))
    .limit(1);

  if (existing) {
    if (needsPythonServerStreamProjectFix(existing)) {
      const [fixed] = await db
        .update(schema.projects)
        .set({ ...pythonServerStreamProjectSeed, updatedAt: new Date() })
        .where(eq(schema.projects.id, existing.id))
        .returning();
      return fixed ?? existing;
    }
    return existing;
  }

  const seed = exampleProjectSeed(exampleName);
  const [created] = await db
    .insert(schema.projects)
    .values({
      userId,
      name: `example-${exampleName}`,
      repoUrl,
      branch: "local",
      ...seed
    })
    .returning();

  return created ?? null;
};

export const listExamples = async (req: RequestWithParamsAndSession) => {
  const examples = await buildExampleRowsForUser(req.session.user.id);
  return json({ examples });
};

export const createExampleDeployment = async (req: RequestWithParamsAndSession) => {
  if (!isRedisConfigured()) {
    return json({ error: "Redis is not configured" }, { status: 503 });
  }
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  const exampleName = req.params["name"];
  if (!exampleName) {
    return notFound("Example not found");
  }

  const resolvedExample = await resolveLocalExample(exampleName);
  if (!resolvedExample) {
    return notFound("Example not found");
  }

  const project = await getOrCreateExampleProject(req.session.user.id, resolvedExample.name);
  if (!project) {
    return json({ error: "Failed to create example project" }, { status: 500 });
  }

  const shortId = generateShortId();
  const [deployment] = await db
    .insert(schema.deployments)
    .values({
      projectId: project.id,
      shortId,
      artifactPrefix: `artifacts/${project.id}/${Date.now()}`,
      status: "queued"
    })
    .returning();

  if (!deployment) {
    return json({ error: "Failed to create deployment" }, { status: 500 });
  }

  await db
    .update(schema.projects)
    .set({ currentDeploymentId: deployment.id, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  try {
    await enqueueDeployment(deployment.id, { userId: req.session.user.id });
  } catch (err) {
    console.error("Failed to enqueue example deployment:", err);
    await db
      .update(schema.deployments)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(schema.deployments.id, deployment.id));
    void onDeploymentTerminalStatus(project.id, "failed");
    return json({ error: "Failed to queue deployment" }, { status: 503 });
  }

  return json({ deployment }, { status: 201 });
};

export const getBuildSettings = async (_req: RequestWithParamsAndSession) => {
  const config = await getBuildContainerConfig();
  return json(config);
};

const MEMORY_REGEX = /^\d+(\.\d+)?[kmgKMG]?$/;
const CPUS_REGEX = /^\d+(\.\d+)?$/;
const MAX_ACCOUNT_CONCURRENT = 100;

export const updateBuildSettings = async (req: RequestWithParamsAndSession) => {
  let body: Partial<BuildContainerConfig>;
  try {
    body = (await req.json()) as Partial<BuildContainerConfig>;
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const updates: Partial<BuildContainerConfig> = {};
  if (body.memory !== undefined) {
    const val = String(body.memory).trim();
    if (!val || !MEMORY_REGEX.test(val)) {
      return json(
        { error: "Invalid memory value (e.g. 1g, 512m, 2.5g)" },
        { status: 400 }
      );
    }
    updates.memory = val;
  }
  if (body.cpus !== undefined) {
    const val = String(body.cpus).trim();
    if (!val || !CPUS_REGEX.test(val)) {
      return json(
        { error: "Invalid cpus value (e.g. 0.5, 1, 2)" },
        { status: 400 }
      );
    }
    updates.cpus = val;
  }
  if (body.accountMaxConcurrent !== undefined) {
    const n = Number(body.accountMaxConcurrent);
    if (!Number.isFinite(n) || n < 0 || n > MAX_ACCOUNT_CONCURRENT) {
      return json(
        { error: `accountMaxConcurrent must be 0–${MAX_ACCOUNT_CONCURRENT}` },
        { status: 400 }
      );
    }
    updates.accountMaxConcurrent = Math.floor(n);
  }
  if (Object.keys(updates).length === 0) {
    return json({ error: "No valid fields to update" }, { status: 400 });
  }
  const config = await updateBuildContainerConfig(updates);
  return json(config);
};
