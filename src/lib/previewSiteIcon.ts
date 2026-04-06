/**
 * Icon in switcher/sidebar/lists: match project-detail hero — when we have a live preview base,
 * use `/favicon.ico` there first. (Stored `siteIconUrl` can be stale or point off-preview; img
 * onError would otherwise show the letter fallback.)
 */
export const resolveProjectGlyphSiteIconOnly = (
  siteIconUrl: string | null | undefined,
  previewUrl: string | null | undefined
): string | null => {
  const icon = siteIconUrl?.trim();
  if (!icon) return null;
  const base = previewUrl?.trim();
  try {
    return new URL(icon).href;
  } catch {
    if (!base) return null;
    try {
      return new URL(icon, base).href;
    } catch {
      return null;
    }
  }
};

export const resolveProjectGlyphIconSrc = (
  siteIconUrl: string | null | undefined,
  previewUrl: string | null | undefined
): string | null => {
  const base = previewUrl?.trim();
  if (base) {
    try {
      return new URL("/favicon.ico", base).href;
    } catch {
      /* fall through to siteIconUrl */
    }
  }
  return resolveProjectGlyphSiteIconOnly(siteIconUrl, previewUrl);
};
