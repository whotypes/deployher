import { config } from "../config";
import { json } from "../http/helpers";
import { getClientIpFromRequest } from "../lib/clientIp";
import { getRedisClient } from "../redis";

export const RATE_LIMIT_PATHS = {
  AUTH_PREFIX: "/api/auth",
  STATIC_UPLOAD_AVATAR: "/api/avatar",
  STATIC_UPLOAD_DEPLOYMENT_SUFFIX: "/deployments/static-upload",
  API_PREFIX: "/api/",
  PROJECTS_PREFIX: "/projects/"
} as const;

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

type RateLimitBucket = {
  name: string;
  limit: number;
  windowSeconds: number;
};

type MemoryEntry = {
  count: number;
  resetAt: number;
};

/**
 * Per-process in-memory fallback when Redis is unavailable.
 * Limits are not shared across app instances or restarts.
 */
const memoryStore = new Map<string, MemoryEntry>();

const isStaticUploadPath = (pathname: string): boolean =>
  pathname === RATE_LIMIT_PATHS.STATIC_UPLOAD_AVATAR ||
  pathname.endsWith(RATE_LIMIT_PATHS.STATIC_UPLOAD_DEPLOYMENT_SUFFIX);

const classifyRateLimit = (req: Request): RateLimitBucket | null => {
  const url = new URL(req.url);
  const { pathname } = url;
  const method = req.method.toUpperCase();

  if (isStaticUploadPath(pathname)) {
    return { name: "static-upload", limit: 10, windowSeconds: 60 };
  }

  if (pathname.startsWith(RATE_LIMIT_PATHS.AUTH_PREFIX) && method === "POST") {
    return { name: "auth", limit: 20, windowSeconds: 60 };
  }

  if (MUTATION_METHODS.has(method)) {
    if (pathname.startsWith(RATE_LIMIT_PATHS.API_PREFIX) || pathname.startsWith(RATE_LIMIT_PATHS.PROJECTS_PREFIX)) {
      return { name: "protected-mutation", limit: 120, windowSeconds: 60 };
    }
  }

  if (pathname.startsWith(RATE_LIMIT_PATHS.API_PREFIX)) {
    return { name: "api-fallback", limit: 300, windowSeconds: 60 };
  }

  return null;
};

const buildRateLimitKey = (bucket: RateLimitBucket, clientIp: string): string =>
  `ratelimit:v1:${bucket.name}:${clientIp}`;

const checkMemoryRateLimit = (key: string, limit: number, windowSeconds: number): boolean => {
  const now = Date.now();
  const entry = memoryStore.get(key);
  if (!entry || entry.resetAt <= now) {
    memoryStore.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  if (entry.count > limit) {
    return false;
  }
  return true;
};

const checkRedisRateLimit = async (
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> => {
  const client = await getRedisClient();
  if (!client) {
    return checkMemoryRateLimit(key, limit, windowSeconds);
  }

  try {
    const count = Number(await client.send("INCR", [key]));
    if (count === 1) {
      await client.send("EXPIRE", [key, String(windowSeconds)]);
    }
    return count <= limit;
  } catch (error) {
    console.error("Redis rate limit check failed; using in-memory fallback:", error);
    return checkMemoryRateLimit(key, limit, windowSeconds);
  }
};

const rateLimitResponse = (bucket: RateLimitBucket): Response =>
  json(
    {
      error: "Too many requests",
      retryAfterSeconds: bucket.windowSeconds
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(bucket.windowSeconds)
      }
    }
  );

export const checkRateLimit = async (req: Request): Promise<Response | null> => {
  const bucket = classifyRateLimit(req);
  if (!bucket) {
    return null;
  }

  const clientIp = getClientIpFromRequest(req, config.observability.trustProxy);
  const key = buildRateLimitKey(bucket, clientIp);
  const allowed = await checkRedisRateLimit(key, bucket.limit, bucket.windowSeconds);
  if (!allowed) {
    return rateLimitResponse(bucket);
  }
  return null;
};

/** @internal Test helper to reset in-memory fallback state. */
export const resetRateLimitMemoryStoreForTests = (): void => {
  memoryStore.clear();
};
