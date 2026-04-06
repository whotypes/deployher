import { buildDevSubdomainUrl } from "../config";

/**
 * Public preview URL for UI: use DB value when set; for successful deployments with a missing
 * stored URL, fall back to the dev subdomain pattern (matches project detail `currentPreviewUrl`).
 */
export const effectiveDeploymentPreviewUrl = (
  status: string | null | undefined,
  previewUrl: string | null | undefined,
  shortId: string | null | undefined
): string | null => {
  if (status?.toLowerCase() !== "success") {
    return previewUrl?.trim() ?? null;
  }
  const fromDb = previewUrl?.trim();
  if (fromDb) return fromDb;
  const sid = shortId?.trim();
  if (!sid) return null;
  return buildDevSubdomainUrl(sid);
};
