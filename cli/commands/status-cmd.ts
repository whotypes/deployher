import type { Command } from "commander";
import type { CliContext } from "../types";
import { ensureGarageEnv } from "../lib/garage";
import { compose } from "../lib/compose";

export const registerStatus = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("status")
    .description("Show docker compose service status")
    .action(async function (this: Command) {
      const ctx = getCtx(this);
      await ensureGarageEnv(ctx, () => undefined);
      const r = await compose(ctx, ["ps"], { inheritStdio: true });
      if (!r.ok) {
        process.exit(r.code || 1);
      }
    });
};
