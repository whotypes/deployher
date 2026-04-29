import path from "node:path";

import type { Command } from "commander";
import pc from "picocolors";

import {
  REPO_HINT_SCAN_FILES,
  inferMergedRepoHintsFromScanFiles,
  type RepoRootScanFiles
} from "../../src/lib/repoScanInference";
import type { CliContext } from "../types";

const readOptionalText = async (absPath: string): Promise<string | null> => {
  const file = Bun.file(absPath);
  if (!(await file.exists())) return null;
  if (absPath.endsWith(`${path.sep}bun.lockb`) || absPath.endsWith("/bun.lockb")) {
    const buf = await file.arrayBuffer();
    return buf.byteLength > 0 ? "\u0000" : null;
  }
  try {
    return await file.text();
  } catch {
    return null;
  }
};

const KEYS: readonly (keyof RepoRootScanFiles)[] = [
  "packageJsonRaw",
  "pyprojectToml",
  "requirementsTxt",
  "pipfile",
  "bunLockb",
  "bunLock",
  "pnpmLockYaml",
  "yarnLock",
  "packageLockJson",
  "indexHtml",
  "publicIndexHtml",
  "distIndexHtml",
  "buildIndexHtml"
] as const;

export const registerDetect = (program: Command, getCtx: (cmd: Command) => CliContext): void => {
  program
    .command("detect")
    .description("Infer framework and tooling from the current directory (local repo scan)")
    .argument("[dir]", "directory to scan (default: current working directory)", ".")
    .action(async function (this: Command, dirArg?: string) {
      void getCtx(this);
      if (KEYS.length !== REPO_HINT_SCAN_FILES.length) {
        throw new Error("Internal error: scan file key list out of sync");
      }
      const root = path.resolve(process.cwd(), dirArg ?? ".");
      const scan = {} as RepoRootScanFiles;
      for (let i = 0; i < REPO_HINT_SCAN_FILES.length; i += 1) {
        const fileName = REPO_HINT_SCAN_FILES[i]!;
        const key = KEYS[i]!;
        const text = await readOptionalText(path.join(root, fileName));
        scan[key] = text;
      }
      const hints = await inferMergedRepoHintsFromScanFiles(scan);
      console.log(pc.dim(`scanned: ${root}`));
      console.log(JSON.stringify(hints, null, 2));
      const dockerfile = Bun.file(path.join(root, "Dockerfile"));
      if (await dockerfile.exists()) {
        console.log(pc.dim("dockerfile: Dockerfile (present)"));
      }
    });
};
