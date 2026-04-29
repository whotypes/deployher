import type { Command } from "commander";
import fs from "node:fs/promises";
import pc from "picocolors";
import type { CliContext } from "../types";
import {
  envExamplePathForRepo,
  prepareBootstrapEnv,
  type BootstrapProfile,
} from "../lib/bootstrap-env";
import { runBootstrapWithListr } from "../lib/bootstrap-tasks";
import { upsertEnvValue } from "../lib/env-file";
import { runCommand } from "../lib/run";

const ensureViteDevApiUrl = async (ctx: CliContext): Promise<void> => {
  await upsertEnvValue(ctx.backendEnvFile, "VITE_DEV_API_URL", "http://127.0.0.1:3000");
};

const runPreflight = async (ctx: CliContext): Promise<void> => {
  const docker = await runCommand(["docker", "version"], { cwd: ctx.repoRoot });
  if (!docker.ok) {
    throw new Error(docker.stderr.slice(0, 400) || "Docker is not available");
  }
  const compose = await runCommand(["docker", "compose", "version"], { cwd: ctx.repoRoot });
  if (!compose.ok) {
    throw new Error(compose.stderr.slice(0, 400) || "docker compose is not available");
  }
  try {
    await fs.access(ctx.composeFile);
  } catch {
    throw new Error(`Compose file not found: ${ctx.composeFile}`);
  }
};

const parseProfile = (raw: string): BootstrapProfile => {
  const t = raw.trim().toLowerCase();
  if (t === "production" || t === "development") return t;
  throw new Error(`--profile must be production or development (got: ${raw})`);
};

export const registerBootstrap = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("bootstrap")
    .description(
      "Prepare .env (secrets + production defaults), then run the same Docker bootstrap as start (skip demo seed unless --seed). Safe to re-run for infra, Nexus, migrations, and images.",
    )
    .option("--profile <name>", "production or development", "production")
    .option("--seed", "run demo seed after migrate (default: skip)")
    .option("--dry-run", "print planned .env keys without writing or starting Docker", false)
    .action(async function (this: Command) {
      const opts = this.opts<{ profile: string; seed?: boolean; dryRun?: boolean }>();
      const ctx = getCtx(this);
      const profile = parseProfile(opts.profile);
      const interactive = !ctx.yes && !ctx.ci;
      const dryRun = Boolean(opts.dryRun);

      await runPreflight(ctx);

      const envExample = envExamplePathForRepo(ctx.repoRoot);
      const { keysUpdated, nextSteps } = await prepareBootstrapEnv({
        backendEnvFile: ctx.backendEnvFile,
        envExamplePath: envExample,
        profile,
        dryRun,
        interactive,
      });

      if (ctx.logLevel !== "quiet" && keysUpdated.length > 0) {
        console.log(pc.dim(`Env keys touched: ${keysUpdated.join(", ")}`));
      }

      for (const line of nextSteps) {
        console.log(pc.cyan(line));
      }

      if (dryRun) {
        return;
      }

      if (profile === "development") {
        await ensureViteDevApiUrl(ctx);
      }

      await runBootstrapWithListr(ctx, { seed: Boolean(opts.seed) });

      if (ctx.logLevel !== "quiet") {
        console.log(
          pc.green(
            Boolean(opts.seed)
              ? "Bootstrap complete (stack up, migrated, seeded)."
              : "Bootstrap complete (stack up, migrated; seed skipped — pass --seed for demo data).",
          ),
        );
      }
    });
};
