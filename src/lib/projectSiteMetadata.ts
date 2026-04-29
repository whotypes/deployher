import { eq } from "drizzle-orm";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { resolveLivePreviewPageUrl, selectLivePreviewDeploymentForProject } from "./livePreviewDeployment";
import { clearSiteMetadataFetchCacheForProject, fetchSiteMetadata } from "./siteMetadata";

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
    const dep = await selectLivePreviewDeploymentForProject(projectId);

    if (!dep) {
      await db
        .update(schema.projects)
        .set({ siteMetaError: "No live preview deployment", updatedAt: new Date() })
        .where(eq(schema.projects.id, projectId));
      return { ok: false, error: "No live preview deployment" };
    }

    previewPageUrl = resolveLivePreviewPageUrl(dep);
  }

  const result = await fetchSiteMetadata(previewPageUrl);

  if (result.ok) {
    clearSiteMetadataFetchCacheForProject(projectId);
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
