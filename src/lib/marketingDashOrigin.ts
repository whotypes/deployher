const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

const pathOnly = (to: string): string => {
  const noHash = to.split("#")[0] ?? to;
  const noQuery = noHash.split("?")[0] ?? noHash;
  return noQuery || "/";
};

const staysOnMarketingSite = (to: string): boolean => {
  const p = pathOnly(to);
  return p === "/" || p === "/why";
};

export const getMarketingDashOrigin = (): string => {
  const fromEnv = import.meta.env.VITE_PUBLIC_DASH_ORIGIN?.trim();
  if (fromEnv && fromEnv.length > 0) return trimTrailingSlashes(fromEnv);
  if (import.meta.env.DEV) return "http://localhost:3000";
  return "https://dash.deployher.com";
};

export const resolveMarketingSiteCompatHref = (to: string): string => {
  if (/^https?:\/\//i.test(to)) return to;
  if (staysOnMarketingSite(to)) return to;
  const origin = getMarketingDashOrigin();
  if (!to.startsWith("/")) return `${origin}/${to}`;
  return `${origin}${to}`;
};
