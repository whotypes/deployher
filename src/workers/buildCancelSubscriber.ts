import { BUILD_CANCEL_CHANNEL } from "../buildCancelChannel";
import { removeBuildContainersForDeployment } from "../docker/buildContainerCleanup";
import { getRedisSubscriber } from "../redis";

const parseDeploymentId = (message: string): string | null => {
  try {
    const body = JSON.parse(message) as unknown;
    if (!body || typeof body !== "object") return null;
    const id = (body as { deploymentId?: unknown }).deploymentId;
    return typeof id === "string" && id.trim() ? id.trim() : null;
  } catch {
    return null;
  }
};

export const runBuildCancelSubscriber = async (): Promise<void> => {
  const subscriber = await getRedisSubscriber();
  if (!subscriber) {
    console.warn("Build cancel subscriber skipped: Redis is not configured");
    return;
  }

  try {
    await subscriber.subscribe(BUILD_CANCEL_CHANNEL, (message: string) => {
      if (!message?.trim()) return;
      const deploymentId = parseDeploymentId(message);
      if (!deploymentId) return;
      removeBuildContainersForDeployment(deploymentId).catch((error) => {
        console.error("Build cancel cleanup failed:", error);
      });
    });
  } catch (error) {
    console.error("Failed to subscribe to build cancel channel:", error);
    return;
  }

  await new Promise<void>(() => {});
};
