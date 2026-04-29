import type { CliContext } from "../types";
import { compose } from "./compose";
import { ensureGarageEnv, setupGarageS3 } from "./garage";
import { ensureNexusLoginAndImages, ensureNexusReady } from "./nexus";
import {
  verifyBuildWorkerDockerAccess,
  waitForApp,
  waitForDeploymentWorker,
  waitForGarage,
  waitForPostgres,
  waitForRedis,
} from "./waits";

export const ensureInfraStack = async (
  ctx: CliContext,
  onLog: (m: string) => void,
): Promise<void> => {
  await ensureGarageEnv(ctx, onLog);
  const up = await compose(ctx, ["up", "-d", "garage", "postgres", "redis", "nexus"]);
  if (!up.ok) {
    throw new Error(up.stderr || up.stdout || "docker compose up failed");
  }
  await waitForPostgres(ctx, onLog);
  await waitForRedis(ctx, onLog);
  await waitForGarage(ctx, onLog);
  await ensureNexusReady(ctx, onLog);
  await setupGarageS3(ctx, onLog);
};

export const ensureAppStack = async (ctx: CliContext, onLog: (m: string) => void): Promise<void> => {
  await ensureNexusLoginAndImages(ctx, onLog);
  onLog("Building and starting app services...");
  const up = await compose(ctx, [
    "up",
    "-d",
    "--build",
    "node-build-image",
    "bun-build-image",
    "app-api",
    "marketing",
    "edge",
    "deployment-worker",
  ]);
  if (!up.ok) {
    throw new Error(up.stderr || up.stdout || "docker compose up app stack failed");
  }
  await waitForApp(ctx, onLog);
  await waitForDeploymentWorker(ctx, onLog);
  await verifyBuildWorkerDockerAccess(ctx, onLog);
};

export const stopStack = async (ctx: CliContext): Promise<void> => {
  await ensureGarageEnv(ctx, () => undefined);
  const down = await compose(ctx, ["down"]);
  if (!down.ok) {
    throw new Error(down.stderr || "docker compose down failed");
  }
};

export const resetVolumes = async (ctx: CliContext): Promise<void> => {
  await ensureGarageEnv(ctx, () => undefined);
  const down = await compose(ctx, ["down", "-v"]);
  if (!down.ok) {
    throw new Error(down.stderr || "docker compose down -v failed");
  }
};
