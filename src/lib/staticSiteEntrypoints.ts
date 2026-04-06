export const STATIC_SITE_INDEX_HTML_RELATIVE_PATHS = [
  "index.html",
  "public/index.html",
  "dist/index.html",
  "build/index.html"
] as const;

export type StaticSiteIndexScan = {
  indexHtml: string | null;
  publicIndexHtml: string | null;
  distIndexHtml: string | null;
  buildIndexHtml: string | null;
};

export const hasStaticHtmlEntryFromScan = (scan: StaticSiteIndexScan): boolean => {
  const nonempty = (raw: string | null): boolean => Boolean(raw?.trim());
  return (
    nonempty(scan.indexHtml) ||
    nonempty(scan.publicIndexHtml) ||
    nonempty(scan.distIndexHtml) ||
    nonempty(scan.buildIndexHtml)
  );
};
