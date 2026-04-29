import { getTrustedAppOrigins } from "../config";

const trustedSet = (): Set<string> => new Set(getTrustedAppOrigins());

const shouldApplyCors = (pathname: string): boolean =>
  pathname.startsWith("/api/") ||
  pathname === "/api" ||
  pathname.startsWith("/internal/");

export const corsPreflightResponse = (req: Request): Response | null => {
  if (req.method !== "OPTIONS") return null;
  const url = new URL(req.url);
  if (!shouldApplyCors(url.pathname)) return null;
  const origin = req.headers.get("origin")?.trim();
  if (!origin || !trustedSet().has(origin)) return null;
  const allowHeaders =
    req.headers.get("access-control-request-headers") ?? "content-type, x-csrf-token";
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": allowHeaders,
      Vary: "Origin, Access-Control-Request-Headers"
    }
  });
};

export const applyApiCorsHeaders = (req: Request, response: Response): Response => {
  const url = new URL(req.url);
  if (!shouldApplyCors(url.pathname)) return response;
  const origin = req.headers.get("origin")?.trim();
  if (!origin || !trustedSet().has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Credentials", "true");
  if (!headers.has("Vary")) {
    headers.set("Vary", "Origin");
  } else {
    headers.append("Vary", "Origin");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
};
