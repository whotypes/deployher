const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const readCookie = (name: string): string | null => {
  const entries = document.cookie.split(";").map((item) => item.trim());
  let last: string | null = null;
  for (const entry of entries) {
    if (!entry.startsWith(`${name}=`)) continue;
    last = decodeURIComponent(entry.slice(name.length + 1));
  }
  return last;
};

const syncMetaCsrfToken = (token: string): void => {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
  if (meta) {
    meta.content = token;
    return;
  }
  const head = document.head;
  if (!head) return;
  const el = document.createElement("meta");
  el.name = "csrf-token";
  el.content = token;
  head.prepend(el);
};

export const getCsrfToken = (): string | null => {
  const cookieToken = readCookie("deployher_csrf")?.trim();
  const metaToken = document
    .querySelector<HTMLMetaElement>('meta[name="csrf-token"]')
    ?.content?.trim();
  // Cookie is authoritative for the server; meta is only seeded on the initial HTML shell.
  // After OAuth redirects or cross-subdomain API calls the cookie can diverge from meta.
  if (cookieToken) {
    if (metaToken !== cookieToken) {
      syncMetaCsrfToken(cookieToken);
    }
    return cookieToken;
  }
  return metaToken || null;
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
