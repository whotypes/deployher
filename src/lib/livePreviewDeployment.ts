import { and, desc, eq } from "drizzle-orm";
import { buildPublicPreviewUrl } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";

export type LivePreviewDeploymentRow = {
  id: string;
  shortId: string;
  previewUrl: string | null;
  status: "queued" | "building" | "success" | "failed";
};

export const resolveLivePreviewPageUrl = (dep: {
  previewUrl: string | null;
  shortId: string;
}): string => {
  const sid = dep.shortId?.trim();
  if (sid) {
    return buildPublicPreviewUrl(sid);
  }
  return dep.previewUrl?.trim() ?? "";
};

export const selectLivePreviewDeploymentForProject = async (
  projectId: string
): Promise<LivePreviewDeploymentRow | null> => {
  const [project] = await db
    .select({ currentDeploymentId: schema.projects.currentDeploymentId })
    .from(schema.projects)
    .where(eq(schema.projects.id, projectId))
    .limit(1);

  if (!project) {
    return null;
  }

  const depFields = {
    id: schema.deployments.id,
    shortId: schema.deployments.shortId,
    previewUrl: schema.deployments.previewUrl,
    status: schema.deployments.status
  };

  if (project.currentDeploymentId) {
    const [current] = await db
      .select(depFields)
      .from(schema.deployments)
      .where(
        and(eq(schema.deployments.id, project.currentDeploymentId), eq(schema.deployments.projectId, projectId))
      )
      .limit(1);

    if (current?.status === "success") {
      return current;
    }
  }

  const [latestSuccess] = await db
    .select(depFields)
    .from(schema.deployments)
    .where(and(eq(schema.deployments.projectId, projectId), eq(schema.deployments.status, "success")))
    .orderBy(desc(schema.deployments.finishedAt), desc(schema.deployments.createdAt))
    .limit(1);

  return latestSuccess ?? null;
};
