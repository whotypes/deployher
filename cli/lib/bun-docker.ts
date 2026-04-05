import type { CliContext } from "../types";
import { runCommand } from "./run";
import { getPostgresDockerNetwork } from "./garage";

export const runBunScript = async (
  ctx: CliContext,
  scriptName: string,
  options?: { inheritStdio?: boolean; dockerEnv?: Record<string, string> },
): Promise<void> => {
  const net = await getPostgresDockerNetwork(ctx);
  const extraEnv: string[] = [];
  for (const [key, value] of Object.entries(options?.dockerEnv ?? {})) {
    extraEnv.push("-e", `${key}=${value}`);
  }
  const args = [
    "docker",
    "run",
    "--rm",
    "--network",
    net,
    "-v",
    `${ctx.repoRoot}:/usr/src/app`,
    "-w",
    "/usr/src/app",
    "--env-file",
    ctx.backendEnvFile,
    "-e",
    "DATABASE_URL=postgresql://app:app@postgres:5432/placeholder",
    ...extraEnv,
    ctx.bunImage,
    "sh",
    "-lc",
    "set -euo pipefail; bun install --frozen-lockfile && bun " + scriptName,
  ];
  const r = await runCommand(args, {
    cwd: ctx.repoRoot,
    inheritStdio: options?.inheritStdio,
  });
  if (!r.ok) {
    throw new Error(r.stderr.trim() || r.stdout.trim() || `bun script failed: ${scriptName}`);
  }
};

export const assertBackendEnvExists = async (path: string): Promise<void> => {
  const f = Bun.file(path);
  if (!(await f.exists())) {
    throw new Error(`Missing ${path} — copy .env.example and configure it.`);
  }
};
