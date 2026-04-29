const MAX_LOGGED_PREVIEW_PATH = 2048;

export const normalizePreviewTrafficPathForLog = (assetPath: string): string => {
  const noNulls = assetPath.replace(/\u0000/g, "");
  const qIdx = noNulls.indexOf("?");
  const noQuery = qIdx >= 0 ? noNulls.slice(0, qIdx) : noNulls;
  const posix = noQuery.replace(/\\/g, "/").replace(/^\/+/, "");
  const prefixed = posix ? `/${posix}` : "/";
  return prefixed.length > MAX_LOGGED_PREVIEW_PATH
    ? prefixed.slice(0, MAX_LOGGED_PREVIEW_PATH)
    : prefixed;
};
