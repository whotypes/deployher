import type { Command } from "commander";
import pc from "picocolors";
import type { CliContext } from "../types";
import { stopStack } from "../lib/stack";

export const registerStop = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("stop")
    .description("Stop all compose services (including edge, app stack, and deployment-worker)")
    .action(async function (this: Command) {
      const ctx = getCtx(this);
      await stopStack(ctx);
      if (ctx.logLevel !== "quiet") {
        console.log(pc.dim("Stack stopped."));
      }
    });
};
