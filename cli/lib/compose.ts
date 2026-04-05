import type { CliContext } from "../types";
import { runCommand, type RunResult } from "./run";

export const composeBaseArgs = (ctx: CliContext): string[] => [
  "docker",
  "compose",
  "-f",
  ctx.composeFile,
  "--env-file",
  ctx.garageEnvFile,
];

export const compose = async (
  ctx: CliContext,
  composeSubArgs: string[],
  options?: { inheritStdio?: boolean },
): Promise<RunResult> =>
  runCommand([...composeBaseArgs(ctx), ...composeSubArgs], {
    cwd: ctx.repoRoot,
    inheritStdio: options?.inheritStdio,
  });
