const HTML_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; connect-src 'self' https: wss:; frame-ancestors 'none'";

const RESTRICTIVE_PERMISSIONS_POLICY = "camera=(), microphone=(), geolocation=(), payment=()";

const isHtmlResponse = (contentType: string): boolean => contentType.includes("text/html");

const isJsonResponse = (contentType: string): boolean => contentType.includes("application/json");

export const applySecurityHeaders = (response: Response, _req: Request): Response => {
  const contentType = response.headers.get("content-type") ?? "";
  if (!isHtmlResponse(contentType) && !isJsonResponse(contentType)) {
    return response;
  }

  const headers = new Headers(response.headers);

  if (isJsonResponse(contentType)) {
    headers.set("X-Content-Type-Options", "nosniff");
  } else if (isHtmlResponse(contentType)) {
    headers.set("X-Frame-Options", "DENY");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    headers.set("Permissions-Policy", RESTRICTIVE_PERMISSIONS_POLICY);
    headers.set("Content-Security-Policy", HTML_CSP);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};
