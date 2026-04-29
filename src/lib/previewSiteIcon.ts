/**
 * Icon in switcher/sidebar/lists: match project-detail hero — prefer HTML-derived `siteIconUrl`
 * (e.g. `/favicon.webp`) when set; fall back to `/favicon.ico` on the preview origin so we still
 * show something when metadata was never refreshed.
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
  const fromMeta = resolveProjectGlyphSiteIconOnly(siteIconUrl, previewUrl);
  if (fromMeta) return fromMeta;
  const base = previewUrl?.trim();
  if (!base) return null;
  try {
    return new URL("/favicon.ico", base).href;
  } catch {
    return null;
  }
};

export const resolveProjectGlyphIconFaviconIcoFallback = (
  siteIconUrl: string | null | undefined,
  previewUrl: string | null | undefined
): string | null => {
  const meta = resolveProjectGlyphSiteIconOnly(siteIconUrl, previewUrl);
  if (!meta) return null;
  const base = previewUrl?.trim();
  if (!base) return null;
  try {
    const ico = new URL("/favicon.ico", base).href;
    return ico !== meta ? ico : null;
  } catch {
    return null;
  }
};
