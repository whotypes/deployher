import type { Command } from "commander";
import pc from "picocolors";
import type { CliContext } from "../types";
import { assertBackendEnvExists, runBunScript } from "../lib/bun-docker";
import { ensureInfraStack } from "../lib/stack";
import { createListr } from "../ui";

export const registerMigrate = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("migrate")
    .description("Ensure infra stack is up, then run migrate.ts in Docker (oven/bun)")
    .action(async function (this: Command) {
      const ctx = getCtx(this);
      await assertBackendEnvExists(ctx.backendEnvFile);
      const listr = createListr(ctx, [
        {
          title: "Infra stack",
          task: async (_, task) => {
            await ensureInfraStack(ctx, (m) => {
              task.output = m;
            });
          },
        },
        {
          title: "migrate.ts",
          task: async () => {
            await runBunScript(ctx, "migrate.ts", {
              inheritStdio: ctx.logLevel === "verbose",
            });
          },
        },
      ]);
      await listr.run();
      if (ctx.logLevel !== "quiet") {
        console.log(pc.green("Migrations complete."));
      }
    });
};

export const registerSeed = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("seed")
    .description("Ensure infra stack is up, then run seed.ts in Docker (oven/bun)")
    .action(async function (this: Command) {
      const ctx = getCtx(this);
      await assertBackendEnvExists(ctx.backendEnvFile);
      const listr = createListr(ctx, [
        {
          title: "Infra stack",
          task: async (_, task) => {
            await ensureInfraStack(ctx, (m) => {
              task.output = m;
            });
          },
        },
        {
          title: "seed.ts",
          task: async () => {
            await runBunScript(ctx, "seed.ts", {
              inheritStdio: ctx.logLevel === "verbose",
            });
          },
        },
      ]);
      await listr.run();
      if (ctx.logLevel !== "quiet") {
        console.log(pc.green("Seeding complete."));
      }
    });
};
