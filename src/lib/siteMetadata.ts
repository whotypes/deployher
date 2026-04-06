import { config } from "../config";

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
 * When SITE_META_FETCH_ORIGIN is unset, try the public preview URL first, then common loopback /
 * Docker DNS targets with the same Host header so workers and the app can reach the HTTP server
 * without per-env env vars.
 */
export const buildSiteMetaFetchAttempts = (
  publicPreviewUrl: string,
  fetchOriginOverride?: string | null
): { url: string; hostHeader: string }[] | { error: string } => {
  const resolved = resolveMetadataFetchRequest(publicPreviewUrl, fetchOriginOverride);
  if ("error" in resolved) return resolved;
  if ((fetchOriginOverride ?? "").trim()) {
    return [resolved];
  }
  let publicUrl: URL;
  try {
    publicUrl = new URL(publicPreviewUrl);
  } catch {
    return { error: "Invalid preview URL" };
  }
  if (!isLocalDevPreviewHost(publicUrl.hostname)) {
    return [resolved];
  }
  const pathAndQuery = `${publicUrl.pathname}${publicUrl.search}`;
  const portPart = publicUrl.port ? `:${publicUrl.port}` : "";
  const proto = publicUrl.protocol;
  const hostHeader = publicUrl.host;
  const seen = new Set<string>();
  const out: { url: string; hostHeader: string }[] = [];
  const push = (url: string): void => {
    if (seen.has(url)) return;
    seen.add(url);
    out.push({ url, hostHeader });
  };
  push(resolved.url);
  push(`${proto}//127.0.0.1${portPart}${pathAndQuery}`);
  push(`${proto}//app${portPart}${pathAndQuery}`);
  push(`${proto}//host.docker.internal${portPart}${pathAndQuery}`);
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
  return scan((tag) => /\bname\s*=\s*["']twitter:image["']/i.test(tag));
};

type LinkCandidate = { href: string; rel: string; sizesScore: number };

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
  const linkRe = /<link\b[^>]*>/gi;
  const candidates: LinkCandidate[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) !== null) {
    const tag = m[0];
    const relM = tag.match(/\brel\s*=\s*"([^"]*)"/i) ?? tag.match(/\brel\s*=\s*'([^']*)'/i);
    const hrefM = tag.match(/\bhref\s*=\s*"([^"]*)"/i) ?? tag.match(/\bhref\s*=\s*'([^']*)'/i);
    if (!relM?.[1] || !hrefM?.[1]) continue;
    const rel = relM[1];
    const tokens = parseRelTokens(rel);
    if (tokens.includes("mask-icon") || tokens.includes("maskicon")) continue;
    const isApple = tokens.some((t) => t === "apple-touch-icon" || t === "apple-touch-icon-precomposed");
    const isIcon = tokens.some((t) => t === "icon" || t === "shortcut" || t === "shortcut icon");
    if (!isApple && !isIcon) continue;
    const sizesM = tag.match(/\bsizes\s*=\s*"([^"]*)"/i) ?? tag.match(/\bsizes\s*=\s*'([^']*)'/i);
    const sizesScore = linkSizesScore(sizesM?.[1] ?? null);
    const resolved = resolveHref(hrefM[1], baseUrl);
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
    iconUrl: rebaseAssetUrlOntoPreviewOrigin(iconUrl, deploymentPreviewBaseHref),
    ogImageUrl: rebaseAssetUrlOntoPreviewOrigin(ogImageUrl, deploymentPreviewBaseHref)
  };
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

export const fetchSiteMetadata = async (publicPreviewUrl: string): Promise<SiteMetadataFetchResult> => {
  const attempts = buildSiteMetaFetchAttempts(publicPreviewUrl, config.siteMetadata.fetchOrigin);
  if ("error" in attempts) {
    return { ok: false, error: attempts.error };
  }
  const multi = attempts.length > 1;
  let lastError = "fetch failed";
  let response: Response | null = null;

  for (let i = 0; i < attempts.length; i += 1) {
    const { url, hostHeader } = attempts[i];
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

  try {
    const baseForResolve = new URL(publicPreviewUrl).href;
    const { iconUrl, ogImageUrl } = parseSiteMetadataFromHtml(html, baseForResolve);
    return { ok: true, iconUrl, ogImageUrl };
  } catch {
    return { ok: false, error: "Failed to parse HTML" };
  }
};
