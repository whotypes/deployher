const STRIP_RESPONSE_HEADERS = new Set([
  "connection",
  "content-length",
  "content-encoding",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade"
]);

export const sanitizeProxyResponseHeaders = (headers: Headers): Headers => {
  const out = new Headers();
  for (const [key, value] of headers) {
    if (STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) continue;
    out.set(key, value);
  }
  return out;
};
