import { getRedisClient } from "./redis";

export const DEPLOY_QUEUE_KEY = "deployments:queue";
export const DEPLOY_PROCESSING_KEY = "deployments:processing";

export type DeploymentJob = {
  deploymentId: string;
  enqueuedAt: string;
};

export async function enqueueDeployment(deploymentId: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");
  const payload: DeploymentJob = { deploymentId, enqueuedAt: new Date().toISOString() };
  await client.send("RPUSH", [DEPLOY_QUEUE_KEY, JSON.stringify(payload)]);
}

export async function recoverProcessingQueue(): Promise<number> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");
  const pendingResult = await client.send("LRANGE", [DEPLOY_PROCESSING_KEY, "0", "-1"]);
  const pending = Array.isArray(pendingResult)
    ? pendingResult.filter((item): item is string => typeof item === "string")
    : [];
  if (pending.length === 0) return 0;
  await client.send("DEL", [DEPLOY_PROCESSING_KEY]);
  await client.send("LPUSH", [DEPLOY_QUEUE_KEY, ...pending]);
  return pending.length;
}

export async function dequeueDeployment(blockSeconds = 0): Promise<string | null> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");
  const payload = await client.send("BRPOPLPUSH", [
    DEPLOY_QUEUE_KEY,
    DEPLOY_PROCESSING_KEY,
    String(blockSeconds)
  ]);
  if (!payload || typeof payload !== "string") return null;
  return payload;
}

export async function ackDeployment(payload: string): Promise<void> {
  const client = await getRedisClient();
  if (!client) throw new Error("Redis is not configured");
  await client.send("LREM", [DEPLOY_PROCESSING_KEY, "1", payload]);
}
