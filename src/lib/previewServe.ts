import path from "path";
import { config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { getRedisClient } from "../redis";
import { getJson } from "../storage";
import { guessContentType } from "../utils/contentType";
import { getClientIpFromRequest } from "./clientIp";
import { normalizePreviewTrafficPathForLog } from "./previewTrafficPath";

const PREVIEW_MANIFEST_CACHE_KEY_PREFIX = "deployments:preview-manifest:";
const HASHED_ASSET_PATTERN = /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot)$/i;

export type PreviewCacheClass = "document" | "immutable" | "asset";

export type PreviewManifestEntry = {
  path: string;
  key: string;
  contentType: string;
  cacheClass: PreviewCacheClass;
  cacheControl: string;
};

export type PreviewManifest = {
  version: 1;
  generatedAt: string;
  artifactPrefix: string;
  rootIndexPath?: string;
  spaFallbackPath?: string;
  entries: Record<string, PreviewManifestEntry>;
  directoryIndexes: Record<string, string>;
};

const memoryCache = new Map<string, PreviewManifest>();

const manifestCacheKey = (deploymentId: string) =>
  `${PREVIEW_MANIFEST_CACHE_KEY_PREFIX}${deploymentId}`;

const normalizeManifestPath = (assetPath: string): string => {
  const normalized = assetPath.replace(/^\/+/, "").replace(/\\/g, "/");
  if (!normalized) return "index.html";
  return normalized.replace(/\/+$/g, "") || "index.html";
};

export const buildPreviewManifestKey = (artifactPrefix: string): string =>
  `${artifactPrefix}/preview-manifest.json`;

export const getPreviewCacheControl = (
  filePath: string,
  contentType = guessContentType(filePath)
): string => {
  if (contentType.includes("text/html")) {
    return "no-cache";
  }
  if (HASHED_ASSET_PATTERN.test(filePath)) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=3600";
};

const getPreviewCacheClass = (
  filePath: string,
  contentType = guessContentType(filePath)
): PreviewCacheClass => {
  if (contentType.includes("text/html")) return "document";
  if (HASHED_ASSET_PATTERN.test(filePath)) return "immutable";
  return "asset";
};

export const createPreviewManifest = (
  artifactPrefix: string,
  outputDir: string,
  files: string[]
): PreviewManifest => {
  const entries: Record<string, PreviewManifestEntry> = {};
  const directoryIndexes: Record<string, string> = {};

  for (const filePath of files) {
    const relativePath = normalizeManifestPath(path.relative(outputDir, filePath));
    const contentType = guessContentType(filePath);
    const cacheClass = getPreviewCacheClass(relativePath, contentType);
    entries[relativePath] = {
      path: relativePath,
      key: `${artifactPrefix}/${relativePath}`,
      contentType,
      cacheClass,
      cacheControl: getPreviewCacheControl(relativePath, contentType)
    };

    if (relativePath === "index.html") {
      continue;
    }

    if (relativePath.endsWith("/index.html")) {
      const directoryPath = relativePath.slice(0, -"/index.html".length);
      if (directoryPath) {
        directoryIndexes[directoryPath] = relativePath;
      }
    }
  }

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    artifactPrefix,
    ...(entries["index.html"] ? { rootIndexPath: "index.html", spaFallbackPath: "index.html" } : {}),
    entries,
    directoryIndexes
  };
};

export const resolvePreviewManifestEntry = (
  manifest: PreviewManifest,
  assetPath: string
): PreviewManifestEntry | null => {
  const normalizedPath = normalizeManifestPath(assetPath);
  const exact = manifest.entries[normalizedPath];
  if (exact) return exact;

  if (!normalizedPath.includes(".")) {
    const directoryIndexPath = manifest.directoryIndexes[normalizedPath];
    if (directoryIndexPath) {
      return manifest.entries[directoryIndexPath] ?? null;
    }
  }

  if (manifest.spaFallbackPath) {
    return manifest.entries[manifest.spaFallbackPath] ?? null;
  }

  return null;
};

export const cachePreviewManifest = async (
  deploymentId: string,
  manifest: PreviewManifest
): Promise<void> => {
  memoryCache.set(deploymentId, manifest);
  const client = await getRedisClient();
  if (!client) return;
  await client.send("SET", [manifestCacheKey(deploymentId), JSON.stringify(manifest)]);
};

export const clearPreviewManifestCache = async (deploymentId: string): Promise<void> => {
  memoryCache.delete(deploymentId);
  const client = await getRedisClient();
  if (!client) return;
  await client.send("DEL", [manifestCacheKey(deploymentId)]);
};

export const loadPreviewManifest = async (
  deploymentId: string,
  previewManifestKey: string | null | undefined
): Promise<PreviewManifest | null> => {
  if (!previewManifestKey) return null;

  const cached = memoryCache.get(deploymentId);
  if (cached) return cached;

  const client = await getRedisClient();
  if (client) {
    const raw = await client.send("GET", [manifestCacheKey(deploymentId)]);
    if (typeof raw === "string" && raw.trim()) {
      try {
        const manifest = JSON.parse(raw) as PreviewManifest;
        memoryCache.set(deploymentId, manifest);
        return manifest;
      } catch {
        await client.send("DEL", [manifestCacheKey(deploymentId)]);
      }
    }
  }

  try {
    const manifest = await getJson<PreviewManifest>(previewManifestKey);
    memoryCache.set(deploymentId, manifest);
    if (client) {
      await client.send("SET", [manifestCacheKey(deploymentId), JSON.stringify(manifest)]);
    }
    return manifest;
  } catch {
    return null;
  }
};

const bucketAssetPath = (assetPath: string): string => {
  const lower = assetPath.toLowerCase();
  if (/\.(js|mjs|cjs|css|map|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot|json|xml|txt|webmanifest)$/i.test(lower)) {
    return "static_asset";
  }
  if (!lower.includes(".")) {
    return "document";
  }
  return "other";
};

export const maybeLogPreviewTraffic = (
  req: Request,
  deployment: { id: string; projectId: string },
  assetPath: string,
  statusCode: number,
  timing?: { durationMs: number }
): void => {
  const rate = config.observability.previewTrafficSampleRate;
  if (rate <= 0) return;
  if (Math.random() > rate) return;

  const clientIp = getClientIpFromRequest(req, config.observability.trustProxy);
  const method = req.method || "GET";
  const pathBucket = bucketAssetPath(assetPath);
  const pathForDb = normalizePreviewTrafficPathForLog(assetPath);

  let durationMs: number | null = null;
  if (timing !== undefined && Number.isFinite(timing.durationMs)) {
    const d = Math.round(timing.durationMs);
    if (d >= 0 && d <= 86_400_000) durationMs = d;
  }

  void db
    .insert(schema.previewTrafficEvents)
    .values({
      projectId: deployment.projectId,
      deploymentId: deployment.id,
      clientIp,
      method,
      statusCode,
      pathBucket,
      path: pathForDb,
      durationMs
    })
    .catch((err) => {
      console.error("preview traffic log insert failed:", err);
    });
};
