import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, readlink, symlink, writeFile, rm, lstat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createServerRuntimeImageContext,
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

describe("createServerRuntimeImageContext", () => {
  it("dereferences runtime symlinks so copied executables stay valid in the image", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "pdploy-runtime-context-"));
    const repoDir = path.join(tmpRoot, "repo");
    const workDir = path.join(tmpRoot, "work");
    const externalBinDir = path.join(tmpRoot, "external-bin");
    const externalNext = path.join(externalBinDir, "next");

    try {
      await mkdir(path.join(repoDir, "node_modules", ".bin"), { recursive: true });
      await mkdir(workDir, { recursive: true });
      await mkdir(externalBinDir, { recursive: true });
      await writeFile(externalNext, "#!/usr/bin/env node\nconsole.log('next');\n", "utf8");
      await symlink(externalNext, path.join(repoDir, "node_modules", ".bin", "next"));

      const contextDir = await createServerRuntimeImageContext(repoDir, workDir, {
        workingDir: ".",
        port: 3000,
        framework: "nextjs",
        command: ["node_modules/next/dist/bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
      });

      const copiedNext = path.join(contextDir, "app", "node_modules", ".bin", "next");
      const stat = await lstat(copiedNext);

      expect(stat.isSymbolicLink()).toBe(false);
      expect(await Bun.file(copiedNext).text()).toContain("console.log('next');");
      await expect(readlink(copiedNext)).rejects.toThrow();
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
