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
    const t = await r.text();
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
};
