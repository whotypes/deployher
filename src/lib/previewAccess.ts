import { createHmac, timingSafeEqual } from "node:crypto";
import { getSession } from "../auth/session";
import { config } from "../config";
import type * as schema from "../db/schema";
import { json } from "../http/helpers";

export const PREVIEW_ACCESS_COOKIE_NAME = "deployher_preview_access";
export const PREVIEW_ACCESS_QUERY_PARAM = "preview_access";
const DEFAULT_PREVIEW_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;

type PreviewAccessProject = Pick<
  typeof schema.projects.$inferSelect,
  "id" | "userId" | "previewAccess"
>;

export type PreviewAccessResult =
  | { ok: true; attachToken?: string }
  | { ok: false; response: Response };

const getPreviewAccessSecret = (): string | null => {
  const secret = (process.env.BETTER_AUTH_SECRET ?? Bun.env.BETTER_AUTH_SECRET ?? "").trim();
  return secret || null;
};

const signPayload = (payload: string, secret: string): string =>
  createHmac("sha256", secret).update(payload).digest("base64url");

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
  options: {
    path?: string;
    sameSite?: "Lax" | "Strict" | "None";
    secure?: boolean;
    httpOnly?: boolean;
    maxAge?: number;
    domain?: string;
  } = {}
): string => {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? "/"}`);
  parts.push(`SameSite=${options.sameSite ?? "Lax"}`);
  if (typeof options.maxAge === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.secure) parts.push("Secure");
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.domain) parts.push(`Domain=${options.domain}`);
  return parts.join("; ");
};

const timingSafeEqualStr = (a: string, b: string): boolean => {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
};

export const signPreviewAccessToken = (
  projectId: string,
  ttlSeconds = DEFAULT_PREVIEW_ACCESS_TTL_SECONDS
): string => {
  const secret = getPreviewAccessSecret();
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET is required to sign preview access tokens");
  }
  const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const payload = `${projectId}.${exp}`;
  const signature = signPayload(payload, secret);
  return `${payload}.${signature}`;
};

export const verifyPreviewAccessToken = (
  token: string,
  expectedProjectId: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean => {
  const secret = getPreviewAccessSecret();
  if (!secret) return false;

  const trimmed = token.trim();
  if (!trimmed) return false;

  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0) return false;

  const payload = trimmed.slice(0, lastDot);
  const signature = trimmed.slice(lastDot + 1);
  if (!payload || !signature) return false;

  const secondDot = payload.indexOf(".");
  if (secondDot <= 0) return false;

  const projectId = payload.slice(0, secondDot);
  const expRaw = payload.slice(secondDot + 1);
  const exp = Number.parseInt(expRaw, 10);
  if (!projectId || !Number.isFinite(exp) || exp <= nowSeconds) return false;
  if (projectId !== expectedProjectId) return false;

  const expectedSignature = signPayload(payload, secret);
  return timingSafeEqualStr(signature, expectedSignature);
};

export const previewAccessTokenExpiresAt = (
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Date | null => {
  const trimmed = token.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0) return null;
  const payload = trimmed.slice(0, lastDot);
  const secondDot = payload.indexOf(".");
  if (secondDot <= 0) return null;
  const exp = Number.parseInt(payload.slice(secondDot + 1), 10);
  if (!Number.isFinite(exp) || exp <= nowSeconds) return null;
  return new Date(exp * 1000);
};

export const attachPreviewAccessCookie = (
  response: Response,
  token: string,
  req: Request
): Response => {
  const url = new URL(req.url);
  const expiresAt = previewAccessTokenExpiresAt(token);
  const maxAge =
    expiresAt != null
      ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
      : DEFAULT_PREVIEW_ACCESS_TTL_SECONDS;

  response.headers.append(
    "Set-Cookie",
    serializeCookie(PREVIEW_ACCESS_COOKIE_NAME, token, {
      path: "/",
      sameSite: "Lax",
      secure: url.protocol === "https:",
      httpOnly: true,
      maxAge,
      domain: config.deployher.cookieDomain
    })
  );
  return response;
};

const isProjectOwner = (
  project: PreviewAccessProject,
  userId: string | null | undefined,
  trustedUserId: string | undefined
): boolean => {
  if (!project.userId) return false;
  if (trustedUserId && trustedUserId === project.userId) return true;
  return Boolean(userId && userId === project.userId);
};

export const resolvePreviewAccess = async (
  req: Request,
  project: PreviewAccessProject,
  options?: { trustedUserId?: string }
): Promise<PreviewAccessResult> => {
  if (project.previewAccess !== "protected") {
    return { ok: true };
  }

  const session = await getSession(req);
  const userId = session?.user.id;
  if (isProjectOwner(project, userId, options?.trustedUserId)) {
    return { ok: true };
  }

  const url = new URL(req.url);
  const queryToken = url.searchParams.get(PREVIEW_ACCESS_QUERY_PARAM)?.trim() ?? "";
  const cookies = parseCookies(req.headers.get("cookie"));
  const cookieToken = cookies[PREVIEW_ACCESS_COOKIE_NAME]?.trim() ?? "";

  if (queryToken && verifyPreviewAccessToken(queryToken, project.id)) {
    return { ok: true, attachToken: queryToken };
  }

  if (cookieToken && verifyPreviewAccessToken(cookieToken, project.id)) {
    return { ok: true };
  }

  return {
    ok: false,
    response: json({ error: "Preview access required" }, { status: 403 })
  };
};
