export const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(url, { credentials: "include", ...init });
  if (r.status === 401) {
    const q = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${q}`;
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
