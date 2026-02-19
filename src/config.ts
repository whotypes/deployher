import "dotenv/config";

const rawEnv: Record<string, string | undefined> = { ...process.env, ...Bun.env };

const parsePort = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseInteger = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeDomain = (value: string | undefined, fallback: string) => {
  const normalized = (value ?? fallback).trim();
  if (!normalized) return fallback;
  return normalized.replace(/^https?:\/\//i, "").replace(/\/+$/g, "");
};

const normalizeProtocol = (value: string | undefined, fallback: string) => {
  const normalized = (value ?? fallback).trim();
  if (!normalized) return fallback;
  return normalized.replace(/:\/\//g, "");
};

const normalizeS3Endpoint = (value: string | undefined) => {
  const v = (value ?? "").trim().replace(/\/+$/g, "");
  return v || undefined;
};

const normalizeUrl = (value: string | undefined) => {
  const v = (value ?? "").trim();
  return v || undefined;
};

function requireEnv(name: string): string {
  const v = rawEnv[name];
  if (v === undefined || typeof v !== "string" || !v.trim()) {
    throw new Error(`${name} is required and must be a non-empty string`);
  }
  return v.trim();
}

const env = requireEnv("APP_ENV");
const hostname = requireEnv("HOSTNAME");

export const config = {
  env,
  hostname,
  port: parsePort(rawEnv.PORT, 3000),
  devDomain: normalizeDomain(rawEnv.DEV_DOMAIN, "localhost"),
  prodDomain: normalizeDomain(rawEnv.PROD_DOMAIN, "localhost"),
  devProtocol: normalizeProtocol(rawEnv.DEV_PROTOCOL, "http"),
  prodProtocol: normalizeProtocol(rawEnv.PROD_PROTOCOL, "https"),
  build: {
    workers: Math.max(0, parseInteger(rawEnv.BUILD_WORKERS, 2)),
    accountMaxConcurrent: Math.max(0, parseInteger(rawEnv.BUILD_ACCOUNT_MAX_CONCURRENT, 1)),
    accountSlotTtlSeconds: Math.max(30, parseInteger(rawEnv.BUILD_ACCOUNT_SLOT_TTL_SECONDS, 21600)),
    reclaimIdleMs: Math.max(1000, parseInteger(rawEnv.BUILD_RECLAIM_IDLE_MS, 900000)),
    pendingHeartbeatMs: Math.max(1000, parseInteger(rawEnv.BUILD_PENDING_HEARTBEAT_MS, 30000))
  },
  redis: {
    url: normalizeUrl(rawEnv.REDIS_URL)
  },
  s3: {
    endpoint: normalizeS3Endpoint(rawEnv.S3_ENDPOINT),
    region: (rawEnv.S3_REGION ?? rawEnv.AWS_REGION ?? "garage").trim() || "garage",
    bucket: (rawEnv.S3_BUCKET ?? rawEnv.AWS_BUCKET ?? "").trim() || undefined,
    accessKeyId: (rawEnv.S3_ACCESS_KEY_ID ?? rawEnv.AWS_ACCESS_KEY_ID ?? "").trim() || undefined,
    secretAccessKey: (rawEnv.S3_SECRET_ACCESS_KEY ?? rawEnv.AWS_SECRET_ACCESS_KEY ?? "").trim() || undefined
  }
};

export const resolveProjectDomains = (project: { id: string; name: string }) => {
  const slug = project.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");

  const label = slug || project.id;

  return {
    dev: `${config.devProtocol}://${label}.${config.devDomain}`,
    prod: `${config.prodProtocol}://${label}.${config.prodDomain}`
  };
};
