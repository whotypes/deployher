import { config, getLandingOrigins } from "../config";

const hostKey = (host: string): string => host.split(":")[0]?.trim().toLowerCase() ?? "";

export const requestHostIsDashApp = (req: Request): boolean => {
  const dash = config.deployher.dashHostname;
  if (!dash) return false;
  return hostKey(req.headers.get("host") ?? "") === hostKey(dash);
};

export const canonicalWhyOnLandingUrl = (): string | null => {
  const origins = getLandingOrigins();
  const base = origins[0]?.replace(/\/+$/, "");
  if (!base) return null;
  try {
    const landingHost = new URL(base).hostname.toLowerCase();
    const dash = config.deployher.dashHostname;
    if (dash && landingHost === hostKey(dash)) return null;
  } catch {
    return null;
  }
  return `${base}/why`;
};

/**
 * Subset of `/api/*` that may be invoked on a **tenant preview host** (e.g. `shortId.localhost`).
 * Every other path there is deployment content (including arbitrary `/api/...` from static sites).
 * On the **main app host**, all `/api/*` (except `/api/auth`) is dispatched — new routes do not need
 * to be listed here unless they must work from the tenant origin too.
 */
export const isPdployApiPathOnTenantHost = (pathname: string): boolean => {
  if (!pathname.startsWith("/api/")) return false;
  if (pathname.startsWith("/api/auth")) return false;
  if (pathname === "/api/csrf" || pathname === "/api/session" || pathname === "/api/health") return true;
  if (pathname.startsWith("/api/ui/")) return true;
  if (pathname.startsWith("/api/workspace/")) return true;
  if (pathname.startsWith("/api/github/")) return true;
  if (pathname === "/api/projects" || pathname.startsWith("/api/projects/")) return true;
  if (pathname.startsWith("/api/admin")) return true;
  if (pathname.startsWith("/api/deployments/")) return true;
  if (pathname.startsWith("/api/cli/")) return true;
  return false;
};
