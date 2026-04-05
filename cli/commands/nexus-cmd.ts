import type { Command } from "commander";
import pc from "picocolors";
import type { CliContext } from "../types";
import { readNexusEnvFromFile } from "../lib/env-file";
import {
  ensureNexusLogin,
  ensureNexusReady,
  syncNexusImages,
} from "../lib/nexus";
import { createListr } from "../ui";

export const registerNexus = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  const nexus = program.command("nexus").description("Nexus registry helpers");

  nexus
    .command("sync")
    .description(
      "Pull base images, build Deployher builder images, and push everything to Nexus (requires NEXUS_* in .env)",
    )
    .action(async function (this: Command) {
      const ctx = getCtx(this);
      const env = await readNexusEnvFromFile(ctx.backendEnvFile);
      if (!env) {
        console.error(
          pc.red("Error: NEXUS_REGISTRY, NEXUS_USER, and NEXUS_PASSWORD must be set in .env"),
        );
        process.exit(2);
      }

      const listr = createListr(ctx, [
        {
          title: "Nexus bootstrap (if needed)",
          task: async (_, task) => {
            await ensureNexusReady(ctx, (m) => {
              task.output = m;
            });
          },
        },
        {
          title: "Docker login + image sync",
          task: async (_, task) => {
            await ensureNexusLogin(ctx, env, (m) => {
              task.output = m;
            });
            await syncNexusImages(ctx, env, (m) => {
              task.output = m;
            }, { strictPull: true });
          },
        },
      ]);

      await listr.run();
      if (ctx.logLevel !== "quiet") {
        console.log(pc.green(`Done. All images repushed to ${env.registry}`));
      }
    });
};
