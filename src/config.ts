import "./env/bootstrap";
import { parseRunnerPreviewEnabled } from "./lib/parseRunnerPreviewEnabled";

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
    repoCredentialTtlSeconds: Math.max(60, parseInteger(rawEnv.BUILD_REPO_CREDENTIAL_TTL_SECONDS, 3600)),
    reclaimIdleMs: Math.max(1000, parseInteger(rawEnv.BUILD_RECLAIM_IDLE_MS, 5000)),
    pendingHeartbeatMs: Math.max(1000, parseInteger(rawEnv.BUILD_PENDING_HEARTBEAT_MS, 30000))
  },
  redis: {
    url: normalizeUrl(rawEnv.REDIS_URL)
  },
  auth: {
    url: normalizeUrl(rawEnv.BETTER_AUTH_URL ?? rawEnv.APP_BASE_URL ?? rawEnv.AUTH_URL)
  },
  preview: {
    assetBaseUrl: normalizeUrl(rawEnv.PREVIEW_ASSET_BASE_URL)
  },
  runner: (() => {
    const runnerUrl = normalizeUrl(rawEnv.RUNNER_URL);
    return {
      url: runnerUrl,
      previewEnabled: parseRunnerPreviewEnabled(rawEnv.RUNNER_PREVIEW_ENABLED, runnerUrl),
      sharedSecret: normalizeUrl(rawEnv.RUNNER_SHARED_SECRET)
    };
  })(),
  s3: {
    endpoint: normalizeS3Endpoint(rawEnv.S3_ENDPOINT),
    region: (rawEnv.S3_REGION ?? rawEnv.AWS_REGION ?? "garage").trim() || "garage",
    bucket: (rawEnv.S3_BUCKET ?? rawEnv.AWS_BUCKET ?? "").trim() || undefined,
    accessKeyId: (rawEnv.S3_ACCESS_KEY_ID ?? rawEnv.AWS_ACCESS_KEY_ID ?? "").trim() || undefined,
    secretAccessKey: (rawEnv.S3_SECRET_ACCESS_KEY ?? rawEnv.AWS_SECRET_ACCESS_KEY ?? "").trim() || undefined
  },
  observability: {
    trustProxy: true,
    previewTrafficSampleRate: Math.min(
      1,
      Math.max(0, Number.parseFloat(rawEnv.PREVIEW_TRAFFIC_SAMPLE_RATE ?? "0.02") || 0.02)
    ),
    queueStallCheckIntervalMs: Math.max(30_000, parseInteger(rawEnv.QUEUE_STALL_CHECK_INTERVAL_MS, 60_000))
  },
  siteMetadata: {
    fetchOrigin: normalizeUrl(rawEnv.SITE_META_FETCH_ORIGIN),
    fetchTimeoutMs: Math.min(30_000, Math.max(3_000, parseInteger(rawEnv.SITE_META_FETCH_TIMEOUT_MS, 10_000))),
    maxHtmlBytes: Math.min(2 * 1024 * 1024, Math.max(64_000, parseInteger(rawEnv.SITE_META_MAX_HTML_BYTES, 786_432))),
    previewImageMaxBytes: Math.min(
      16 * 1024 * 1024,
      Math.max(256 * 1024, parseInteger(rawEnv.SITE_PREVIEW_IMAGE_MAX_BYTES, 8 * 1024 * 1024))
    )
  }
};

const withOptionalPort = (protocol: string, domain: string, port: number) => {
  const normalizedPort = Number.isFinite(port) ? port : 3000;
  const defaultPort = protocol === "https" ? 443 : 80;
  return normalizedPort === defaultPort ? `${protocol}://${domain}` : `${protocol}://${domain}:${normalizedPort}`;
};

export const getDevBaseUrl = () => withOptionalPort(config.devProtocol, config.devDomain, config.port);

export const getProdBaseUrl = () => withOptionalPort(config.prodProtocol, config.prodDomain, config.port);

export const getTrustedAppOrigins = (): string[] => {
  const origins = new Set<string>([getDevBaseUrl(), getProdBaseUrl()]);
  if (config.auth.url) {
    origins.add(config.auth.url);
  }
  return [...origins];
};

export const getAuthBaseUrl = (): string => config.auth.url ?? (
  config.env === "development" ? getDevBaseUrl() : getProdBaseUrl()
);

export const getDevProjectUrlPattern = () => withOptionalPort(
  config.devProtocol,
  `{project}.${config.devDomain}`,
  config.port
);

export const getProdProjectUrlPattern = () => withOptionalPort(
  config.prodProtocol,
  `{project}.${config.prodDomain}`,
  config.port
);

export const buildDevSubdomainUrl = (label: string) => withOptionalPort(
  config.devProtocol,
  `${label}.${config.devDomain}`,
  config.port
);

export const resolveProjectDomains = (project: { id: string; name: string }) => {
  const slug = project.name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/g, "")
    .replace(/-+$/g, "");

  const label = slug || project.id;

  return {
    dev: buildDevSubdomainUrl(label),
    prod: withOptionalPort(config.prodProtocol, `${label}.${config.prodDomain}`, config.port)
  };
};
