export const isSafeAppRedirect = (path: string): boolean => {
  if (!path) return false;
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;
  return true;
};

export const resolveSafeRedirect = (path: string | null | undefined, fallback: string): string => {
  if (path && isSafeAppRedirect(path)) {
    return path;
  }
  return fallback;
};
