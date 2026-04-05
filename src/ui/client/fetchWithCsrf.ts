const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const readCookie = (name: string): string | null => {
  const entries = document.cookie.split(";").map((item) => item.trim());
  for (const entry of entries) {
    if (!entry.startsWith(`${name}=`)) continue;
    return decodeURIComponent(entry.slice(name.length + 1));
  }
  return null;
};

export const getCsrfToken = (): string | null => {
  const metaToken = document
    .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
    ?.content?.trim();
  if (metaToken) return metaToken;
  const cookieToken = readCookie("deployher_csrf")?.trim();
  return cookieToken || null;
};

export const fetchWithCsrf = (
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> => {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers ?? {});
  if (!SAFE_METHODS.has(method)) {
    const token = getCsrfToken();
    if (token && !headers.has("x-csrf-token")) {
      headers.set("x-csrf-token", token);
    }
  }

  return fetch(input, {
    ...init,
    headers,
    credentials: init.credentials ?? "same-origin"
  });
};
