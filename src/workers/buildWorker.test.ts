import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, lstat, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createNextTracedRuntimeImageContext,
  createNextStandaloneRuntimeImageContext,
  createServerRuntimeInstallImageContext,
  resolveDeploymentTerminalStatus,
  resolveDockerCommandInactivityTimeoutMs,
  resolveHostCommandInactivityTimeoutMs,
  splitProjectEnvs
} from "./buildWorker";

describe("resolveHostCommandInactivityTimeoutMs", () => {
  it("uses the dedicated preview runtime timeout for docker push", () => {
    const timeoutMs = resolveHostCommandInactivityTimeoutMs([
      "docker",
      "push",
      "127.0.0.1:8082/docker-hosted/deployher-preview-runtime:deployment-id"
    ]);

    expect(timeoutMs).toBe(300000);
  });

  it("keeps the standard timeout for regular build commands", () => {
    const timeoutMs = resolveHostCommandInactivityTimeoutMs(["bun", "run", "build"]);

    expect(timeoutMs).toBe(30000);
  });

  it("uses the long quiet-window timeout for host docker build (runtime image)", () => {
    const timeoutMs = resolveHostCommandInactivityTimeoutMs([
      "docker",
      "build",
      "--progress=plain",
      "-t",
      "deployher-runtime-temp:dep",
      "."
    ]);

    expect(timeoutMs).toBe(300000);
  });
});

describe("resolveDockerCommandInactivityTimeoutMs", () => {
  it("uses a long quiet-window timeout for bun run build inside Docker", () => {
    expect(resolveDockerCommandInactivityTimeoutMs(["bun", "run", "build"])).toBe(300000);
  });

  it("uses the standard timeout for dependency installs", () => {
    expect(resolveDockerCommandInactivityTimeoutMs(["bun", "install"])).toBe(30000);
  });

  it("uses a long quiet-window timeout for next build", () => {
    expect(
      resolveDockerCommandInactivityTimeoutMs(["node", "node_modules/next/dist/bin/next", "build"])
    ).toBe(300000);
  });
});

describe("resolveDeploymentTerminalStatus", () => {
  it("fails a server deployment that has no runnable runtime image", () => {
    const status = resolveDeploymentTerminalStatus({
      status: "success",
      serveStrategy: "server",
      runtimeImagePullRef: null,
      runtimeImageArtifactKey: null
    });

    expect(status).toBe("failed");
  });

  it("keeps server deployments successful when a runtime image pull ref is present", () => {
    const status = resolveDeploymentTerminalStatus({
      status: "success",
      serveStrategy: "server",
      runtimeImagePullRef: "127.0.0.1:8082/docker-hosted/deployher-preview-runtime@sha256:abc",
      runtimeImageArtifactKey: null
    });

    expect(status).toBe("success");
  });
});

describe("createServerRuntimeInstallImageContext", () => {
  it("writes a Dockerfile that installs production dependencies from the workspace root", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "pdploy-runtime-context-"));
    const repoDir = path.join(tmpRoot, "repo");
    const workDir = path.join(tmpRoot, "work");

    try {
      await mkdir(path.join(repoDir, "web"), { recursive: true });
      await mkdir(path.join(repoDir, "node_modules"), { recursive: true });
      await mkdir(workDir, { recursive: true });
      await writeFile(path.join(repoDir, "package.json"), JSON.stringify({ private: true }), "utf8");
      await writeFile(path.join(repoDir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n", "utf8");
      await writeFile(path.join(repoDir, "web", "package.json"), JSON.stringify({ name: "web" }), "utf8");

      const contextDir = await createServerRuntimeInstallImageContext(
        repoDir,
        workDir,
        {
          workingDir: "web",
          port: 3000,
          framework: "nextjs",
          command: ["node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
        },
        {
          workspaceRelativeDir: ".",
          installCommand: ["corepack", "pnpm", "install", "--frozen-lockfile", "--prod"]
        }
      );

      const dockerfile = await Bun.file(path.join(contextDir, "Dockerfile")).text();
      expect(dockerfile).toContain('RUN ["corepack","pnpm","install","--frozen-lockfile","--prod"]');
      expect(dockerfile).toContain("WORKDIR /workspace");
      expect(dockerfile).toContain("WORKDIR /workspace/web");
      await expect(lstat(path.join(contextDir, "app", "node_modules"))).rejects.toThrow();
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("createNextStandaloneRuntimeImageContext", () => {
  it("packages standalone output with static and public assets", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "pdploy-runtime-context-"));
    const repoDir = path.join(tmpRoot, "repo");
    const workDir = path.join(tmpRoot, "work");

    try {
      await mkdir(path.join(repoDir, ".next", "standalone", ".next"), { recursive: true });
      await mkdir(path.join(repoDir, ".next", "static"), { recursive: true });
      await mkdir(path.join(repoDir, "public"), { recursive: true });
      await mkdir(workDir, { recursive: true });
      await writeFile(path.join(repoDir, ".next", "standalone", "server.js"), "console.log('ok');\n", "utf8");
      await writeFile(path.join(repoDir, ".next", "static", "asset.txt"), "static\n", "utf8");
      await writeFile(path.join(repoDir, "public", "favicon.ico"), "ico\n", "utf8");

      const contextDir = await createNextStandaloneRuntimeImageContext(repoDir, workDir, {
        workingDir: ".",
        port: 3000,
        framework: "nextjs",
        command: ["node", "server.cjs"]
      });

      const dockerfile = await Bun.file(path.join(contextDir, "Dockerfile")).text();
      expect(dockerfile).toContain('CMD ["node","server.cjs"]');
      expect(await Bun.file(path.join(contextDir, "app", "server.js")).text()).toContain("console.log('ok');");
      expect(await Bun.file(path.join(contextDir, "app", "server.cjs")).text()).toContain("console.log('ok');");
      expect(await Bun.file(path.join(contextDir, "app", ".next", "static", "asset.txt")).text()).toBe("static\n");
      expect(await Bun.file(path.join(contextDir, "app", "public", "favicon.ico")).text()).toBe("ico\n");
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("createNextTracedRuntimeImageContext", () => {
  it("packages a traced next runtime rooted at the tracing root and preserves symlinks", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "pdploy-runtime-context-"));
    const repoDir = path.join(tmpRoot, "repo");
    const projectDir = path.join(repoDir, "web");
    const workDir = path.join(tmpRoot, "work");

    try {
      await mkdir(path.join(projectDir, ".next", "server", "app", "_not-found"), { recursive: true });
      await mkdir(path.join(projectDir, ".next", "static"), { recursive: true });
      await mkdir(path.join(repoDir, "node_modules", ".pnpm", "pkg@1.0.0", "node_modules", "pkg"), { recursive: true });
      await mkdir(path.join(repoDir, "node_modules", ".pnpm", "node_modules"), { recursive: true });
      await mkdir(workDir, { recursive: true });

      await writeFile(
        path.join(projectDir, "package.json"),
        JSON.stringify({ name: "web", dependencies: { next: "16.0.7" } }),
        "utf8"
      );
      await writeFile(
        path.join(projectDir, ".next", "required-server-files.json"),
        JSON.stringify({
          version: 1,
          appDir: "/workspace/web",
          relativeAppDir: "web",
          config: { outputFileTracingRoot: "/workspace" },
          files: [".next/BUILD_ID", ".next/server/app-paths-manifest.json"]
        }),
        "utf8"
      );
      await writeFile(path.join(projectDir, ".next", "BUILD_ID"), "build-id\n", "utf8");
      await writeFile(path.join(projectDir, ".next", "server", "app-paths-manifest.json"), "{}\n", "utf8");
      await writeFile(path.join(projectDir, ".next", "server", "app", "page.js"), "module.exports = {}\n", "utf8");
      await writeFile(
        path.join(projectDir, ".next", "server", "app", "_not-found", "page.js"),
        "module.exports = { notFound: true }\n",
        "utf8"
      );
      await writeFile(path.join(projectDir, ".next", "static", "asset.txt"), "static\n", "utf8");
      await writeFile(
        path.join(projectDir, ".next", "next-server.js.nft.json"),
        JSON.stringify({
          version: 1,
          files: [
            "../../node_modules/.pnpm/node_modules/pkg",
            "../../node_modules/.pnpm/pkg@1.0.0/node_modules/pkg/index.js",
            "./package.json"
          ]
        }),
        "utf8"
      );
      await writeFile(path.join(repoDir, "node_modules", ".pnpm", "pkg@1.0.0", "node_modules", "pkg", "index.js"), "module.exports = 'pkg';\n", "utf8");
      await symlink("../pkg@1.0.0/node_modules/pkg", path.join(repoDir, "node_modules", ".pnpm", "node_modules", "pkg"));

      const contextDir = await createNextTracedRuntimeImageContext(
        repoDir,
        projectDir,
        workDir,
        {
          workingDir: ".",
          port: 3000,
          framework: "nextjs",
          command: ["node", "server.cjs"]
        }
      );

      const dockerfile = await Bun.file(path.join(contextDir, "Dockerfile")).text();
      expect(dockerfile).toContain('WORKDIR /workspace');
      expect(dockerfile).toContain('CMD ["node","server.cjs"]');
      expect(await Bun.file(path.join(contextDir, "app", "server.cjs")).text()).toContain("const { startServer } = appRequire('next/dist/server/lib/start-server')");
      expect(await Bun.file(path.join(contextDir, "app", "server.cjs")).text()).toContain('const dir = path.join(__dirname, "web")');
      expect(await Bun.file(path.join(contextDir, "app", "server.cjs")).text()).toContain("const appRequire = createRequire(path.join(dir, 'package.json'))");
      expect(await Bun.file(path.join(contextDir, "app", "web", ".next", "BUILD_ID")).text()).toBe("build-id\n");
      expect(await Bun.file(path.join(contextDir, "app", "web", ".next", "static", "asset.txt")).text()).toBe("static\n");
      expect(
        await Bun.file(path.join(contextDir, "app", "web", ".next", "server", "app", "_not-found", "page.js")).text()
      ).toBe("module.exports = { notFound: true }\n");
      expect(await Bun.file(path.join(contextDir, "app", "node_modules", ".pnpm", "pkg@1.0.0", "node_modules", "pkg", "index.js")).text()).toBe("module.exports = 'pkg';\n");
      expect((await lstat(path.join(contextDir, "app", "node_modules", ".pnpm", "node_modules", "pkg"))).isSymbolicLink()).toBe(true);
    } finally {
      await rm(tmpRoot, { recursive: true, force: true });
    }
  });
});

describe("splitProjectEnvs", () => {
  it("keeps build-scoped vars out of runtime env and runtime-scoped vars out of build env", () => {
    const result = splitProjectEnvs([
      { key: "NEXT_PUBLIC_SITE_URL", value: "https://example.test", isPublic: true },
      { key: "PD_PUBLIC_FLAG", value: "on", isPublic: true },
      { key: "DATABASE_URL", value: "postgres://db.internal/app", isPublic: false },
      { key: "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY", value: "server-secret", isPublic: false }
    ]);

    expect(result.buildEnv).toEqual({
      NEXT_PUBLIC_SITE_URL: "https://example.test",
      PD_PUBLIC_FLAG: "on"
    });
    expect(result.runtimeEnv).toEqual({
      DATABASE_URL: "postgres://db.internal/app",
      NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "server-secret"
    });
  });
});
