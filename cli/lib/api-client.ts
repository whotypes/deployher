import type { ManagedCliConfig } from "./api-config";

export type ApiJsonErrorBody = {
  error?: string;
  message?: string;
};

const toErrorMessage = (status: number, bodyText: string): string => {
  if (bodyText.trim()) {
    try {
      const parsed = JSON.parse(bodyText) as ApiJsonErrorBody;
      const m = (parsed.error ?? parsed.message ?? "").trim();
      if (m) return m;
    } catch {
      return bodyText.slice(0, 500);
    }
  }
  return `HTTP ${String(status)}`;
};

export const apiFetchJson = async <T>(
  config: ManagedCliConfig,
  pathname: string,
  init?: RequestInit & { okStatuses?: number[] }
): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; message: string }> => {
  const url = new URL(pathname.replace(/^\/+/, ""), `${config.apiBaseUrl}/`);
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${config.accessToken}`);
  }
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(url.toString(), { ...init, headers });
  const okStatuses = init?.okStatuses ?? [200, 201];
  const text = await res.text();
  if (!okStatuses.includes(res.status)) {
    return { ok: false, status: res.status, message: toErrorMessage(res.status, text) };
  }
  if (!text.trim()) {
    return { ok: true, status: res.status, data: undefined as T };
  }
  try {
    const data = JSON.parse(text) as T;
    return { ok: true, status: res.status, data };
  } catch {
    return { ok: false, status: res.status, message: "Invalid JSON response" };
  }
};

export const apiFetchOk = async (
  config: ManagedCliConfig,
  pathname: string,
  init?: RequestInit & { okStatuses?: number[] }
): Promise<{ ok: true; status: number; body: string } | { ok: false; status: number; message: string }> => {
  const url = new URL(pathname.replace(/^\/+/, ""), `${config.apiBaseUrl}/`);
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${config.accessToken}`);
  }
  const res = await fetch(url.toString(), { ...init, headers });
  const okStatuses = init?.okStatuses ?? [200];
  const body = await res.text();
  if (!okStatuses.includes(res.status)) {
    return { ok: false, status: res.status, message: toErrorMessage(res.status, body) };
  }
  return { ok: true, status: res.status, body };
};
