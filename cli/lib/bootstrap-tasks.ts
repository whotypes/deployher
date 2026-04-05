import type { ListrTask } from "listr2";
import type { CliContext } from "../types";
import { createListr } from "../ui";
import { assertBackendEnvExists, runBunScript } from "./bun-docker";
import { ensureAppStack, ensureInfraStack } from "./stack";

export const createBootstrapTasks = (ctx: CliContext): ListrTask[] => [
  {
    title: "Infra: Postgres, Redis, Garage, Nexus",
    task: async (_, task) => {
      await ensureInfraStack(ctx, (m) => {
        task.output = m;
      });
    },
  },
  {
    title: "Database migrations (Bun in Docker)",
    task: async (_, task) => {
      await runBunScript(ctx, "migrate.ts", {
        inheritStdio: ctx.logLevel === "verbose",
      });
      task.output = "migrate.ts finished";
    },
  },
  {
    title: "Seed database (Bun in Docker)",
    task: async (_, task) => {
      await runBunScript(ctx, "seed.ts", {
        inheritStdio: ctx.logLevel === "verbose",
      });
      task.output = "seed.ts finished";
    },
  },
  {
    title: "App, workers, and build images",
    task: async (_, task) => {
      await ensureAppStack(ctx, (m) => {
        task.output = m;
      });
    },
  },
];

export const runBootstrapWithListr = async (ctx: CliContext): Promise<void> => {
  await assertBackendEnvExists(ctx.backendEnvFile);
  const listr = createListr(ctx, createBootstrapTasks(ctx));
  await listr.run();
};
