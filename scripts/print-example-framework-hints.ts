import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import type { MergedRepoHints } from "../src/lib/vercel/mapFrameworkToDeployher";
import { inferMergedRepoHintsFromScanFiles } from "../src/lib/repoScanInference";

const examplesRoot = path.resolve(import.meta.dir, "../examples");

const formatHints = (h: MergedRepoHints): string =>
  [
    `    vercel preset:          ${h.primaryFramework ? `${h.primaryFramework.name} (${h.primaryFramework.slug})` : "(none)"}`,
    `    labels:                 ${h.labels.length ? h.labels.join(", ") : "(none)"}`,
    `    suggestedFrameworkHint: ${h.suggestedFrameworkHint}`,
    `    suggestedPreviewMode:   ${h.suggestedPreviewMode}`,
    `    confidence:             ${h.confidence}`,
    `    warnings:               ${h.warnings.length ? h.warnings.map((w) => `\n      - ${w}`).join("") : "(none)"}`
  ].join("\n");

const main = async (): Promise<void> => {
  const dirs = readdirSync(examplesRoot)
    .filter((name) => {
      const full = path.join(examplesRoot, name);
      try {
        return statSync(full).isDirectory() && !name.startsWith(".");
      } catch {
        return false;
      }
    })
    .sort();

  for (const dir of dirs) {
    const root = path.join(examplesRoot, dir);
    const read = (name: string): string | null => {
      const p = path.join(root, name);
      return existsSync(p) ? readFileSync(p, "utf8") : null;
    };

    const packageJsonRaw = read("package.json");
    const pyprojectToml = read("pyproject.toml");
    const requirementsTxt = read("requirements.txt");
    const pipfile = read("Pipfile");
    const bunLockb = read("bun.lockb");
    const bunLock = read("bun.lock");
    const pnpmLockYaml = read("pnpm-lock.yaml");
    const yarnLock = read("yarn.lock");
    const packageLockJson = read("package-lock.json");
    const indexHtml = read("index.html");
    const publicIndexHtml = read("public/index.html");
    const distIndexHtml = read("dist/index.html");
    const buildIndexHtml = read("build/index.html");

    const hints = await inferMergedRepoHintsFromScanFiles({
      packageJsonRaw,
      pyprojectToml,
      requirementsTxt,
      pipfile,
      bunLockb,
      bunLock,
      pnpmLockYaml,
      yarnLock,
      packageLockJson,
      indexHtml,
      publicIndexHtml,
      distIndexHtml,
      buildIndexHtml
    });

    console.log(`${dir}`);
    console.log(
      `  inputs: package.json=${packageJsonRaw ? "yes" : "no"}, pyproject.toml=${pyprojectToml ? "yes" : "no"}, requirements.txt=${requirementsTxt ? "yes" : "no"}, Pipfile=${pipfile ? "yes" : "no"}, bun.lockb=${bunLockb ? "yes" : "no"}, bun.lock=${bunLock ? "yes" : "no"}, pnpm-lock.yaml=${pnpmLockYaml ? "yes" : "no"}, yarn.lock=${yarnLock ? "yes" : "no"}, package-lock.json=${packageLockJson ? "yes" : "no"}`
    );
    console.log(`  @vercel/fs-detectors + deployher mapping:`);
    console.log(formatHints(hints));
    console.log("");
  }
};

void main();
