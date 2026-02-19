import { recoverProcessingQueue } from "../queue";
import { isRedisConfigured } from "../redis";
import { runLoop } from "./buildWorker";

const startBuildWorker = async () => {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is required for the build worker.");
  }

  try {
    const recovered = await recoverProcessingQueue();
    if (recovered > 0) {
      console.warn(`Recovered ${recovered} queued deployments from Redis.`);
    }
  } catch (error) {
    console.error("Failed to recover Redis queue:", error);
  }

  await runLoop();
};

startBuildWorker().catch((error) => {
  console.error("Build worker exited unexpectedly:", error);
  process.exit(1);
});
