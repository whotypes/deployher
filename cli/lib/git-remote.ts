import path from "node:path";

import { runCommand } from "./run";

export const getGitOriginUrl = async (cwd: string): Promise<string | null> => {
  const abs = path.resolve(cwd);
  const r = await runCommand(["git", "config", "--get", "remote.origin.url"], { cwd: abs });
  if (!r.ok || !r.stdout.trim()) return null;
  return r.stdout.trim();
};

export const getGitBranch = async (cwd: string): Promise<string | null> => {
  const abs = path.resolve(cwd);
  const r = await runCommand(["git", "rev-parse", "--abbrev-ref", "HEAD"], { cwd: abs });
  if (!r.ok || !r.stdout.trim()) return null;
  const b = r.stdout.trim();
  return b === "HEAD" ? null : b;
};
