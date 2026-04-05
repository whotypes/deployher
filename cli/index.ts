#!/usr/bin/env bun
import { Command } from "commander";
import pc from "picocolors";
import pkg from "../package.json" with { type: "json" };
import { buildContext, type BuildContextOptions } from "./context";
import { registerDoctor } from "./commands/doctor";
import { registerLogs } from "./commands/logs";
import { registerGrantOperator } from "./commands/grant-operator";
import { registerMigrate, registerSeed } from "./commands/migrate";
import { registerNexus } from "./commands/nexus-cmd";
import { registerStart } from "./commands/start";
import { registerStatus } from "./commands/status-cmd";
import { registerStop } from "./commands/stop";
import { EXIT_MISCONFIG, EXIT_USER_ERROR } from "./types";

const collectRootOpts = (cmd: Command): BuildContextOptions => {
  let c: Command | null = cmd;
  const merged: Record<string, unknown> = {};
  while (c) {
    Object.assign(merged, c.opts());
    c = c.parent;
  }
  const o = merged;
  return {
    verbose: Boolean(o.verbose),
    quiet: Boolean(o.quiet),
    noColor: Boolean(o.noColor) || o.color === false,
    yes: Boolean(o.yes),
  };
};

const main = async (): Promise<void> => {
  const program = new Command();
  program
    .name("deployher")
    .description("Deployher dev stack — Docker, Postgres, Redis, Garage, Nexus, app, and workers")
    .version(pkg.version)
    .option("-v, --verbose", "verbose logs and streaming Bun output")
    .option("-q, --quiet", "minimal output (CI-friendly)")
    .option("--no-color", "disable ANSI colors")
    .option("-y, --yes", "assume yes for destructive prompts")
    .configureHelp({
      sortSubcommands: true,
    })
    .addHelpText(
      "after",
      `
${pc.dim("Examples (repo root):")}
  ${pc.cyan("bun cli/index.ts start")}    full bootstrap (always works)
  ${pc.cyan("bun deployher doctor")}      same CLI via package.json script name
  ${pc.cyan("deployher start")}           after ${pc.dim("bun link --global")} in this repo

${pc.dim("Migrate, seed, and grant-operator use")} ${pc.cyan("oven/bun")} ${pc.dim("in Docker — no Bun on the host required.")}
${pc.dim("Grant admin:")} ${pc.cyan("deployher grant-operator <github-username>")}
${pc.dim("Global flags before the subcommand:")} ${pc.cyan("bun cli/index.ts --verbose start")}
`,
    );

  const getCtx = (invoked: Command) => buildContext(collectRootOpts(invoked));

  registerStart(program, getCtx);
  registerStop(program, getCtx);
  registerMigrate(program, getCtx);
  registerGrantOperator(program, getCtx);
  registerSeed(program, getCtx);
  registerLogs(program, getCtx);
  registerNexus(program, getCtx);
  registerDoctor(program, getCtx);
  registerStatus(program, getCtx);

  try {
    await program.parseAsync(process.argv);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(pc.red(msg));
    if (/Missing.*\.env|configure it/i.test(msg)) {
      process.exit(EXIT_MISCONFIG);
    }
    process.exit(EXIT_USER_ERROR);
  }
};

void main();
