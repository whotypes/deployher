import type { Command } from "commander";
import pc from "picocolors";

import type { CliContext } from "../types";
import { readManagedCliConfig } from "../lib/api-config";
import { compose } from "../lib/compose";
import { streamDeploymentBuildLog } from "../lib/deployment-log-stream";
import { ensureGarageEnv } from "../lib/garage";
import { readProjectLinkFile } from "../lib/project-link";

export const registerLogs = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("logs")
    .description(
      "Docker compose logs (default) or remote deployment build logs (--remote, requires login + link)"
    )
    .argument("[services...]", "optional compose service names (e.g. app postgres)")
    .option("--tail <n>", "pass --tail to docker compose logs (lines from end)")
    .option("--no-follow", "do not stream new lines (compose logs only)")
    .option(
      "-R, --remote",
      "stream build logs for the linked project's last deployment (or use --deployment)"
    )
    .option("--deployment <id>", "deployment uuid when using --remote")
    .action(async function (this: Command, services: string[] = []) {
      const ctx = getCtx(this);
      const opts = this.opts<{
        tail?: string;
        follow?: boolean;
        noFollow?: boolean;
        remote?: boolean;
        deployment?: string;
      }>();

      if (opts.remote) {
        const loaded = await readManagedCliConfig();
        if (!loaded) {
          throw new Error('Not logged in. Run `deployher login`.');
        }
        const link = await readProjectLinkFile(process.cwd());
        if (!link) {
          throw new Error("No linked project. Run `deployher link` or pass from a linked repo directory.");
        }
        if (link.apiBaseUrl.replace(/\/+$/, "") !== loaded.config.apiBaseUrl.replace(/\/+$/, "")) {
          throw new Error("CLI login host does not match linked project; run login + link again.");
        }
        const depId =
          (opts.deployment?.trim() || link.lastDeploymentId || "").trim();
        if (!depId) {
          throw new Error("No deployment id. Run `deployher deploy` or pass --deployment <uuid>.");
        }
        try {
          await streamDeploymentBuildLog(loaded.config, depId, (ev) => {
            const t = typeof ev.type === "string" ? ev.type : "";
            if (t === "log" && typeof ev.content === "string") {
              process.stdout.write(ev.content);
              return;
            }
            if (t === "status" && typeof ev.status === "string") {
              console.log(pc.dim(`[status] ${ev.status}`));
              return;
            }
            if (t === "done" && typeof ev.status === "string") {
              console.log(pc.dim(`[done] ${ev.status}`));
              return;
            }
            if (t === "error" && typeof ev.content === "string") {
              console.error(pc.red(ev.content));
            }
          });
        } catch (e) {
          throw new Error(pc.red(e instanceof Error ? e.message : String(e)));
        }
        return;
      }

      await ensureGarageEnv(ctx, () => undefined);
      const args: string[] = ["logs"];
      if (opts.tail) {
        const n = Number.parseInt(opts.tail, 10);
        if (!Number.isFinite(n) || n < 1) {
          throw new Error("--tail must be a positive number");
        }
        args.push(`--tail=${String(n)}`);
      }
      const follow = opts.noFollow !== true && opts.follow !== false;
      if (follow) {
        args.push("-f");
      }
      args.push(...services);
      const r = await compose(ctx, args, { inheritStdio: true });
      if (!r.ok) {
        process.exit(r.code || 1);
      }
    });
};
