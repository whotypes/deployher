import { config } from "../config";
import { ensureDeploymentQueue } from "../queue";
import { isRedisConfigured } from "../redis";

export const startBuildWorkers = async () => {
  if (!Bun.isMainThread) return;
  const guardKey = "__buildWorkersStarted";
  if ((globalThis as Record<string, unknown>)[guardKey]) return;
  (globalThis as Record<string, unknown>)[guardKey] = true;
  if (!config.build.workers) return;
  if (!isRedisConfigured()) {
    console.warn("Redis is not configured; build workers are disabled.");
    return;
  }

  try {
    await ensureDeploymentQueue();
  } catch (err) {
    console.error("Failed to initialize Redis deployment stream:", err);
  }

  for (let i = 0; i < config.build.workers; i += 1) {
    const workerUrl = new URL("buildWorker.ts", import.meta.url).href;
    const worker = new Worker(workerUrl, { smol: true });
    worker.addEventListener("error", (event) => {
      console.error("Build worker error:", event.message);
    });
    worker.addEventListener("close", () => {
      console.warn("Build worker exited.");
    });
  }
};
