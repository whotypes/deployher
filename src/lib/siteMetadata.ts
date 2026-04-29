import { config } from "../config";
import { preferPreviewOriginForExternalAsset } from "./previewAssetUrl";

export type SiteMetadataFetchResult =
  | { ok: true; iconUrl: string | null; ogImageUrl: string | null }
  | { ok: false; error: string };

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export const resolveMetadataFetchRequest = (
  publicPreviewUrl: string,
  fetchOriginOverride?: string | null
): { url: string; hostHeader: string } | { error: string } => {
  let publicUrl: URL;
  try {
    publicUrl = new URL(publicPreviewUrl);
  } catch {
    return { error: "Invalid preview URL" };
  }
  if (publicUrl.protocol !== "http:" && publicUrl.protocol !== "https:") {
    return { error: "Preview URL must be http(s)" };
  }
  const pathAndQuery = `${publicUrl.pathname}${publicUrl.search}`;
  const origin = (fetchOriginOverride ?? "").trim();
  if (origin) {
    let base: URL;
    try {
      base = new URL(origin);
    } catch {
      return { error: "Invalid SITE_META_FETCH_ORIGIN" };
    }
    if (base.protocol !== "http:" && base.protocol !== "https:") {
      return { error: "SITE_META_FETCH_ORIGIN must be http(s)" };
    }
    const url = `${base.origin}${pathAndQuery}`;
    return { url, hostHeader: publicUrl.host };
  }
  return { url: publicPreviewUrl, hostHeader: publicUrl.host };
};

const isLocalDevPreviewHost = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  return h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "[::1]" || h === "::1";
};

/**
 * Ordered TCP targets for preview HTML/asset fetches. When SITE_META_FETCH_ORIGIN is set, try it
 * first (e.g. in-network Compose), then fall back to the public preview URL and loopback targets
 * with the tenant Host header so host-run apps still succeed if the override is unreachable.
 */
export const buildSiteMetaFetchAttempts = (
  publicPreviewUrl: string,
  fetchOriginOverride?: string | null
): { url: string; hostHeader: string }[] | { error: string } => {
  let publicUrl: URL;
  try {
    publicUrl = new URL(publicPreviewUrl);
  } catch {
    return { error: "Invalid preview URL" };
  }
  if (publicUrl.protocol !== "http:" && publicUrl.protocol !== "https:") {
    return { error: "Preview URL must be http(s)" };
  }

  const direct = resolveMetadataFetchRequest(publicPreviewUrl, null);
  if ("error" in direct) return direct;

  const overrideTrim = (fetchOriginOverride ?? "").trim();
  const seen = new Set<string>();
  const out: { url: string; hostHeader: string }[] = [];
  const pushEntry = (entry: { url: string; hostHeader: string }): void => {
    if (seen.has(entry.url)) return;
    seen.add(entry.url);
    out.push(entry);
  };

  if (overrideTrim) {
    const viaOverride = resolveMetadataFetchRequest(publicPreviewUrl, fetchOriginOverride);
    if ("error" in viaOverride) return viaOverride;
    pushEntry(viaOverride);
  }

  pushEntry(direct);

  if (!isLocalDevPreviewHost(publicUrl.hostname)) {
    return out;
  }

  const pathAndQuery = `${publicUrl.pathname}${publicUrl.search}`;
  const portPart = publicUrl.port ? `:${publicUrl.port}` : "";
  const proto = publicUrl.protocol;
  const hostHeader = publicUrl.host;

  pushEntry({ url: `${proto}//127.0.0.1${portPart}${pathAndQuery}`, hostHeader });
  pushEntry({ url: `${proto}//app${portPart}${pathAndQuery}`, hostHeader });
  pushEntry({ url: `${proto}//host.docker.internal${portPart}${pathAndQuery}`, hostHeader });

  return out;
};

const isAllowedAbsoluteUrl = (value: string): boolean => {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

const isLoopbackHostname = (hostname: string): boolean => {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
};

/**
 * HTML meta may use http://localhost:... (e.g. Next metadataBase in dev) while the deployment
 * preview URL is the tenant host (shortId.localhost). Rebase loopback absolute assets onto the
 * preview URL origin so the dashboard matches the live deployment.
 */
export const rebaseAssetUrlOntoPreviewOrigin = (
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
  if (!isLoopbackHostname(asset.hostname)) return absoluteUrl;
  if (asset.host === preview.host) return absoluteUrl;
  try {
    const out = new URL(`${preview.origin}${asset.pathname}${asset.search}${asset.hash}`);
    if (!isAllowedAbsoluteUrl(out.href)) return absoluteUrl;
    return out.href;
  } catch {
    return absoluteUrl;
  }
};

const resolveHref = (href: string, baseUrl: string): string | null => {
  const t = href.trim();
  if (!t || t.startsWith("data:") || t.startsWith("javascript:")) return null;
  try {
    const resolved = new URL(t, baseUrl);
    if (!isAllowedAbsoluteUrl(resolved.href)) return null;
    return resolved.href;
  } catch {
    return null;
  }
};

/**
 * Document base URL for resolving relative paths in meta/link tags: first `<base href>` in `<head>`,
 * resolved against the fetched document URL; otherwise the document URL (same as a browser).
 */
export const extractDocumentBaseUrlFromHtml = (html: string, fetchedDocumentUrl: string): string => {
  const headMatch = html.match(/<head\b[^>]*>[\s\S]*?<\/head>/i);
  const head = headMatch ? headMatch[0] : html;
  const baseRe = /<base\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = baseRe.exec(head)) !== null) {
    const tag = m[0];
    const hrefM = tag.match(/\bhref\s*=\s*"([^"]*)"/i) ?? tag.match(/\bhref\s*=\s*'([^']*)'/i);
    const raw = hrefM?.[1]?.trim();
    if (!raw) continue;
    const resolved = resolveHref(raw, fetchedDocumentUrl);
    if (resolved) return resolved;
  }
  return fetchedDocumentUrl;
};

const metaContent = (tag: string): string | null => {
  const m =
    tag.match(/\bcontent\s*=\s*"([^"]*)"/i) ??
    tag.match(/\bcontent\s*=\s*'([^']*)'/i) ??
    tag.match(/\bcontent\s*=\s*([^\s>]+)/i);
  const v = m?.[1]?.trim();
  return v ? v : null;
};

const tryResolveContent = (raw: string | undefined, baseUrl: string): string | null => {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  return resolveHref(t, baseUrl);
};

const extractOgImageByLooseRegex = (html: string, baseUrl: string): string | null => {
  const patterns: RegExp[] = [
    /<meta\b[^>]+?\bproperty\s*=\s*["']og:image["'][^>]+?\bcontent\s*=\s*["']([^"']*)["']/i,
    /<meta\b[^>]+?\bcontent\s*=\s*["']([^"']*)["'][^>]+?\bproperty\s*=\s*["']og:image["']/i,
    /<meta\b[^>]+?\bproperty\s*=\s*["']og:image:url["'][^>]+?\bcontent\s*=\s*["']([^"']*)["']/i,
    /<meta\b[^>]+?\bcontent\s*=\s*["']([^"']*)["'][^>]+?\bproperty\s*=\s*["']og:image:url["']/i,
    /<meta\b[^>]+?\bproperty\s*=\s*["']og:image:secure_url["'][^>]+?\bcontent\s*=\s*["']([^"']*)["']/i,
    /<meta\b[^>]+?\bcontent\s*=\s*["']([^"']*)["'][^>]+?\bproperty\s*=\s*["']og:image:secure_url["']/i,
    /<meta\b[^>]+?\bname\s*=\s*["']twitter:image["'][^>]+?\bcontent\s*=\s*["']([^"']*)["']/i,
    /<meta\b[^>]+?\bcontent\s*=\s*["']([^"']*)["'][^>]+?\bname\s*=\s*["']twitter:image["']/i
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    const m = re.exec(html);
    const u = tryResolveContent(m?.[1], baseUrl);
    if (u) return u;
  }
  const multiline: RegExp[] = [
    /<meta\b[\s\S]+?\bproperty\s*=\s*["']og:image(?!:)[\s\S]+?\bcontent\s*=\s*["']([^"']*)["']/i,
    /<meta\b[\s\S]+?\bcontent\s*=\s*["']([^"']*)["'][\s\S]+?\bproperty\s*=\s*["']og:image["']/i,
    /<meta\b[\s\S]+?\bname\s*=\s*["']twitter:image["'][\s\S]+?\bcontent\s*=\s*["']([^"']*)["']/i
  ];
  for (const re of multiline) {
    re.lastIndex = 0;
    const m = re.exec(html);
    const u = tryResolveContent(m?.[1], baseUrl);
    if (u) return u;
  }
  return null;
};

export const extractOgImageFromHtml = (html: string, baseUrl: string): string | null => {
  const scan = (predicate: (tag: string) => boolean): string | null => {
    const metaRe = /<meta\b[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = metaRe.exec(html)) !== null) {
      const tag = m[0];
      if (!predicate(tag)) continue;
      const content = metaContent(tag);
      if (!content) continue;
      const resolved = resolveHref(content, baseUrl);
      if (resolved) return resolved;
    }
    return null;
  };
  const og = scan(
    (tag) =>
      /\bproperty\s*=\s*["']og:image["']/i.test(tag) ||
      /\bproperty\s*=\s*["']og:image:url["']/i.test(tag) ||
      /\bproperty\s*=\s*["']og:image:secure_url["']/i.test(tag)
  );
  if (og) return og;
  const tw = scan((tag) => /\bname\s*=\s*["']twitter:image["']/i.test(tag));
  if (tw) return tw;
  return extractOgImageByLooseRegex(html, baseUrl);
};

/** Same directory as the preview page; live static output often has meta only in this file. */
export const siteMetadataIndexHtmlUrl = (publicPreviewUrl: string): string | null => {
  try {
    return new URL("index.html", publicPreviewUrl).href;
  } catch {
    return null;
  }
};

type LinkCandidate = { href: string; rel: string; sizesScore: number };

const extractLinkAttribute = (tag: string, attr: "rel" | "href" | "sizes"): string | null => {
  const esc = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const d = new RegExp(`\\b${esc}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  if (d?.[1] != null) {
    const v = d[1].trim();
    return v ? v : null;
  }
  const s = new RegExp(`\\b${esc}\\s*=\\s*'([^']*)'`, "i").exec(tag);
  if (s?.[1] != null) {
    const v = s[1].trim();
    return v ? v : null;
  }
  const u = new RegExp(`\\b${esc}\\s*=\\s*([^\\s>]+)`, "i").exec(tag);
  if (u?.[1] != null) {
    const v = u[1].trim();
    return v ? v : null;
  }
  return null;
};

const linkSizesScore = (sizesAttr: string | null): number => {
  if (!sizesAttr) return 0;
  let best = 0;
  for (const part of sizesAttr.split(/\s+/)) {
    const mm = part.match(/^(\d+)x(\d+)$/i);
    if (mm) {
      const w = Number(mm[1]);
      const h = Number(mm[2]);
      if (Number.isFinite(w) && Number.isFinite(h)) best = Math.max(best, w * h);
    }
  }
  return best;
};

const parseRelTokens = (rel: string): string[] =>
  rel
    .toLowerCase()
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

export const extractIconFromHtml = (html: string, baseUrl: string): string | null => {
  const linkRe = /<link\b[\s\S]*?>/gi;
  const candidates: LinkCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    const relRaw = extractLinkAttribute(tag, "rel");
    const hrefRaw = extractLinkAttribute(tag, "href");
    if (!relRaw || !hrefRaw) continue;
    const rel = relRaw;
    const tokens = parseRelTokens(rel);
    if (tokens.includes("mask-icon") || tokens.includes("maskicon")) continue;
    const isApple = tokens.some((t) => t === "apple-touch-icon" || t === "apple-touch-icon-precomposed");
    const isIcon = tokens.some((t) => t === "icon" || t === "shortcut" || t === "shortcut icon");
    if (!isApple && !isIcon) continue;
    const sizesAttr = extractLinkAttribute(tag, "sizes");
    const sizesScore = linkSizesScore(sizesAttr);
    const resolved = resolveHref(hrefRaw, baseUrl);
    if (!resolved) continue;
    candidates.push({ href: resolved, rel: rel.toLowerCase(), sizesScore });
  }

  const apple = candidates.find((c) => c.rel.includes("apple-touch-icon"));
  if (apple) return apple.href;

  const icons = candidates.filter((c) => c.rel.includes("icon"));
  if (icons.length === 0) return null;
  icons.sort((a, b) => b.sizesScore - a.sizesScore);
  return icons[0]?.href ?? null;
};

export const parseSiteMetadataFromHtml = (
  html: string,
  deploymentPreviewBaseHref: string
): { iconUrl: string | null; ogImageUrl: string | null } => {
  const docBase = extractDocumentBaseUrlFromHtml(html, deploymentPreviewBaseHref);
  const iconUrl = extractIconFromHtml(html, docBase);
  const ogImageUrl = extractOgImageFromHtml(html, docBase);
  return {
    iconUrl: rebaseAssetUrlOntoPreviewOrigin(
      preferPreviewOriginForExternalAsset(iconUrl, deploymentPreviewBaseHref),
      deploymentPreviewBaseHref
    ),
    ogImageUrl: rebaseAssetUrlOntoPreviewOrigin(
      preferPreviewOriginForExternalAsset(ogImageUrl, deploymentPreviewBaseHref),
      deploymentPreviewBaseHref
    )
  };
};

export type FetchPreviewDeploymentAssetOptions = {
  /**
   * Favicons (.ico) and some icons are served as `application/octet-stream`; use a broad Accept for
   * `kind=icon` proxy fetches. OG images typically stay image/*-friendly.
   */
  accept?: string;
};

/**
 * Fetch a binary asset from a preview deployment URL using the same loopback / Host-header
 * fallbacks as {@link fetchSiteMetadata}, so server-side fetches reach tenant *.localhost previews
 * from Docker and dev environments.
 */
export const fetchPreviewDeploymentAsset = async (
  absoluteUrl: string,
  options?: FetchPreviewDeploymentAssetOptions
): Promise<Response> => {
  const accept =
    options?.accept ??
    "image/avif,image/webp,image/apng,image/svg+xml,image/x-icon,image/png,image/*,*/*;q=0.8";
  const attempts = buildSiteMetaFetchAttempts(absoluteUrl, config.siteMetadata.fetchOrigin);
  if ("error" in attempts) {
    throw new Error(attempts.error);
  }
  const multi = attempts.length > 1;
  let lastError = "fetch failed";

  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    if (!attempt) continue;
    const { url, hostHeader } = attempt;
    const headers = new Headers({
      Accept: accept,
      "User-Agent": BROWSER_UA
    });
    headers.set("Host", hostHeader);

    try {
      const r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(config.siteMetadata.fetchTimeoutMs),
        headers
      });
      if (!r.ok) {
        lastError = `HTTP ${r.status}`;
        if (multi && i < attempts.length - 1) {
          continue;
        }
        throw new Error(lastError);
      }
      return r;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "fetch failed";
      if (i < attempts.length - 1) {
        continue;
      }
      throw new Error(lastError);
    }
  }

  throw new Error(lastError);
};

const COMMON_PREVIEW_ICON_PATHS = [
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/favicon.webp",
  "/favicon.svg",
  "/icon.png"
] as const;

/**
 * Candidate URLs for the site icon proxy: parsed meta URL first, then usual `public/` → site-root
 * paths on the preview (same origin as `resolved`).
 */
export const buildPreviewIconCandidateUrls = (resolved: string, previewBase: string): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (href: string): void => {
    const t = href.trim();
    if (!t) return;
    const key = (t.split("#")[0] ?? t).split("?")[0] ?? t;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };

  push(resolved);

  let origin: string;
  try {
    origin = new URL(resolved).origin;
  } catch {
    try {
      origin = new URL(previewBase).origin;
    } catch {
      return out;
    }
  }

  for (const p of COMMON_PREVIEW_ICON_PATHS) {
    push(`${origin}${p}`);
  }

  return out;
};

export const fetchPreviewDeploymentAssetTryUrls = async (
  urls: string[],
  options?: FetchPreviewDeploymentAssetOptions
): Promise<Response> => {
  let lastError = "fetch failed";
  for (const u of urls) {
    const t = u.trim();
    if (!t) continue;
    try {
      return await fetchPreviewDeploymentAsset(t, options);
    } catch (e) {
      lastError = e instanceof Error ? e.message : "fetch failed";
    }
  }
  throw new Error(lastError);
};

const readResponseTextWithCap = async (response: Response, maxBytes: number): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) {
    const t = await response.text();
    return t.length > maxBytes ? t.slice(0, maxBytes) : t;
  }
  const decoder = new TextDecoder();
  let out = "";
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      const over = total - maxBytes;
      const keep = value.byteLength - over;
      if (keep > 0) {
        out += decoder.decode(value.subarray(0, keep), { stream: false });
      }
      await reader.cancel();
      break;
    }
    out += decoder.decode(value, { stream: true });
  }
  return out;
};

const sameSiteMetadataDocumentPath = (a: string, b: string): boolean => {
  try {
    const u = new URL(a);
    const v = new URL(b);
    u.hash = "";
    v.hash = "";
    if (u.origin !== v.origin) return false;
    const p = (pathname: string) => (pathname === "" ? "/" : pathname);
    return p(u.pathname) === p(v.pathname);
  } catch {
    return a === b;
  }
};

const fetchSiteMetadataHtmlFromUrl = async (
  documentUrl: string
): Promise<
  { ok: true; html: string; parseBase: string } | { ok: false; error: string }
> => {
  const attempts = buildSiteMetaFetchAttempts(documentUrl, config.siteMetadata.fetchOrigin);
  if ("error" in attempts) {
    return { ok: false, error: attempts.error };
  }
  const multi = attempts.length > 1;
  let lastError = "fetch failed";
  let response: Response | null = null;

  for (let i = 0; i < attempts.length; i += 1) {
    const attempt = attempts[i];
    if (!attempt) continue;
    const { url, hostHeader } = attempt;
    const headers = new Headers({
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": BROWSER_UA
    });
    headers.set("Host", hostHeader);

    try {
      const r = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: AbortSignal.timeout(config.siteMetadata.fetchTimeoutMs),
        headers
      });
      if (!r.ok) {
        lastError = `HTTP ${r.status}`;
        if (multi && i < attempts.length - 1) {
          continue;
        }
        return { ok: false, error: lastError };
      }
      response = r;
      break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : "fetch failed";
      if (i < attempts.length - 1) {
        continue;
      }
      return { ok: false, error: lastError };
    }
  }

  if (!response) {
    return { ok: false, error: lastError };
  }

  let html: string;
  try {
    html = await readResponseTextWithCap(response, config.siteMetadata.maxHtmlBytes);
  } catch {
    return { ok: false, error: "Failed to read response body" };
  }

  const ct = response.headers.get("content-type") ?? "";
  const ctLower = ct.toLowerCase();
  const looksHtml =
    ctLower.includes("text/html") ||
    ctLower.includes("application/xhtml") ||
    /^\s*</.test(html);
  if (!looksHtml) {
    return { ok: false, error: `Unexpected content-type: ${ct || "none"}` };
  }

  let parseBase: string;
  try {
    parseBase = new URL(response.url).href;
  } catch {
    try {
      parseBase = new URL(documentUrl).href;
    } catch {
      return { ok: false, error: "Invalid response URL" };
    }
  }

  return { ok: true, html, parseBase };
};

export const fetchSiteMetadata = async (publicPreviewUrl: string): Promise<SiteMetadataFetchResult> => {
  const first = await fetchSiteMetadataHtmlFromUrl(publicPreviewUrl);
  if (!first.ok) return first;

  try {
    let { iconUrl, ogImageUrl } = parseSiteMetadataFromHtml(first.html, first.parseBase);
    if (!ogImageUrl?.trim() || !iconUrl?.trim()) {
      const indexUrl = siteMetadataIndexHtmlUrl(publicPreviewUrl);
      if (indexUrl && !sameSiteMetadataDocumentPath(indexUrl, first.parseBase)) {
        const second = await fetchSiteMetadataHtmlFromUrl(indexUrl);
        if (second.ok) {
          const p2 = parseSiteMetadataFromHtml(second.html, second.parseBase);
          if (!ogImageUrl?.trim()) {
            ogImageUrl = p2.ogImageUrl;
          }
          if (!iconUrl?.trim()) {
            iconUrl = p2.iconUrl;
          }
        }
      }
    }
    return { ok: true, iconUrl, ogImageUrl };
  } catch {
    return { ok: false, error: "Failed to parse HTML" };
  }
};

const SITE_META_FETCH_CACHE_TTL_MS = 5 * 60 * 1000;
const siteMetadataFetchCache = new Map<string, { value: SiteMetadataFetchResult; expires: number }>();
const siteMetadataFetchInflight = new Map<string, Promise<SiteMetadataFetchResult>>();

export const clearSiteMetadataFetchCacheForProject = (projectId: string): void => {
  const prefix = `${projectId}:`;
  for (const k of [...siteMetadataFetchCache.keys()]) {
    if (k.startsWith(prefix)) siteMetadataFetchCache.delete(k);
  }
  for (const k of [...siteMetadataFetchInflight.keys()]) {
    if (k.startsWith(prefix)) siteMetadataFetchInflight.delete(k);
  }
};

/** Deduped + short TTL so hero OG/icon proxies can fill in when DB fields are empty without refetching HTML on every pixel request. */
export const fetchSiteMetadataCachedForDeployment = async (
  projectId: string,
  deploymentId: string,
  publicPreviewUrl: string
): Promise<SiteMetadataFetchResult> => {
  const key = `${projectId}:${deploymentId}`;
  const cached = siteMetadataFetchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const inflight = siteMetadataFetchInflight.get(key);
  if (inflight) return inflight;
  const p = fetchSiteMetadata(publicPreviewUrl)
    .then((meta) => {
      if (meta.ok) {
        siteMetadataFetchCache.set(key, {
          value: meta,
          expires: Date.now() + SITE_META_FETCH_CACHE_TTL_MS
        });
      }
      return meta;
    })
    .finally(() => {
      siteMetadataFetchInflight.delete(key);
    });
  siteMetadataFetchInflight.set(key, p);
  return p;
};
