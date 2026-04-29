import { navigateSpa } from "./spaNavigationBridge";

const rawApiOrigin = import.meta.env.VITE_PUBLIC_API_ORIGIN;
const apiOrigin =
  typeof rawApiOrigin === "string" && rawApiOrigin.trim().length > 0
    ? rawApiOrigin.replace(/\/+$/, "")
    : "";

const resolveApiUrl = (url: string): string => {
  if (!apiOrigin) return url;
  if (url.startsWith("/api") || url.startsWith("/internal")) {
    const path = url.startsWith("/") ? url : `/${url}`;
    return `${apiOrigin}${path}`;
  }
  return url;
};

const parseErrorMessageFromBody = (text: string, status: number): string => {
  const trimmed = text.trim();
  if (!trimmed) {
    return `Request failed (${status})`;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const msg = (parsed as { error: unknown }).error;
      if (typeof msg === "string" && msg.trim()) {
        return msg.trim();
      }
    }
  } catch {
    // body is not JSON
  }
  return trimmed.length > 400 ? `${trimmed.slice(0, 400)}…` : trimmed;
};

export class FetchJsonError extends Error {
  readonly status: number;
  readonly bodyText: string;

  constructor(message: string, status: number, bodyText: string) {
    super(message);
    this.name = "FetchJsonError";
    this.status = status;
    this.bodyText = bodyText;
  }
}

export const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const target = resolveApiUrl(url);
  const r = await fetch(target, { credentials: "include", ...init });
  if (r.status === 401) {
    const q = encodeURIComponent(window.location.pathname + window.location.search);
    navigateSpa(`/login?redirect=${q}`);
    throw new Error("Unauthorized");
  }
  if (r.status === 403) {
    throw new Error("Forbidden");
  }
  if (!r.ok) {
    const bodyText = await r.text();
    const message = parseErrorMessageFromBody(bodyText, r.status);
    throw new FetchJsonError(message, r.status, bodyText);
  }
  return r.json() as Promise<T>;
};
