import { getRedisClient } from "./redis";

export const BUILD_CANCEL_CHANNEL = "deployher:build-cancel";

export type BuildCancelPayload = {
  deploymentId: string;
};

export const publishBuildCancel = async (deploymentId: string): Promise<void> => {
  const client = await getRedisClient();
  if (!client) return;
  const payload: BuildCancelPayload = { deploymentId };
  await client.publish(BUILD_CANCEL_CHANNEL, JSON.stringify(payload));
};
