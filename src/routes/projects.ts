import { and, asc, desc, eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { resolveProjectDomains } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { normalizeGitHubRepoUrl } from "../github";
import { badRequest, json, notFound, parseJson } from "../http/helpers";

type Project = typeof schema.projects.$inferSelect;
type ProjectEnv = typeof schema.projectEnvs.$inferSelect;

const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_ENV_KEY_LENGTH = 128;
const MAX_ENV_VALUE_LENGTH = 16 * 1024;

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

export const createProject = async (req: RequestWithParamsAndSession) => {
  const body = await parseJson<{ name?: unknown; repoUrl?: unknown; branch?: unknown }>(req);
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

  const userId = req.session.user.id;
  const [project] = await db
    .insert(schema.projects)
    .values({
      name,
      repoUrl: normalizedRepoUrl,
      branch,
      userId
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
  const body = await parseJson<{ name?: unknown; repoUrl?: unknown; branch?: unknown }>(req);
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

  if (Object.keys(updates).length <= 1) {
    return badRequest("Provide at least one field to update");
  }

  const id = req.params["id"];
  if (!id) {
    return notFound("Project not found");
  }
  const userId = req.session.user.id;
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
