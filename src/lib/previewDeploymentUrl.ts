import { buildPublicPreviewUrl } from "../config";

/**
 * Public preview URL for UI and APIs. Successful host previews are always derived from
 * `shortId` plus current app config so links stay correct after domain or env fixes; the DB
 * value can be stale. Non-success rows keep the stored URL when present (e.g. resolution hints).
 */
export const effectiveDeploymentPreviewUrl = (
  status: string | null | undefined,
  previewUrl: string | null | undefined,
  shortId: string | null | undefined
): string | null => {
  if (status?.trim().toLowerCase() !== "success") {
    return previewUrl?.trim() ?? null;
  }
  const sid = shortId?.trim();
  if (sid) {
    return buildPublicPreviewUrl(sid);
  }
  return previewUrl?.trim() ?? null;
};
