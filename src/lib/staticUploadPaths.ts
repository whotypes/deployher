const STRIP_ROOT_NAMES = new Set([
  "dist",
  "build",
  "out",
  "public",
  "web-dist",
  ".output",
  "dist-ssr",
  "storybook-static"
]);

export const sanitizeRelativePath = (raw: string): string | null => {
  const trimmed = raw.trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!trimmed || trimmed.includes("\0")) return null;
  const segments = trimmed.split("/").filter((s) => s !== "" && s !== ".");
  for (const seg of segments) {
    if (seg === "..") return null;
  }
  return segments.join("/");
};

export const stripOptionalArtifactRoot = (paths: string[]): string[] => {
  if (paths.length === 0) return paths;
  const split = paths.map((p) => p.split("/").filter(Boolean));
  const first = split[0]?.[0];
  if (!first || !STRIP_ROOT_NAMES.has(first)) return paths;
  if (!split.every((s) => s[0] === first)) return paths;
  return split.map((s) => {
    const rest = s.slice(1);
    return rest.length === 0 ? "" : rest.join("/");
  });
};
