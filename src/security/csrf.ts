import { getDevBaseUrl, getProdBaseUrl } from "../config";

const CSRF_COOKIE_NAME = "pdploy_csrf";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type CookieOptions = {
  path?: string;
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
  httpOnly?: boolean;
  maxAge?: number;
};

const parseCookies = (header: string | null): Record<string, string> => {
  if (!header) return {};
  return header
    .split(";")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, segment) => {
      const separator = segment.indexOf("=");
      if (separator <= 0) return cookies;
      const key = segment.slice(0, separator).trim();
      const value = segment.slice(separator + 1).trim();
      if (!key) return cookies;
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
};

const serializeCookie = (
  name: string,
  value: string,
  options: CookieOptions = {}
): string => {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.secure) parts.push("Secure");
  if (options.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
};

const allowedOrigins = (): Set<string> =>
  new Set([getDevBaseUrl(), getProdBaseUrl()]);

const extractRequestOrigin = (value: string | null): string | null => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const readFormCsrfToken = async (req: Request): Promise<string | null> => {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded") && !contentType.includes("multipart/form-data")) {
    return null;
  }
  try {
    const form = await req.clone().formData();
    const token = form.get("_csrf");
    return typeof token === "string" && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
};

const readHeaderCsrfToken = (req: Request): string | null => {
  const header = req.headers.get("x-csrf-token")?.trim();
  return header ? header : null;
};

const secureCookieRequired = (url: URL): boolean => url.protocol === "https:";

export const isSafeMethod = (method: string): boolean => SAFE_METHODS.has(method.toUpperCase());

export const readCsrfTokenFromRequest = (req: Request): string | null => {
  const cookies = parseCookies(req.headers.get("cookie"));
  const token = cookies[CSRF_COOKIE_NAME];
  return token?.trim() ? token.trim() : null;
};

export const ensureCsrfToken = (req: Request): { token: string; cookieValue: string; shouldSetCookie: boolean } => {
  const existing = readCsrfTokenFromRequest(req);
  const token = existing ?? crypto.randomUUID();
  const url = new URL(req.url);
  const cookieValue = serializeCookie(CSRF_COOKIE_NAME, token, {
    path: "/",
    sameSite: "Lax",
    secure: secureCookieRequired(url),
    httpOnly: false,
    maxAge: 60 * 60 * 24 * 30
  });

  return {
    token,
    cookieValue,
    shouldSetCookie: !existing
  };
};

export const attachCsrfCookie = (
  response: Response,
  csrf: { cookieValue: string; shouldSetCookie: boolean }
): Response => {
  if (!csrf.shouldSetCookie) return response;
  response.headers.append("Set-Cookie", csrf.cookieValue);
  return response;
};

export const validateMutationRequest = async (
  req: Request,
  expectedCsrfToken: string | null
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  if (isSafeMethod(req.method)) {
    return { ok: true };
  }

  const fetchSite = (req.headers.get("sec-fetch-site") ?? "").trim().toLowerCase();
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return { ok: false, reason: "Cross-site requests are not allowed" };
  }

  const url = new URL(req.url);
  const trustedOrigins = allowedOrigins();
  trustedOrigins.add(url.origin);

  const origin = extractRequestOrigin(req.headers.get("origin"));
  const referer = extractRequestOrigin(req.headers.get("referer"));
  const requestOrigin = origin ?? referer;
  if (!requestOrigin || !trustedOrigins.has(requestOrigin)) {
    return { ok: false, reason: "Request origin is not trusted" };
  }

  if (!expectedCsrfToken) {
    return { ok: false, reason: "Missing CSRF cookie" };
  }

  const requestToken = readHeaderCsrfToken(req) ?? (await readFormCsrfToken(req));
  if (!requestToken || requestToken !== expectedCsrfToken) {
    return { ok: false, reason: "Invalid CSRF token" };
  }

  return { ok: true };
};
