import { eq } from "drizzle-orm";
import { buildDevSubdomainUrl } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { fetchSiteMetadata } from "./siteMetadata";

export type RefreshProjectSiteMetadataOptions = {
  /** When set (e.g. right after deploy), avoids a DB read for the preview URL. */
  previewPageUrl?: string;
};

export type RefreshProjectSiteMetadataOk = {
  ok: true;
  siteIconUrl: string | null;
  siteOgImageUrl: string | null;
  siteMetaFetchedAt: Date;
};

export const refreshProjectSiteMetadata = async (
  projectId: string,
  options?: RefreshProjectSiteMetadataOptions
): Promise<RefreshProjectSiteMetadataOk | { ok: false; error: string }> => {
  let previewPageUrl = options?.previewPageUrl?.trim() ?? "";

  if (!previewPageUrl) {
    const [row] = await db
      .select({ currentDeploymentId: schema.projects.currentDeploymentId })
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1);

    if (!row?.currentDeploymentId) {
      await db
        .update(schema.projects)
        .set({ siteMetaError: "No current deployment", updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId));
      return { ok: false, error: "No current deployment" };
    }

    const [dep] = await db
      .select({
        previewUrl: schema.deployments.previewUrl,
        shortId: schema.deployments.shortId,
        status: schema.deployments.status
      })
      .from(schema.deployments)
      .where(eq(schema.deployments.id, row.currentDeploymentId))
      .limit(1);

    if (!dep || dep.status !== "success") {
      await db
        .update(schema.projects)
        .set({ siteMetaError: "Current deployment is not live", updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId));
      return { ok: false, error: "Current deployment is not live" };
    }

    previewPageUrl = dep.previewUrl?.trim() || buildDevSubdomainUrl(dep.shortId);
  }

  const result = await fetchSiteMetadata(previewPageUrl);

  if (result.ok) {
    await db
      .update(schema.projects)
      .set({
        siteIconUrl: result.iconUrl,
        siteOgImageUrl: result.ogImageUrl,
        siteMetaFetchedAt: new Date(),
        siteMetaError: null,
        updatedAt: new Date()
      })
      .where(eq(schema.projects.id, projectId));
    return {
      ok: true,
      siteIconUrl: result.iconUrl,
      siteOgImageUrl: result.ogImageUrl,
      siteMetaFetchedAt: new Date()
    };
  }

  await db
    .update(schema.projects)
    .set({ siteMetaError: result.error, updatedAt: new Date() })
    .where(eq(schema.projects.id, projectId));
  return { ok: false, error: result.error };
};
