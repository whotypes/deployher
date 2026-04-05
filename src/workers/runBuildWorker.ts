import "../env/bootstrap";
import { ensureDeploymentQueue } from "../queue";
import { isRedisConfigured } from "../redis";
import { runBuildCancelSubscriber } from "./buildCancelSubscriber";
import { runLoop } from "./buildWorker";

const startBuildWorker = async () => {
  if (!isRedisConfigured()) {
    throw new Error("REDIS_URL is required for the build worker.");
  }

  try {
    await ensureDeploymentQueue();
  } catch (error) {
    console.error("Failed to initialize Redis deployment stream:", error);
  }

  await Promise.all([runBuildCancelSubscriber(), runLoop()]);
};

startBuildWorker().catch((error) => {
  console.error("Build worker exited unexpectedly:", error);
  process.exit(1);
});
