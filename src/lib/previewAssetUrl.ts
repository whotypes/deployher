const isAllowedAbsoluteUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * HTML meta often points at a production CDN (e.g. og:image on marketing domain). The same URL path
 * is usually served from the deployment: repo `public/foo.png` → `{previewOrigin}/foo.png` (root of
 * the static site), whether that is `/demo/og.webp`, `/favicon.ico`, `/apple-touch-icon.png`, etc.
 * Swap origin to the preview base while keeping pathname, query, and hash so <img> loads the
 * deployment asset.
 */
export const preferPreviewOriginForExternalAsset = (
  absoluteUrl: string | null,
  deploymentPreviewBaseHref: string
): string | null => {
  if (!absoluteUrl) return null;
  let preview: URL;
  let asset: URL;
  try {
    preview = new URL(deploymentPreviewBaseHref);
    asset = new URL(absoluteUrl);
  } catch {
    return absoluteUrl;
  }
  if (asset.protocol !== "http:" && asset.protocol !== "https:") return absoluteUrl;
  if (preview.protocol !== "http:" && preview.protocol !== "https:") return absoluteUrl;
  if (asset.host === preview.host) return absoluteUrl;
  try {
    const out = new URL(`${preview.origin}${asset.pathname}${asset.search}${asset.hash}`);
    if (!isAllowedAbsoluteUrl(out.href)) return absoluteUrl;
    return out.href;
  } catch {
    return absoluteUrl;
  }
};
