import { and, desc, eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { resolveProjectDomains } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { normalizeGitHubRepoUrl } from "../github";
import { badRequest, json, notFound, parseJson } from "../http/helpers";

type Project = typeof schema.projects.$inferSelect;

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
