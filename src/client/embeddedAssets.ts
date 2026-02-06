import { guessContentType } from "../utils/contentType";

const HASHED_ASSET_PATTERN = /-[a-f0-9]{8,}\./i;
const CLIENT_ASSET_EXTENSIONS = [".js", ".css", ".map"] as const;

const hasClientAssetExtension = (name: string): boolean =>
  CLIENT_ASSET_EXTENSIONS.some((ext) => name.endsWith(ext));

const normalizeAssetName = (name: string): string => name.replace(HASHED_ASSET_PATTERN, ".");

let embeddedAssetMap: Map<string, Blob> | null = null;

const buildEmbeddedAssetMap = (): Map<string, Blob> => {
  const map = new Map<string, Blob>();
  for (const embeddedFile of Bun.embeddedFiles) {
    const name = (embeddedFile as Blob & { name?: string }).name ?? "";
    if (!name) continue;
    const normalizedName = normalizeAssetName(name);
    if (!hasClientAssetExtension(normalizedName)) continue;
    map.set(name, embeddedFile);
    map.set(normalizedName, embeddedFile);
  }
  return map;
};

const getEmbeddedAssetMap = (): Map<string, Blob> => {
  if (!embeddedAssetMap) {
    embeddedAssetMap = buildEmbeddedAssetMap();
  }
  return embeddedAssetMap;
};

export const getEmbeddedClientAsset = (
  requestedPath: string
): { blob: Blob; contentType: string } | null => {
  const normalizedPath = requestedPath.replace(/^\/+/, "");
  if (!normalizedPath || normalizedPath.includes("..") || normalizedPath.includes("\0")) {
    return null;
  }
  const blob = getEmbeddedAssetMap().get(normalizedPath);
  if (!blob) return null;
  return { blob, contentType: guessContentType(normalizedPath) };
};
