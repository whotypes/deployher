import type { Command } from "commander";
import pc from "picocolors";
import type { CliContext } from "../types";
import { assertBackendEnvExists } from "../lib/bun-docker";
import { clearGarageLocalData, ensureGarageEnv } from "../lib/garage";
import { createBootstrapTasks, runBootstrapWithListr } from "../lib/bootstrap-tasks";
import { resetVolumes } from "../lib/stack";
import { createListr } from "../ui";

export const registerStart = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("start")
    .description("Start infra, run migrations + seed, then app and deployment-worker")
    .action(async function (this: Command) {
      const ctx = getCtx(this);
      await runBootstrapWithListr(ctx);
      if (ctx.logLevel !== "quiet") {
        console.log(
          pc.green(
            "Stack started (infra + app + deployment-worker), DB migrated, data seeded.",
          ),
        );
      }
    });

  program
    .command("reset")
    .description("Destroy Docker volumes and Garage data, then full start (destructive)")
    .option("-y, --yes", "skip confirmation prompt")
    .action(async (opts: { yes?: boolean }, cmd: Command) => {
      const ctx = getCtx(cmd);
      const skip = ctx.yes || ctx.ci || opts.yes;
      if (!skip) {
        const { confirm, isCancel } = await import("@clack/prompts");
        const answer = await confirm({
          message: "This will destroy Docker volumes and Garage data. Continue?",
          initialValue: false,
        });
        if (isCancel(answer) || !answer) {
          process.exit(1);
        }
      }

      await assertBackendEnvExists(ctx.backendEnvFile);

      const listr = createListr(ctx, [
        {
          title: "Stop stack and remove volumes",
          task: async (_, task) => {
            await ensureGarageEnv(ctx, () => undefined);
            await resetVolumes(ctx);
            task.output = "compose down -v complete";
          },
        },
        {
          title: "Clear Garage data and secrets",
          task: async (_, task) => {
            await clearGarageLocalData(ctx);
            task.output = "Garage meta/data and .garage.env cleared";
          },
        },
        ...createBootstrapTasks(ctx),
      ]);

      await listr.run();

      if (ctx.logLevel !== "quiet") {
        console.log(
          pc.green(
            "Full reset complete (volumes recreated, app + deployment-worker rebuilt).",
          ),
        );
      }
    });
};
