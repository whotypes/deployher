import { extractDeploymentIdFromHost } from "../routes/preview";

const longLivedPathPrefixes = ["/d/", "/preview/"] as const;
const longLivedPathSuffixes = ["/log/stream", "/runtime-log/stream"] as const;

export const shouldDisableRequestTimeout = (host: string, pathname: string): boolean => {
  if (extractDeploymentIdFromHost(host)) return true;
  if (longLivedPathPrefixes.some((prefix) => pathname.startsWith(prefix))) return true;
  if (longLivedPathSuffixes.some((suffix) => pathname.endsWith(suffix))) return true;
  return false;
};
