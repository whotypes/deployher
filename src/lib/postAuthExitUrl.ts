const trimTrailingSlashes = (value: string): string => value.replace(/\/+$/, "");

/** Where the browser should go after sign-out (marketing apex in split-domain prod). */
export const getPostAuthExitUrl = (): string => {
  const fromEnv = import.meta.env.VITE_PUBLIC_LANDING_ORIGIN?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return `${trimTrailingSlashes(fromEnv)}/`;
  }

  const dash = import.meta.env.VITE_PUBLIC_DASH_ORIGIN?.trim();
  if (dash && typeof window !== "undefined") {
    try {
      const dashHost = new URL(trimTrailingSlashes(dash)).hostname.toLowerCase();
      const currentHost = window.location.hostname.toLowerCase();
      if (currentHost === dashHost && dashHost.startsWith("dash.")) {
        const apex = dashHost.slice("dash.".length);
        return `${window.location.protocol}//${apex}/`;
      }
    } catch {
      // ignore malformed env
    }
  }

  return "/";
};
