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
