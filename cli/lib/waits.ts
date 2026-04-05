import type { CliContext } from "../types";
import { compose } from "./compose";
import { runCommand } from "./run";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const waitForPostgres = async (ctx: CliContext, onLog: (m: string) => void): Promise<void> => {
  onLog("Waiting for Postgres...");
  for (let i = 0; i < 30; i++) {
    const r = await compose(ctx, ["exec", "-T", "postgres", "pg_isready", "-U", "app", "-d", "placeholder"]);
    if (r.ok) {
      onLog("Postgres ready.");
      return;
    }
    await sleep(1000);
  }
  throw new Error("Postgres failed to start in time.");
};

export const waitForRedis = async (ctx: CliContext, onLog: (m: string) => void): Promise<void> => {
  onLog("Waiting for Redis...");
  for (let i = 0; i < 30; i++) {
    const r = await compose(ctx, ["exec", "-T", "redis", "redis-cli", "ping"]);
    if (r.ok && /PONG/.test(r.stdout)) {
      onLog("Redis ready.");
      return;
    }
    await sleep(1000);
  }
  throw new Error("Redis failed to start in time.");
};

const GARAGE_NEEDLES = [
  "Listening on 0.0.0.0:3901",
  "S3 API server listening on http://0.0.0.0:3900",
  "K2V API server listening on http://0.0.0.0:3904",
  "Web server listening on http://0.0.0.0:3902",
  "Admin API server listening on http://0.0.0.0:3903",
] as const;

export const waitForGarage = async (ctx: CliContext, onLog: (m: string) => void): Promise<void> => {
  onLog("Waiting for Garage...");
  for (let i = 0; i < 30; i++) {
    const logs = await compose(ctx, ["logs", "--no-color", "--tail", "200", "garage"]);
    const text = `${logs.stdout}${logs.stderr}`;

    if (
      text.includes("Cannot connect to the Docker daemon") ||
      text.includes("docker.sock") ||
      text.includes("permission denied")
    ) {
      throw new Error(`Docker does not seem available (can't read container logs).\n${text}`);
    }

    const ok = GARAGE_NEEDLES.every((n) => text.includes(n));
    if (ok) {
      onLog("Garage ready.");
      return;
    }
    await sleep(1000);
  }
  throw new Error("Garage failed to become healthy in time.");
};

export const waitForApp = async (ctx: CliContext, onLog: (m: string) => void): Promise<void> => {
  onLog("Waiting for app container...");
  for (let i = 0; i < 45; i++) {
    const r = await compose(ctx, ["ps", "--status", "running", "--services"]);
    if (r.ok) {
      const services = r.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (services.includes("app")) {
        onLog("App container running.");
        return;
      }
    }
    await sleep(1000);
  }
  await runCommand(
    [
      "docker",
      "compose",
      "-f",
      ctx.composeFile,
      "--env-file",
      ctx.garageEnvFile,
      "logs",
      "--no-color",
      "--tail",
      "200",
      "app",
    ],
    { cwd: ctx.repoRoot },
  );
  throw new Error("App container failed to start in time.");
};

export const waitForDeploymentWorker = async (
  ctx: CliContext,
  onLog: (m: string) => void,
): Promise<void> => {
  onLog("Waiting for deployment-worker container...");
  for (let i = 0; i < 45; i++) {
    const r = await compose(ctx, ["ps", "--status", "running", "--services"]);
    if (r.ok) {
      const services = r.stdout
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      if (services.includes("deployment-worker")) {
        onLog("Deployment-worker container running.");
        return;
      }
    }
    await sleep(1000);
  }
  await runCommand(
    [
      "docker",
      "compose",
      "-f",
      ctx.composeFile,
      "--env-file",
      ctx.garageEnvFile,
      "logs",
      "--no-color",
      "--tail",
      "200",
      "deployment-worker",
    ],
    { cwd: ctx.repoRoot },
  );
  throw new Error("Deployment-worker container failed to start in time.");
};

export const verifyBuildWorkerDockerAccess = async (
  ctx: CliContext,
  onLog: (m: string) => void,
): Promise<void> => {
  onLog("Verifying Docker access inside deployment-worker container...");
  const which = await compose(ctx, ["exec", "-T", "deployment-worker", "sh", "-lc", "which docker"]);
  if (!which.ok) {
    throw new Error(`Docker CLI is not available in deployment-worker container.\n${which.stderr}`);
  }
  const ps = await compose(ctx, ["exec", "-T", "deployment-worker", "sh", "-lc", "docker ps >/dev/null"]);
  if (!ps.ok) {
    throw new Error(
      "Deployment-worker container cannot access Docker daemon via /var/run/docker.sock.\n" + ps.stderr,
    );
  }
  onLog("Docker access OK inside deployment-worker container.");
};
