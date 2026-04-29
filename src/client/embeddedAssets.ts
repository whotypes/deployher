import path from "path";
import { guessContentType } from "../utils/contentType";

const HASHED_ASSET_PATTERN = /-[a-f0-9]{8,}\./i;
const CLIENT_ASSET_EXTENSIONS = [
  ".html",
  ".js",
  ".css",
  ".map",
  ".avif",
  ".gif",
  ".ico",
  ".jpg",
  ".jpeg",
  ".png",
  ".svg",
  ".webp",
  ".eot",
  ".ttf",
  ".woff",
  ".woff2"
] as const;

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
  const map = getEmbeddedAssetMap();
  const direct = map.get(normalizedPath);
  if (direct) {
    return { blob: direct, contentType: guessContentType(normalizedPath) };
  }
  const base = path.basename(normalizedPath);
  const byBase = map.get(base);
  if (byBase) {
    return { blob: byBase, contentType: guessContentType(normalizedPath) };
  }
  for (const [embedName, blob] of map) {
    if (embedName === normalizedPath || embedName.endsWith(`/${normalizedPath}`)) {
      return { blob, contentType: guessContentType(normalizedPath) };
    }
  }
  return null;
};
