import type { Command } from "commander";
import fs from "node:fs/promises";
import pc from "picocolors";
import type { CliContext } from "../types";
import { runCommand } from "../lib/run";

type Check = { name: string; ok: boolean; detail?: string };

export const registerDoctor = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("doctor")
    .description("Check Docker, compose file, and .env prerequisites")
    .action(async function (this: Command) {
      const ctx = getCtx(this);
      const checks: Check[] = [];

      const docker = await runCommand(["docker", "version"], { cwd: ctx.repoRoot });
      checks.push({
        name: "Docker daemon",
        ok: docker.ok,
        detail: docker.ok ? undefined : docker.stderr.slice(0, 200),
      });

      const compose = await runCommand(["docker", "compose", "version"], { cwd: ctx.repoRoot });
      checks.push({
        name: "docker compose",
        ok: compose.ok,
        detail: compose.ok ? undefined : compose.stderr.slice(0, 200),
      });

      let composeFileOk = false;
      try {
        await fs.access(ctx.composeFile);
        composeFileOk = true;
      } catch {
        composeFileOk = false;
      }
      checks.push({
        name: `Compose file (${ctx.composeFile})`,
        ok: composeFileOk,
      });

      let envOk = false;
      try {
        await fs.access(ctx.backendEnvFile);
        envOk = true;
      } catch {
        envOk = false;
      }
      checks.push({
        name: `.env (${ctx.backendEnvFile})`,
        ok: envOk,
        detail: envOk ? undefined : "copy .env.example",
      });

      for (const c of checks) {
        const icon = c.ok ? pc.green("✓") : pc.red("✗");
        const line = `${icon} ${c.name}`;
        console.log(c.ok ? line : `${line}${c.detail ? pc.dim(` — ${c.detail}`) : ""}`);
      }

      const failed = checks.filter((c) => !c.ok);
      if (failed.length > 0) {
        process.exit(2);
      }
    });
};
