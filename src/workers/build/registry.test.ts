import { describe, expect, it } from "bun:test";
import path from "path";
import { mkdtemp, mkdir, rm, stat, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { detectNodePackageManager } from "./packageManagers/node";
import { detectBuildStrategy } from "./registry";
import { nodeBuildStrategy } from "./strategies/node";
import { pythonBuildStrategy } from "./strategies/python";
import { staticBuildStrategy } from "./strategies/static";
import type { BuildRuntime } from "./types";

const createRuntime = (): BuildRuntime => ({
  exists: async (filePath) => {
    try {
      await stat(filePath);
      return true;
    } catch {
      return false;
    }
  },
  isDirectory: async (filePath) => {
    try {
      return (await stat(filePath)).isDirectory();
    } catch {
      return false;
    }
  },
  which: Bun.which,
  readJson: async <T>(filePath: string) => {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return (await file.json()) as T;
  },
  readToml: async <T>(filePath: string) => {
    const file = Bun.file(filePath);
    if (!(await file.exists())) return null;
    return Bun.TOML.parse(await file.text()) as T;
  },
  runCommand: async () => ({ code: 0, stdout: "", stderr: "" }),
  resolveBunCli: () => ({ command: "bun" })
});

const createBuildCtx = (deploymentId: string) => ({
  deploymentId,
  logs: [],
  log: () => {},
  appendLogChunk: () => {},
  env: {},
  repoDir: ".",
  workspaceDir: ".",
  repoRelativeDir: ".",
  workspaceRelativeDir: ".",
  previewMode: "auto" as const,
  serverPreviewTarget: "isolated-runner" as const,
  frameworkHint: "auto" as const,
  installCommandOverride: null as string[] | null,
  buildCommandOverride: null as string[] | null
});

const createRepo = async (
  files: Record<string, string>
): Promise<{ dir: string; cleanup: () => Promise<void> }> => {
  const dir = await mkdtemp(path.join(tmpdir(), "pdploy-build-test-"));
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, relativePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content);
  }

  return {
    dir,
    cleanup: async () => {
      await rm(dir, { recursive: true, force: true });
    }
  };
};

describe("build strategy detection", () => {
  const runtime = createRuntime();

  it("detects a root index.html repo as static", async () => {
    const repo = await createRepo({
      "index.html": "<html></html>",
      "slay.png": "asset"
    });

    try {
      const strategy = await detectBuildStrategy(repo.dir, runtime);
      expect(strategy?.id).toBe("static");
    } finally {
      await repo.cleanup();
    }
  });

  it("detects public, dist, and build index.html repos as static", async () => {
    for (const relativePath of ["public/index.html", "dist/index.html", "build/index.html"]) {
      const repo = await createRepo({ [relativePath]: "<html></html>" });
      try {
        const strategy = await detectBuildStrategy(repo.dir, runtime);
        expect(strategy?.id).toBe("static");
      } finally {
        await repo.cleanup();
      }
    }
  });

  it("prefers node when package.json and public/index.html both exist", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({ name: "app", scripts: { build: "echo build" } }),
      "package-lock.json": "{}",
      "public/index.html": "<html></html>"
    });

    try {
      const strategy = await detectBuildStrategy(repo.dir, runtime);
      expect(strategy?.id).toBe("node");
    } finally {
      await repo.cleanup();
    }
  });

  it("prefers python when a python manifest and root index.html both exist", async () => {
    const repo = await createRepo({
      "requirements.txt": "mkdocs==1.6.0",
      "index.html": "<html></html>"
    });

    try {
      const strategy = await detectBuildStrategy(repo.dir, runtime);
      expect(strategy?.id).toBe("python");
    } finally {
      await repo.cleanup();
    }
  });

  it("does not detect a repo with random assets but no supported entrypoint", async () => {
    const repo = await createRepo({
      "bg.jpg": "asset",
      "nested/about.html": "<html></html>"
    });

    try {
      const strategy = await detectBuildStrategy(repo.dir, runtime);
      expect(strategy).toBeNull();
    } finally {
      await repo.cleanup();
    }
  });
});

describe("static build strategy", () => {
  const runtime = createRuntime();

  it("returns the repo root as outputDir for root index.html", async () => {
    const repo = await createRepo({ "index.html": "<html></html>" });

    try {
      const result = await staticBuildStrategy.build(
        repo.dir,
        createBuildCtx("dep-1"),
        runtime
      );

      expect(result.buildStrategy).toBe("static");
      expect(result.serveStrategy).toBe("static");
      expect(result.outputDir).toBe(path.resolve(repo.dir));
    } finally {
      await repo.cleanup();
    }
  });

  it("returns the matched static directory as outputDir", async () => {
    const repo = await createRepo({ "dist/index.html": "<html></html>" });

    try {
      const result = await staticBuildStrategy.build(
        repo.dir,
        createBuildCtx("dep-2"),
        runtime
      );

      expect(result.outputDir).toBe(path.resolve(repo.dir, "dist"));
    } finally {
      await repo.cleanup();
    }
  });
});

describe("detectNodePackageManager", () => {
  const runtime = createRuntime();

  it("defaults to npm install when only package.json exists", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({ name: "app", scripts: { build: "echo ok" } })
    });
    try {
      const pm = await detectNodePackageManager(repo.dir, runtime);
      expect(pm.name).toBe("npm");
      expect(pm.install).toEqual(["npm", "install"]);
      expect(pm.runBuild).toEqual(["npm", "run", "build"]);
    } finally {
      await repo.cleanup();
    }
  });

  it("uses pnpm without frozen lockfile when packageManager is pnpm and there is no lockfile", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({
        name: "app",
        packageManager: "pnpm@9.0.0",
        scripts: { build: "echo ok" }
      })
    });
    try {
      const pm = await detectNodePackageManager(repo.dir, runtime);
      expect(pm.name).toBe("pnpm");
      expect(pm.install).toEqual(["corepack", "pnpm", "install", "--prod=false"]);
      expect(pm.install).not.toContain("--frozen-lockfile");
    } finally {
      await repo.cleanup();
    }
  });

  it("uses pnpm with frozen lockfile when pnpm-lock.yaml exists", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({ name: "app", scripts: { build: "echo ok" } }),
      "pnpm-lock.yaml": "lockfileVersion: '9.0'\n"
    });
    try {
      const pm = await detectNodePackageManager(repo.dir, runtime);
      expect(pm.name).toBe("pnpm");
      expect(pm.install).toEqual([
        "corepack",
        "pnpm",
        "install",
        "--frozen-lockfile",
        "--prod=false"
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  it("uses npm ci when package-lock.json exists", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({ name: "app", scripts: { build: "echo ok" } }),
      "package-lock.json": "{}"
    });
    try {
      const pm = await detectNodePackageManager(repo.dir, runtime);
      expect(pm.name).toBe("npm");
      expect(pm.install).toEqual(["npm", "ci"]);
    } finally {
      await repo.cleanup();
    }
  });

  it("uses bun install --frozen-lockfile when bun.lock exists", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({ name: "app", scripts: { build: "echo ok" } }),
      "bun.lock": "{}"
    });
    try {
      const pm = await detectNodePackageManager(repo.dir, runtime);
      expect(pm.name).toBe("bun");
      expect(pm.install).toEqual(["bun", "install", "--frozen-lockfile"]);
    } finally {
      await repo.cleanup();
    }
  });
});

describe("node build strategy", () => {
  const runtime = createRuntime();

  it("uses explicit static pdploy config when provided", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({
        name: "app",
        scripts: { build: "echo build" },
        pdploy: { serveStrategy: "static", staticOutputDir: "web-dist" }
      }),
      "package-lock.json": "{}",
      "web-dist/index.html": "<html></html>"
    });

    try {
      const result = await nodeBuildStrategy.build(
        repo.dir,
        createBuildCtx("dep-node-static"),
        runtime
      );

      expect(result.serveStrategy).toBe("static");
      expect(result.outputDir).toBe(path.resolve(repo.dir, "web-dist"));
    } finally {
      await repo.cleanup();
    }
  });

  it("detects next.js output as a server deployment", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({
        name: "next-app",
        scripts: { build: "next build" },
        dependencies: { next: "15.0.0" }
      }),
      "package-lock.json": "{}",
      ".next/BUILD_ID": "build-id"
    });

    try {
      const result = await nodeBuildStrategy.build(
        repo.dir,
        createBuildCtx("dep-node-next"),
        runtime
      );

      expect(result.serveStrategy).toBe("server");
      expect(result.runtimeConfig?.framework).toBe("nextjs");
      expect(result.runtimeConfig?.command).toEqual([
        "node_modules/.bin/next",
        "start",
        "-p",
        "3000",
        "-H",
        "0.0.0.0"
      ]);
    } finally {
      await repo.cleanup();
    }
  });

  it("prefers next server output over a plain public directory in auto mode", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({
        name: "next-public-app",
        scripts: { build: "next build" },
        dependencies: { next: "15.0.0" }
      }),
      "package-lock.json": "{}",
      ".next/BUILD_ID": "build-id",
      "public/logo.svg": "<svg />"
    });

    try {
      const result = await nodeBuildStrategy.build(repo.dir, createBuildCtx("dep-node-next-public"), runtime);
      expect(result.serveStrategy).toBe("server");
      expect(result.previewResolution.code).toBe("next_dot_next");
    } finally {
      await repo.cleanup();
    }
  });

  it("fails instead of silently resolving static when next signals exist without .next output", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({
        name: "next-misdetected-app",
        scripts: { build: "next build" },
        dependencies: { next: "15.0.0" }
      }),
      "package-lock.json": "{}",
      "public/index.html": "<html></html>",
      "app/page.tsx": "export default function Page() { return null; }"
    });

    try {
      await expect(
        nodeBuildStrategy.build(repo.dir, createBuildCtx("dep-node-next-missing-dot-next"), runtime)
      ).rejects.toThrow(
        "This repository looks like a Next.js app, but pdploy only found static output in the selected project root. Check the project root directory or set an explicit framework/runtime configuration before redeploying."
      );
    } finally {
      await repo.cleanup();
    }
  });

  it("fails forced static mode for a next server build", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({
        name: "next-app",
        scripts: { build: "next build" },
        dependencies: { next: "15.0.0" }
      }),
      "package-lock.json": "{}",
      ".next/BUILD_ID": "build-id"
    });

    try {
      await expect(
        nodeBuildStrategy.build(
          repo.dir,
          { ...createBuildCtx("dep-node-force-static"), previewMode: "static" },
          runtime
        )
      ).rejects.toThrow(
        "Project Preview type is set to Static, but the build output did not contain a deployable root index.html. Switch Preview type to Server or Auto-detect and redeploy."
      );
    } finally {
      await repo.cleanup();
    }
  });

  it("requires explicit pdploy config for ambiguous node repos", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({
        name: "ambiguous-app",
        scripts: { build: "echo build" }
      }),
      "package-lock.json": "{}"
    });

    try {
      await expect(
        nodeBuildStrategy.build(
          repo.dir,
          createBuildCtx("dep-node-ambiguous"),
          runtime
        )
      ).rejects.toThrow(
        "Node build completed but could not be classified. No supported server runtime or deployable static root index.html was found. Set Preview type to Static or Server only if your build actually produces that output."
      );
    } finally {
      await repo.cleanup();
    }
  });

  it("includes stdout and stderr in node install failures", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({
        name: "bun-app",
        scripts: { build: "bun run build" }
      }),
      "bun.lock": "{}"
    });

    const runtime: BuildRuntime = {
      ...createRuntime(),
      runCommand: async (cmd) => {
        if (cmd[0] === "bun" && cmd[1] === "install") {
          return {
            code: 1,
            stdout: "Resolving dependencies...\nerror: left-pad not found",
            stderr: "bun install failed"
          };
        }
        return { code: 0, stdout: "", stderr: "" };
      }
    };

    try {
      await expect(
        nodeBuildStrategy.build(
          repo.dir,
          createBuildCtx("dep-node-install-fail"),
          runtime
        )
      ).rejects.toThrow(
        "Dependency install failed (exit code 1)\n\nstdout:\nResolving dependencies...\nerror: left-pad not found\n\nstderr:\nbun install failed"
      );
    } finally {
      await repo.cleanup();
    }
  });

  it("runs install at the workspace root and build at the app root", async () => {
    const repo = await createRepo({
      "package.json": JSON.stringify({ name: "workspace", packageManager: "npm@10.0.0" }),
      "package-lock.json": "{}",
      "apps/web/package.json": JSON.stringify({
        name: "web",
        scripts: { build: "npm run build" },
        pdploy: { serveStrategy: "server", runtimeCommand: ["node", "server.js"] }
      })
    });

    const calls: Array<{ cmd: string[]; cwd: string; workdirRelative?: string }> = [];
    const runtime: BuildRuntime = {
      ...createRuntime(),
      runCommand: async (cmd, options) => {
        calls.push({ cmd, cwd: options.cwd, workdirRelative: options.workdirRelative });
        return { code: 0, stdout: "", stderr: "" };
      }
    };

    try {
      await nodeBuildStrategy.build(
        path.join(repo.dir, "apps/web"),
        {
          ...createBuildCtx("dep-node-monorepo"),
          repoDir: path.join(repo.dir, "apps/web"),
          workspaceDir: repo.dir,
          repoRelativeDir: "apps/web",
          workspaceRelativeDir: ".",
          previewMode: "server"
        },
        runtime
      );

      expect(calls[0]).toEqual({
        cmd: ["npm", "ci"],
        cwd: repo.dir,
        workdirRelative: "."
      });
      expect(calls[1]).toEqual({
        cmd: ["npm", "run", "build"],
        cwd: repo.dir,
        workdirRelative: "apps/web"
      });
    } finally {
      await repo.cleanup();
    }
  });
});

describe("python build strategy", () => {
  it("includes stdout and stderr in python dependency install failures", async () => {
    const repo = await createRepo({
      "requirements.txt": "mkdocs==1.6.0"
    });

    const runtime: BuildRuntime = {
      ...createRuntime(),
      which: (command) => (command === "python3" ? "python3" : command === "python" ? "python" : null),
      runCommand: async (cmd) => {
        if (cmd[0] === "python" && cmd[1] === "-m" && cmd[2] === "venv") {
          return { code: 0, stdout: "", stderr: "" };
        }
        if (cmd[2] === "pip" && cmd[3] === "install") {
          return {
            code: 1,
            stdout: "Collecting mkdocs\nUsing cached mkdocs.whl",
            stderr: "ERROR: Could not find a version that satisfies the requirement mkdocs==1.6.0"
          };
        }
        return { code: 0, stdout: "", stderr: "" };
      }
    };

    try {
      await expect(
        pythonBuildStrategy.build(
          repo.dir,
          createBuildCtx("dep-python-install-fail"),
          runtime
        )
      ).rejects.toThrow(
        "Dependency install failed (exit code 1)\n\nstdout:\nCollecting mkdocs\nUsing cached mkdocs.whl\n\nstderr:\nERROR: Could not find a version that satisfies the requirement mkdocs==1.6.0"
      );
    } finally {
      await repo.cleanup();
    }
  });
});
