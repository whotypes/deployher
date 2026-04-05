import type { Command } from "commander";
import pc from "picocolors";
import type { CliContext } from "../types";
import { assertBackendEnvExists, runBunScript } from "../lib/bun-docker";
import { ensureInfraStack } from "../lib/stack";
import { createListr } from "../ui";

export const registerGrantOperator = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("grant-operator <githubLogin>")
    .description(
      "Ensure Postgres (and core infra) is up, run migrations, then set role=operator for the user linked to this GitHub username"
    )
    .option("--skip-migrate", "skip migrate.ts when the schema is already up to date")
    .action(async function (this: Command, githubLogin: string) {
      const opts = this.opts<{ skipMigrate?: boolean }>();
      const login = githubLogin.trim();
      if (!login) {
        throw new Error("GitHub login must not be empty.");
      }
      const ctx = getCtx(this);
      await assertBackendEnvExists(ctx.backendEnvFile);

      const tasks = [
        {
          title: "Infra stack",
          task: async (_ctx: unknown, task: { output?: string }) => {
            await ensureInfraStack(ctx, (m) => {
              task.output = m;
            });
          }
        }
      ];

      if (!opts.skipMigrate) {
        tasks.push({
          title: "migrate.ts",
          task: async () => {
            await runBunScript(ctx, "migrate.ts", {
              inheritStdio: ctx.logLevel === "verbose"
            });
          }
        });
      }

      tasks.push({
        title: "grant operator role",
        task: async () => {
          await runBunScript(ctx, "grant-operator.ts", {
            inheritStdio: ctx.logLevel === "verbose",
            dockerEnv: { DEPLOYHER_GITHUB_LOGIN: login }
          });
        }
      });

      const listr = createListr(ctx, tasks);
      await listr.run();
      if (ctx.logLevel !== "quiet") {
        console.log(pc.green("grant-operator complete."));
      }
    });
};
