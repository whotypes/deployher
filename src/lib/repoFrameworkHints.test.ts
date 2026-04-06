import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { inferMergedRepoHintsFromScanFiles, type RepoRootScanFiles } from "./repoScanInference";
import { inferRepoFrameworkHints } from "./repoFrameworkHints";

const examplesRoot = path.resolve(import.meta.dir, "../../examples");

const readExampleScanFiles = (exampleDir: string): RepoRootScanFiles => {
  const root = path.join(examplesRoot, exampleDir);
  const read = (name: string): string | null => {
    const filePath = path.join(root, name);
    return existsSync(filePath) ? readFileSync(filePath, "utf8") : null;
  };
  return {
    packageJsonRaw: read("package.json"),
    pyprojectToml: read("pyproject.toml"),
    requirementsTxt: read("requirements.txt"),
    pipfile: read("Pipfile"),
    bunLockb: read("bun.lockb"),
    bunLock: read("bun.lock"),
    pnpmLockYaml: read("pnpm-lock.yaml"),
    yarnLock: read("yarn.lock"),
    packageLockJson: read("package-lock.json"),
    indexHtml: read("index.html"),
    publicIndexHtml: read("public/index.html"),
    distIndexHtml: read("dist/index.html"),
    buildIndexHtml: read("build/index.html")
  };
};

describe("inferRepoFrameworkHints", () => {
  it("flags Next.js without build script and suggests server preview", () => {
    const hints = inferRepoFrameworkHints({
      dependencies: { next: "15.0.0", react: "19.0.0" },
      scripts: { dev: "next dev" }
    });
    expect(hints.labels).toContain("Next.js");
    expect(hints.suggestedFrameworkHint).toBe("nextjs");
    expect(hints.suggestedPreviewMode).toBe("server");
    expect(hints.warnings.length).toBeGreaterThan(0);
  });

  it("keeps auto preview when Next has build script", () => {
    const hints = inferRepoFrameworkHints({
      dependencies: { next: "15.0.0" },
      scripts: { build: "next build" }
    });
    expect(hints.suggestedPreviewMode).toBe("auto");
    expect(hints.warnings).toEqual([]);
  });

  it("detects Remix as node server", () => {
    const hints = inferRepoFrameworkHints({
      dependencies: { "@remix-run/node": "^2.0.0" },
      scripts: { build: "remix vite:build" }
    });
    expect(hints.labels).toContain("Remix");
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.suggestedPreviewMode).toBe("server");
  });

  it("detects Python when only pyproject exists", () => {
    const hints = inferRepoFrameworkHints(null, {
      pyprojectToml: "[project]\nname = \"docs\"\n"
    });
    expect(hints.suggestedFrameworkHint).toBe("python");
    expect(hints.labels).toContain("Python");
  });

  it("detects Python when only requirements.txt exists", () => {
    const hints = inferRepoFrameworkHints(null, {
      requirementsTxt: "mkdocs\n"
    });
    expect(hints.suggestedFrameworkHint).toBe("python");
    expect(hints.labels).toEqual(["Python"]);
    expect(hints.warnings).toEqual([]);
  });

  it("detects static site when index.html exists without package.json", () => {
    const hints = inferRepoFrameworkHints(null, {
      staticHtmlScan: {
        indexHtml: "<!doctype html><title>x</title>",
        publicIndexHtml: null,
        distIndexHtml: null,
        buildIndexHtml: null
      }
    });
    expect(hints.suggestedFrameworkHint).toBe("static");
    expect(hints.suggestedPreviewMode).toBe("static");
    expect(hints.labels).toEqual(["Static site"]);
    expect(hints.warnings).toEqual([]);
    expect(hints.confidence).toBe("medium");
  });

  it("detects static site from public/index.html only", () => {
    const hints = inferRepoFrameworkHints(null, {
      staticHtmlScan: {
        indexHtml: null,
        publicIndexHtml: "<html></html>",
        distIndexHtml: null,
        buildIndexHtml: null
      }
    });
    expect(hints.suggestedFrameworkHint).toBe("static");
  });
});

describe("inferMergedRepoHintsFromScanFiles on examples/", () => {
  it("react-vite-static: vite + deployher static", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("react-vite-static"));
    expect(new Set(hints.labels)).toEqual(new Set(["Vite", "npm"]));
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.suggestedPreviewMode).toBe("static");
    expect(hints.confidence).toBe("medium");
    expect(hints.warnings).toEqual([]);
    expect(hints.primaryFramework?.slug).toBe("vite");
  });

  it("react-vite-server: vite + deployher server", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("react-vite-server"));
    expect(new Set(hints.labels)).toEqual(new Set(["Vite", "npm"]));
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.suggestedPreviewMode).toBe("server");
    expect(hints.confidence).toBe("medium");
    expect(hints.warnings).toEqual([]);
    expect(hints.primaryFramework?.slug).toBe("vite");
  });

  it("node-npm-static: npm lockfile toolchain", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("node-npm-static"));
    expect(hints.labels).toEqual(["npm"]);
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.suggestedPreviewMode).toBe("auto");
    expect(hints.warnings).toEqual([]);
    expect(hints.confidence).toBe("medium");
    expect(hints.primaryFramework).toBeNull();
  });

  it("node-bun-static: bun.lock toolchain", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("node-bun-static"));
    expect(hints.labels).toEqual(["Bun"]);
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.confidence).toBe("medium");
    expect(hints.primaryFramework).toBeNull();
  });

  it("node-pnpm-static: pnpm lockfile toolchain", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("node-pnpm-static"));
    expect(hints.labels).toEqual(["pnpm"]);
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.confidence).toBe("medium");
    expect(hints.primaryFramework).toBeNull();
  });

  it("node-yarn-static: yarn lockfile toolchain", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("node-yarn-static"));
    expect(hints.labels).toEqual(["Yarn"]);
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.confidence).toBe("medium");
    expect(hints.primaryFramework).toBeNull();
  });

  it("bun-server-api: bun.lock + deployher server", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("bun-server-api"));
    expect(hints.labels).toEqual(["Bun"]);
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.suggestedPreviewMode).toBe("server");
    expect(hints.confidence).toBe("medium");
    expect(hints.primaryFramework).toBeNull();
  });

  it("bun-server-client: bun.lock + deployher server", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("bun-server-client"));
    expect(hints.labels).toEqual(["Bun"]);
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.suggestedPreviewMode).toBe("server");
    expect(hints.primaryFramework).toBeNull();
  });

  it("bun-server-pagination: packageManager bun without lockfile", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("bun-server-pagination"));
    expect(hints.labels).toEqual(["Bun"]);
    expect(hints.suggestedFrameworkHint).toBe("node");
    expect(hints.suggestedPreviewMode).toBe("server");
    expect(hints.primaryFramework).toBeNull();
  });

  it("python-deployher-pip: pyproject without package.json", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("python-deployher-pip"));
    expect(hints.labels).toEqual(["Python"]);
    expect(hints.suggestedFrameworkHint).toBe("python");
    expect(hints.suggestedPreviewMode).toBe("auto");
    expect(hints.warnings).toEqual([]);
    expect(hints.confidence).toBe("high");
    expect(hints.primaryFramework?.slug).toBe("python");
  });

  it("python-mkdocs-pip: requirements-only python", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles(readExampleScanFiles("python-mkdocs-pip"));
    expect(hints.labels).toEqual(["Python"]);
    expect(hints.suggestedFrameworkHint).toBe("python");
    expect(hints.primaryFramework?.slug).toBe("python");
    expect(hints.warnings).toEqual([]);
  });

  it("static html only: suggests static with HTML logo", async () => {
    const hints = await inferMergedRepoHintsFromScanFiles({
      packageJsonRaw: null,
      pyprojectToml: null,
      requirementsTxt: null,
      pipfile: null,
      bunLockb: null,
      bunLock: null,
      pnpmLockYaml: null,
      yarnLock: null,
      packageLockJson: null,
      indexHtml: "<!doctype html>",
      publicIndexHtml: null,
      distIndexHtml: null,
      buildIndexHtml: null
    });
    expect(hints.suggestedFrameworkHint).toBe("static");
    expect(hints.suggestedPreviewMode).toBe("static");
    expect(hints.primaryFramework?.slug).toBe("static-html");
    expect(hints.primaryFramework?.name).toBe("Static site");
  });
});
