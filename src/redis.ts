import { RedisClient } from "bun";
import { config } from "./config";

let clientPromise: Promise<RedisClient> | null = null;

export const isRedisConfigured = (): boolean => Boolean(config.redis.url);

export async function getRedisClient(): Promise<RedisClient | null> {
  if (!config.redis.url) return null;
  if (!clientPromise) {
    const client = new RedisClient(config.redis.url);
    client.onconnect = () => {
      console.log("Redis connected");
    };
    client.onclose = (error) => {
      console.error("Redis connection closed:", error);
    };
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

export async function getRedisSubscriber(): Promise<RedisClient | null> {
  const client = await getRedisClient();
  if (!client) return null;
  return client.duplicate();
}
