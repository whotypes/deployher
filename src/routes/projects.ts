import { and, asc, desc, eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { resolveProjectDomains } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { normalizeGitHubRepoUrl } from "../github";
import { badRequest, json, notFound, parseJson } from "../http/helpers";
import { parseRepoRelativePath, parseRuntimeImageMode } from "../lib/projectPaths";
import { parseSidebarProjectDeploymentStatus } from "../lib/sidebarProjectDeploymentStatus";
import { pickFeaturedDeploymentFromSortedDesc } from "../lib/sidebarFeaturedDeployment";
import { parseProjectCommandForStorage } from "../lib/parseProjectCommandLine";
import { refreshProjectSiteMetadata } from "../lib/projectSiteMetadata";

type Project = typeof schema.projects.$inferSelect;
type ProjectEnv = typeof schema.projectEnvs.$inferSelect;
type PreviewMode = typeof schema.projects.$inferSelect.previewMode;
type ServerPreviewTarget = typeof schema.projects.$inferSelect.serverPreviewTarget;
type FrameworkHint = typeof schema.projects.$inferSelect.frameworkHint;
type RuntimeImageMode = typeof schema.projects.$inferSelect.runtimeImageMode;

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_ENV_KEY_LENGTH = 128;
const MAX_ENV_VALUE_LENGTH = 16 * 1024;
const DEFAULT_RUNTIME_CONTAINER_PORT = 3000;
const PREVIEW_MODES = new Set<PreviewMode>(["auto", "static", "server"]);
const SERVER_PREVIEW_TARGETS = new Set<ServerPreviewTarget>(["isolated-runner"]);
const FRAMEWORK_HINTS = new Set<FrameworkHint>(["auto", "nextjs", "node", "python", "static"]);

const parsePreviewMode = (value: unknown): PreviewMode | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as PreviewMode;
  return PREVIEW_MODES.has(normalized) ? normalized : null;
};

const parseServerPreviewTarget = (value: unknown): ServerPreviewTarget | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as ServerPreviewTarget;
  return SERVER_PREVIEW_TARGETS.has(normalized) ? normalized : null;
};

const parseFrameworkHint = (value: unknown): FrameworkHint | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as FrameworkHint;
  return FRAMEWORK_HINTS.has(normalized) ? normalized : null;
};

const parseProjectRootDir = (value: unknown): string | null => parseRepoRelativePath(value);

const parseDockerfilePath = (value: unknown): string | null => {
  if (value === null) return null;
  const parsed = parseRepoRelativePath(value);
  return parsed;
};

const parseDockerBuildTarget = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const parseRuntimeContainerPort = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= 1 && normalized <= 65535 ? normalized : null;
};

const validateProjectBuildConfiguration = (config: {
  workspaceRootDir: string;
  projectRootDir: string;
  previewMode: PreviewMode;
  runtimeImageMode: RuntimeImageMode;
  skipHostStrategyBuild: boolean;
}): string | null => {
  const workspaceParts = config.workspaceRootDir === "." ? [] : config.workspaceRootDir.split("/");
  const projectParts = config.projectRootDir === "." ? [] : config.projectRootDir.split("/");
  for (let index = 0; index < workspaceParts.length; index += 1) {
    if (workspaceParts[index] !== projectParts[index]) {
      return "workspaceRootDir must be the same as or an ancestor of projectRootDir";
    }
  }
  if (config.skipHostStrategyBuild && config.previewMode !== "server") {
    return "skipHostStrategyBuild requires previewMode=server";
  }
  return null;
};

const getProjectForUser = async (projectId: string, userId: string) => {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return project ?? null;
};

const serializeProjectEnv = (envRow: ProjectEnv) => ({
  id: envRow.id,
  projectId: envRow.projectId,
  key: envRow.key,
  value: envRow.value,
  isPublic: envRow.isPublic,
  createdAt: envRow.createdAt.toISOString(),
  updatedAt: envRow.updatedAt.toISOString()
});

const withProjectMeta = (project: Project) => ({
  ...project,
  domains: resolveProjectDomains(project)
});

export const listProjects = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;
  const rows = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.createdAt));
  return json(rows.map(withProjectMeta));
};

export const listSidebarProjectSummariesForUser = async (userId: string) => {
  const rows = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      currentStatus: schema.deployments.status,
      siteIconUrl: schema.projects.siteIconUrl,
      siteOgImageUrl: schema.projects.siteOgImageUrl
    })
    .from(schema.projects)
    .leftJoin(
      schema.deployments,
      eq(schema.projects.currentDeploymentId, schema.deployments.id)
    )
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.createdAt));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    deploymentStatus: parseSidebarProjectDeploymentStatus(r.currentStatus),
    siteIconUrl: r.siteIconUrl ?? null,
    siteOgImageUrl: r.siteOgImageUrl ?? null
  }));
};

export const getSidebarFeaturedDeploymentForProject = async (projectId: string) => {
  const rows = await db
    .select({
      id: schema.deployments.id,
      shortId: schema.deployments.shortId,
      status: schema.deployments.status
    })
    .from(schema.deployments)
    .where(eq(schema.deployments.projectId, projectId))
    .orderBy(desc(schema.deployments.createdAt));
  return pickFeaturedDeploymentFromSortedDesc(rows);
};

export const createProject = async (req: RequestWithParamsAndSession) => {
  const body = await parseJson<{
    name?: unknown;
    repoUrl?: unknown;
    branch?: unknown;
    workspaceRootDir?: unknown;
    projectRootDir?: unknown;
    frameworkHint?: unknown;
    previewMode?: unknown;
    serverPreviewTarget?: unknown;
    runtimeImageMode?: unknown;
    dockerfilePath?: unknown;
    dockerBuildTarget?: unknown;
    skipHostStrategyBuild?: unknown;
    runtimeContainerPort?: unknown;
    installCommand?: unknown;
    buildCommand?: unknown;
  }>(req);
  if (!body || typeof body.name !== "string" || typeof body.repoUrl !== "string" || typeof body.branch !== "string") {
    return badRequest("name, repoUrl and branch are required");
  }

  const name = body.name.trim();
  const repoUrl = body.repoUrl.trim();
  const branch = body.branch.trim();
  if (!name || !repoUrl || !branch) {
    return badRequest("name, repoUrl and branch must be non-empty");
  }

  const normalizedRepoUrl = normalizeGitHubRepoUrl(repoUrl);
  if (!normalizedRepoUrl) {
    return badRequest("repoUrl must be a valid https://github.com/<owner>/<repo> URL");
  }
  const previewMode =
    body.previewMode === undefined ? "auto" : parsePreviewMode(body.previewMode);
  if (!previewMode) {
    return badRequest("previewMode must be one of: auto, static, server");
  }
  const serverPreviewTarget =
    body.serverPreviewTarget === undefined
      ? "isolated-runner"
      : parseServerPreviewTarget(body.serverPreviewTarget);
  if (!serverPreviewTarget) {
    return badRequest("serverPreviewTarget must be: isolated-runner");
  }
  const projectRootDir =
    body.projectRootDir === undefined ? "." : parseProjectRootDir(body.projectRootDir);
  if (!projectRootDir) {
    return badRequest("projectRootDir must be a relative repository path like . or apps/web");
  }
  const workspaceRootDir =
    body.workspaceRootDir === undefined ? "." : parseProjectRootDir(body.workspaceRootDir);
  if (!workspaceRootDir) {
    return badRequest("workspaceRootDir must be a relative repository path like . or apps");
  }
  const frameworkHint =
    body.frameworkHint === undefined ? "auto" : parseFrameworkHint(body.frameworkHint);
  if (!frameworkHint) {
    return badRequest("frameworkHint must be one of: auto, nextjs, node, python, static");
  }
  const runtimeImageMode =
    body.runtimeImageMode === undefined ? "auto" : parseRuntimeImageMode(body.runtimeImageMode);
  if (!runtimeImageMode) {
    return badRequest("runtimeImageMode must be one of: auto, platform, dockerfile");
  }
  const dockerfilePath =
    body.dockerfilePath === undefined ? null : parseDockerfilePath(body.dockerfilePath);
  if (body.dockerfilePath !== undefined && dockerfilePath == null && body.dockerfilePath !== null) {
    return badRequest("dockerfilePath must be a relative repository path like Dockerfile or apps/api/Dockerfile");
  }
  const dockerBuildTarget =
    body.dockerBuildTarget === undefined ? null : parseDockerBuildTarget(body.dockerBuildTarget);
  if (body.dockerBuildTarget !== undefined && dockerBuildTarget == null && body.dockerBuildTarget !== null) {
    return badRequest("dockerBuildTarget must be a non-empty string when provided");
  }
  const skipHostStrategyBuild =
    body.skipHostStrategyBuild === undefined ? false : body.skipHostStrategyBuild;
  if (typeof skipHostStrategyBuild !== "boolean") {
    return badRequest("skipHostStrategyBuild must be a boolean");
  }
  const runtimeContainerPort =
    body.runtimeContainerPort === undefined
      ? DEFAULT_RUNTIME_CONTAINER_PORT
      : parseRuntimeContainerPort(body.runtimeContainerPort);
  if (runtimeContainerPort == null) {
    return badRequest("runtimeContainerPort must be an integer between 1 and 65535");
  }
  const configError = validateProjectBuildConfiguration({
    workspaceRootDir,
    projectRootDir,
    previewMode,
    runtimeImageMode,
    skipHostStrategyBuild
  });
  if (configError) {
    return badRequest(configError);
  }

  let installCommand: string | null = null;
  if (body.installCommand !== undefined) {
    const parsed = parseProjectCommandForStorage(body.installCommand, "installCommand");
    if (!parsed.ok) return badRequest(parsed.error);
    installCommand = parsed.stored;
  }
  let buildCommand: string | null = null;
  if (body.buildCommand !== undefined) {
    const parsed = parseProjectCommandForStorage(body.buildCommand, "buildCommand");
    if (!parsed.ok) return badRequest(parsed.error);
    buildCommand = parsed.stored;
  }

  const userId = req.session.user.id;
  const [project] = await db
    .insert(schema.projects)
    .values({
      name,
      repoUrl: normalizedRepoUrl,
      branch,
      workspaceRootDir,
      projectRootDir,
      frameworkHint,
      userId,
      previewMode,
      serverPreviewTarget,
      runtimeImageMode,
      dockerfilePath,
      dockerBuildTarget,
      skipHostStrategyBuild,
      runtimeContainerPort,
      installCommand,
      buildCommand
    })
    .returning();

  if (!project) {
    return notFound("Project not found");
  }

  return json(withProjectMeta(project), { status: 201 });
};

export const getProject = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) {
    return notFound("Project not found");
  }
  const userId = req.session.user.id;
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) {
    return notFound("Project not found");
  }

  return json(withProjectMeta(project));
};

export const listProjectEnvs = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) {
    return notFound("Project not found");
  }

  const userId = req.session.user.id;
  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return notFound("Project not found");
  }

  const rows = await db
    .select()
    .from(schema.projectEnvs)
    .where(eq(schema.projectEnvs.projectId, projectId))
    .orderBy(asc(schema.projectEnvs.key));

  return json(rows.map(serializeProjectEnv));
};

type UpsertProjectEnvBody = {
  id?: unknown;
  key?: unknown;
  value?: unknown;
  isPublic?: unknown;
};

export const upsertProjectEnv = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) {
    return notFound("Project not found");
  }

  const userId = req.session.user.id;
  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return notFound("Project not found");
  }

  const body = await parseJson<UpsertProjectEnvBody>(req);
  if (!body) {
    return badRequest("Invalid JSON body");
  }

  if (typeof body.key !== "string") {
    return badRequest("key is required and must be a string");
  }
  if (typeof body.value !== "string") {
    return badRequest("value is required and must be a string");
  }

  const key = body.key.trim();
  if (!key) {
    return badRequest("key must be non-empty");
  }
  if (key.length > MAX_ENV_KEY_LENGTH) {
    return badRequest(`key must be at most ${MAX_ENV_KEY_LENGTH} characters`);
  }
  if (!ENV_KEY_REGEX.test(key)) {
    return badRequest("key must match [A-Za-z_][A-Za-z0-9_]*");
  }
  if (body.value.length > MAX_ENV_VALUE_LENGTH) {
    return badRequest(`value must be at most ${MAX_ENV_VALUE_LENGTH} characters`);
  }

  const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : false;
  const now = new Date();
  const envId = typeof body.id === "string" && body.id.trim() ? body.id.trim() : null;

  if (envId) {
    const [existingById] = await db
      .select({ id: schema.projectEnvs.id })
      .from(schema.projectEnvs)
      .where(and(eq(schema.projectEnvs.id, envId), eq(schema.projectEnvs.projectId, projectId)))
      .limit(1);
    if (!existingById) {
      return notFound("Environment variable not found");
    }

    const [conflict] = await db
      .select({ id: schema.projectEnvs.id })
      .from(schema.projectEnvs)
      .where(and(
        eq(schema.projectEnvs.projectId, projectId),
        eq(schema.projectEnvs.key, key)
      ))
      .limit(1);
    if (conflict && conflict.id !== envId) {
      return badRequest("An environment variable with this key already exists");
    }

    const [updated] = await db
      .update(schema.projectEnvs)
      .set({
        key,
        value: body.value,
        isPublic,
        updatedAt: now
      })
      .where(and(eq(schema.projectEnvs.id, envId), eq(schema.projectEnvs.projectId, projectId)))
      .returning();

    if (!updated) {
      return notFound("Environment variable not found");
    }

    return json(serializeProjectEnv(updated));
  }

  const [existingByKey] = await db
    .select()
    .from(schema.projectEnvs)
    .where(and(eq(schema.projectEnvs.projectId, projectId), eq(schema.projectEnvs.key, key)))
    .limit(1);

  if (existingByKey) {
    const [updated] = await db
      .update(schema.projectEnvs)
      .set({
        value: body.value,
        isPublic,
        updatedAt: now
      })
      .where(eq(schema.projectEnvs.id, existingByKey.id))
      .returning();

    if (!updated) {
      return notFound("Environment variable not found");
    }

    return json(serializeProjectEnv(updated));
  }

  const [created] = await db
    .insert(schema.projectEnvs)
    .values({
      projectId,
      key,
      value: body.value,
      isPublic
    })
    .returning();

  if (!created) {
    return notFound("Environment variable not found");
  }

  return json(serializeProjectEnv(created), { status: 201 });
};

export const deleteProjectEnv = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  const envId = req.params["envId"];
  if (!projectId) {
    return notFound("Project not found");
  }
  if (!envId) {
    return notFound("Environment variable not found");
  }

  const userId = req.session.user.id;
  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return notFound("Project not found");
  }

  const [deleted] = await db
    .delete(schema.projectEnvs)
    .where(and(eq(schema.projectEnvs.id, envId), eq(schema.projectEnvs.projectId, projectId)))
    .returning({ id: schema.projectEnvs.id });

  if (!deleted) {
    return notFound("Environment variable not found");
  }

  return json({ deleted: true, id: deleted.id });
};

export const updateProject = async (req: RequestWithParamsAndSession) => {
  const body = await parseJson<{
    name?: unknown;
    repoUrl?: unknown;
    branch?: unknown;
    workspaceRootDir?: unknown;
    projectRootDir?: unknown;
    frameworkHint?: unknown;
    previewMode?: unknown;
    serverPreviewTarget?: unknown;
    runtimeImageMode?: unknown;
    dockerfilePath?: unknown;
    dockerBuildTarget?: unknown;
    skipHostStrategyBuild?: unknown;
    runtimeContainerPort?: unknown;
    installCommand?: unknown;
    buildCommand?: unknown;
    currentDeploymentId?: unknown;
  }>(req);
  if (!body) {
    return badRequest("Invalid JSON body");
  }

  const updates: Partial<typeof schema.projects.$inferInsert> = {
    updatedAt: new Date()
  };

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return badRequest("name must be a non-empty string");
    }
    updates.name = body.name.trim();
  }

  if (body.repoUrl !== undefined) {
    if (typeof body.repoUrl !== "string" || !body.repoUrl.trim()) {
      return badRequest("repoUrl must be a non-empty string");
    }
    const normalizedRepoUrl = normalizeGitHubRepoUrl(body.repoUrl);
    if (!normalizedRepoUrl) {
      return badRequest("repoUrl must be a valid https://github.com/<owner>/<repo> URL");
    }
    updates.repoUrl = normalizedRepoUrl;
  }

  if (body.branch !== undefined) {
    if (typeof body.branch !== "string" || !body.branch.trim()) {
      return badRequest("branch must be a non-empty string");
    }
    updates.branch = body.branch.trim();
  }

  if (body.workspaceRootDir !== undefined) {
    const workspaceRootDir = parseProjectRootDir(body.workspaceRootDir);
    if (!workspaceRootDir) {
      return badRequest("workspaceRootDir must be a relative repository path like . or apps");
    }
    updates.workspaceRootDir = workspaceRootDir;
  }

  if (body.projectRootDir !== undefined) {
    const projectRootDir = parseProjectRootDir(body.projectRootDir);
    if (!projectRootDir) {
      return badRequest("projectRootDir must be a relative repository path like . or apps/web");
    }
    updates.projectRootDir = projectRootDir;
  }

  if (body.frameworkHint !== undefined) {
    const frameworkHint = parseFrameworkHint(body.frameworkHint);
    if (!frameworkHint) {
      return badRequest("frameworkHint must be one of: auto, nextjs, node, python, static");
    }
    updates.frameworkHint = frameworkHint;
  }

  if (body.previewMode !== undefined) {
    const previewMode = parsePreviewMode(body.previewMode);
    if (!previewMode) {
      return badRequest("previewMode must be one of: auto, static, server");
    }
    updates.previewMode = previewMode;
  }

  if (body.serverPreviewTarget !== undefined) {
    const serverPreviewTarget = parseServerPreviewTarget(body.serverPreviewTarget);
    if (!serverPreviewTarget) {
      return badRequest("serverPreviewTarget must be: isolated-runner");
    }
    updates.serverPreviewTarget = serverPreviewTarget;
  }
  if (body.runtimeImageMode !== undefined) {
    const runtimeImageMode = parseRuntimeImageMode(body.runtimeImageMode);
    if (!runtimeImageMode) {
      return badRequest("runtimeImageMode must be one of: auto, platform, dockerfile");
    }
    updates.runtimeImageMode = runtimeImageMode;
  }
  if (body.dockerfilePath !== undefined) {
    const dockerfilePath = parseDockerfilePath(body.dockerfilePath);
    if (body.dockerfilePath !== null && dockerfilePath == null) {
      return badRequest("dockerfilePath must be a relative repository path like Dockerfile or apps/api/Dockerfile");
    }
    updates.dockerfilePath = dockerfilePath;
  }
  if (body.dockerBuildTarget !== undefined) {
    const dockerBuildTarget = parseDockerBuildTarget(body.dockerBuildTarget);
    if (body.dockerBuildTarget !== null && dockerBuildTarget == null) {
      return badRequest("dockerBuildTarget must be a non-empty string when provided");
    }
    updates.dockerBuildTarget = dockerBuildTarget;
  }
  if (body.skipHostStrategyBuild !== undefined) {
    if (typeof body.skipHostStrategyBuild !== "boolean") {
      return badRequest("skipHostStrategyBuild must be a boolean");
    }
    updates.skipHostStrategyBuild = body.skipHostStrategyBuild;
  }
  if (body.runtimeContainerPort !== undefined) {
    const runtimeContainerPort = parseRuntimeContainerPort(body.runtimeContainerPort);
    if (runtimeContainerPort == null) {
      return badRequest("runtimeContainerPort must be an integer between 1 and 65535");
    }
    updates.runtimeContainerPort = runtimeContainerPort;
  }

  if (body.installCommand !== undefined) {
    const parsed = parseProjectCommandForStorage(body.installCommand, "installCommand");
    if (!parsed.ok) return badRequest(parsed.error);
    updates.installCommand = parsed.stored;
  }
  if (body.buildCommand !== undefined) {
    const parsed = parseProjectCommandForStorage(body.buildCommand, "buildCommand");
    if (!parsed.ok) return badRequest(parsed.error);
    updates.buildCommand = parsed.stored;
  }

  if (body.currentDeploymentId !== undefined) {
    if (body.currentDeploymentId !== null && typeof body.currentDeploymentId !== "string") {
      return badRequest("currentDeploymentId must be a string UUID or null");
    }
    updates.currentDeploymentId =
      body.currentDeploymentId === null ? null : body.currentDeploymentId.trim() || null;
  }

  if (Object.keys(updates).length <= 1) {
    return badRequest("Provide at least one field to update");
  }

  const id = req.params["id"];
  if (!id) {
    return notFound("Project not found");
  }
  const userId = req.session.user.id;
  const existingProject = await getProjectForUser(id, userId);
  if (!existingProject) {
    return notFound("Project not found");
  }

  const configError = validateProjectBuildConfiguration({
    workspaceRootDir: updates.workspaceRootDir ?? existingProject.workspaceRootDir,
    projectRootDir: updates.projectRootDir ?? existingProject.projectRootDir,
    previewMode: updates.previewMode ?? existingProject.previewMode,
    runtimeImageMode: updates.runtimeImageMode ?? existingProject.runtimeImageMode,
    skipHostStrategyBuild:
      updates.skipHostStrategyBuild ?? existingProject.skipHostStrategyBuild
  });
  if (configError) {
    return badRequest(configError);
  }

  if (updates.currentDeploymentId !== undefined) {
    const targetId = updates.currentDeploymentId;
    if (targetId === null) {
      // allow clearing current pointer
    } else {
      const [dep] = await db
        .select({
          id: schema.deployments.id,
          status: schema.deployments.status
        })
        .from(schema.deployments)
        .where(
          and(eq(schema.deployments.id, targetId), eq(schema.deployments.projectId, id))
        )
        .limit(1);
      if (!dep) {
        return badRequest("currentDeploymentId must reference a deployment that belongs to this project");
      }
      if (dep.status !== "success") {
        return badRequest("currentDeploymentId must reference a successful deployment");
      }
    }
  }

  const [project] = await db
    .update(schema.projects)
    .set(updates)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
    .returning();

  if (!project) {
    return notFound("Project not found");
  }

  return json(withProjectMeta(project));
};

export const postRefreshProjectSiteMetadata = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) {
    return notFound("Project not found");
  }
  const userId = req.session.user.id;
  const [owned] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!owned) {
    return notFound("Project not found");
  }
  const result = await refreshProjectSiteMetadata(id);
  if (!result.ok) {
    return json({ error: result.error }, { status: 422 });
  }
  return json({
    ok: true,
    siteIconUrl: result.siteIconUrl,
    siteOgImageUrl: result.siteOgImageUrl,
    siteMetaFetchedAt: result.siteMetaFetchedAt.toISOString()
  });
};

export const deleteProject = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) {
    return notFound("Project not found");
  }
  const userId = req.session.user.id;
  const [deleted] = await db
    .delete(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
    .returning();

  if (!deleted) {
    return notFound("Project not found");
  }

  return json({ deleted: true, id: deleted.id });
};
