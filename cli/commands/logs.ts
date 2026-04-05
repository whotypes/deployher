import type { Command } from "commander";
import type { CliContext } from "../types";
import { ensureGarageEnv } from "../lib/garage";
import { compose } from "../lib/compose";

export const registerLogs = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("logs")
    .description("Follow docker compose logs (pass service names as extra args)")
    .argument("[services...]", "optional compose service names (e.g. app postgres)")
    .action(async function (this: Command, services: string[] = []) {
      const ctx = getCtx(this);
      await ensureGarageEnv(ctx, () => undefined);
      const r = await compose(ctx, ["logs", "-f", ...services], { inheritStdio: true });
      if (!r.ok) {
        process.exit(r.code || 1);
      }
    });
};
