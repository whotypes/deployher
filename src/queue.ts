import { getRedisClient } from "./redis";

export const DEPLOY_STREAM_KEY = "deployments:stream";
export const DEPLOY_CONSUMER_GROUP = "deployments:workers";
const ACCOUNT_ACTIVE_KEY_PREFIX = "deployments:account:";

export type DeploymentJob = {
  deploymentId: string;
  enqueuedAt: string;
  userId?: string;
  envFile?: string;
  repoCredentialId?: string;
};

export type DeploymentStreamMessage = {
  streamId: string;
  job: DeploymentJob;
};

const parseRedisFieldPairs = (raw: unknown): Record<string, string> => {
  const parsed: Record<string, string> = {};
  if (!Array.isArray(raw)) return parsed;

  for (let i = 0; i < raw.length; i += 2) {
    const key = raw[i];
    const value = raw[i + 1];
    if (typeof key !== "string" || typeof value !== "string") continue;
    parsed[key] = value;
  }

  return parsed;
};

const parseStreamMessage = (raw: unknown): DeploymentStreamMessage | null => {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const streamId = raw[0];
  const fieldPairs = raw[1];
  if (typeof streamId !== "string") return null;

  const fields = parseRedisFieldPairs(fieldPairs);
  const deploymentId = fields["deploymentId"]?.trim();
  if (!deploymentId) return null;

  const enqueuedAt = fields["enqueuedAt"]?.trim() || new Date().toISOString();
  const userId = fields["userId"]?.trim();
  const envFile = fields["envFile"];
  const repoCredentialId = fields["repoCredentialId"]?.trim();

  return {
    streamId,
    job: {
      deploymentId,
      enqueuedAt,
      ...(userId ? { userId } : {}),
      ...(typeof envFile === "string" && envFile.length > 0 ? { envFile } : {}),
      ...(repoCredentialId ? { repoCredentialId } : {})
    }
  };
};

const getFirstStreamMessage = (raw: unknown): DeploymentStreamMessage | null => {
  if (!Array.isArray(raw)) return null;

  for (const stream of raw) {
    if (!Array.isArray(stream) || stream.length < 2) continue;
    const messages = stream[1];
    if (!Array.isArray(messages)) continue;
    for (const message of messages) {
      const parsed = parseStreamMessage(message);
      if (parsed) return parsed;
    }
  }

  return null;
};

const getFirstAutoClaimedMessage = (raw: unknown): DeploymentStreamMessage | null => {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const messages = raw[1];
  if (!Array.isArray(messages)) return null;

  for (const message of messages) {
    const parsed = parseStreamMessage(message);
    if (parsed) return parsed;
  }

  return null;
};

const toRedisInteger = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const accountSlotKey = (userId: string): string => `${ACCOUNT_ACTIVE_KEY_PREFIX}${userId}`;

const ACQUIRE_ACCOUNT_SLOT_LUA = `
local key = KEYS[1]
local member = ARGV[1]
local limit = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])

if redis.call("SISMEMBER", key, member) == 1 then
  if ttl > 0 then
    redis.call("PEXPIRE", key, ttl)
  end
  return 1
end

local current = redis.call("SCARD", key)
if current >= limit then
  return 0
end

redis.call("SADD", key, member)
if ttl > 0 then
  redis.call("PEXPIRE", key, ttl)
end

return 1
`;

const RELEASE_ACCOUNT_SLOT_LUA = `
local key = KEYS[1]
local member = ARGV[1]
local ttl = tonumber(ARGV[2])

redis.call("SREM", key, member)
local remaining = redis.call("SCARD", key)

if remaining <= 0 then
  redis.call("DEL", key)
  return 0
end

if ttl > 0 then
  redis.call("PEXPIRE", key, ttl)
end

return remaining
`;

export async function ensureDeploymentQueue(): Promise<void> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");

  try {
    await client.send("XGROUP", [
      "CREATE",
      DEPLOY_STREAM_KEY,
      DEPLOY_CONSUMER_GROUP,
      "$",
      "MKSTREAM"
    ]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/BUSYGROUP/i.test(message)) {
      throw error;
    }
  }
}

export async function enqueueDeployment(
  deploymentId: string,
  options: { userId?: string; envFile?: string; repoCredentialId?: string } = {}
): Promise<void> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");

  await ensureDeploymentQueue();

  const payload: DeploymentJob = {
    deploymentId,
    enqueuedAt: new Date().toISOString(),
    ...(options.userId ? { userId: options.userId } : {}),
    ...(options.envFile ? { envFile: options.envFile } : {}),
    ...(options.repoCredentialId ? { repoCredentialId: options.repoCredentialId } : {})
  };

  const fields = ["deploymentId", payload.deploymentId, "enqueuedAt", payload.enqueuedAt];
  if (payload.userId) {
    fields.push("userId", payload.userId);
  }
  if (payload.envFile) {
    fields.push("envFile", payload.envFile);
  }
  if (payload.repoCredentialId) {
    fields.push("repoCredentialId", payload.repoCredentialId);
  }

  await client.send("XADD", [DEPLOY_STREAM_KEY, "*", ...fields]);
}

export async function dequeueDeployment(
  consumerName: string,
  blockMs = 0
): Promise<DeploymentStreamMessage | null> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");

  await ensureDeploymentQueue();

  const response = await client.send("XREADGROUP", [
    "GROUP",
    DEPLOY_CONSUMER_GROUP,
    consumerName,
    "COUNT",
    "1",
    "BLOCK",
    String(Math.max(0, blockMs)),
    "STREAMS",
    DEPLOY_STREAM_KEY,
    ">"
  ]);

  return getFirstStreamMessage(response);
}

export async function reclaimDeployment(
  consumerName: string,
  minIdleMs: number
): Promise<DeploymentStreamMessage | null> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");

  await ensureDeploymentQueue();

  const response = await client.send("XAUTOCLAIM", [
    DEPLOY_STREAM_KEY,
    DEPLOY_CONSUMER_GROUP,
    consumerName,
    String(Math.max(0, minIdleMs)),
    "0-0",
    "COUNT",
    "1"
  ]);

  return getFirstAutoClaimedMessage(response);
}

export async function touchPendingDeployment(
  streamId: string,
  consumerName: string
): Promise<void> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");

  await client.send("XCLAIM", [
    DEPLOY_STREAM_KEY,
    DEPLOY_CONSUMER_GROUP,
    consumerName,
    "0",
    streamId
  ]);
}

export async function ackDeployment(streamId: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");
  await client.send("XACK", [DEPLOY_STREAM_KEY, DEPLOY_CONSUMER_GROUP, streamId]);
}

export async function deferDeployment(
  streamId: string,
  job: DeploymentJob
): Promise<boolean> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");

  const fields = ["deploymentId", job.deploymentId, "enqueuedAt", job.enqueuedAt];
  if (job.userId) {
    fields.push("userId", job.userId);
  }
  if (job.envFile) {
    fields.push("envFile", job.envFile);
  }

  try {
    await client.send("XADD", [DEPLOY_STREAM_KEY, "*", ...fields]);
    await client.send("XACK", [DEPLOY_STREAM_KEY, DEPLOY_CONSUMER_GROUP, streamId]);
    return true;
  } catch (error) {
    console.error("Failed to defer deployment:", error);
    return false;
  }
}

export async function acquireAccountSlot(
  userId: string,
  deploymentId: string,
  maxConcurrent: number,
  slotTtlMs: number
): Promise<boolean> {
  if (!userId || maxConcurrent <= 0) return true;

  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");

  const result = await client.send("EVAL", [
    ACQUIRE_ACCOUNT_SLOT_LUA,
    "1",
    accountSlotKey(userId),
    deploymentId,
    String(maxConcurrent),
    String(Math.max(0, slotTtlMs))
  ]);

  return toRedisInteger(result) === 1;
}

export async function releaseAccountSlot(
  userId: string,
  deploymentId: string,
  slotTtlMs: number
): Promise<void> {
  if (!userId) return;

  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");

  await client.send("EVAL", [
    RELEASE_ACCOUNT_SLOT_LUA,
    "1",
    accountSlotKey(userId),
    deploymentId,
    String(Math.max(0, slotTtlMs))
  ]);
}
