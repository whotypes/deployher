import { describe, expect, it } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
  it("copies the repo into a docker context and writes a Dockerfile with WORKDIR and CMD", async () => {
    const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "pdploy-runtime-context-"));
    const repoDir = path.join(tmpRoot, "repo");
    const workDir = path.join(tmpRoot, "work");

    try {
      await mkdir(path.join(repoDir, "web"), { recursive: true });
      await writeFile(path.join(repoDir, "package.json"), JSON.stringify({ private: true }), "utf8");
      await writeFile(path.join(repoDir, "web", "index.js"), "console.log('ok');\n", "utf8");
      await mkdir(workDir, { recursive: true });

      const contextDir = await createServerRuntimeImageContext(repoDir, workDir, {
        workingDir: "web",
        port: 3000,
        framework: "nextjs",
        command: ["node", "index.js"]
      });

      const dockerfile = await Bun.file(path.join(contextDir, "Dockerfile")).text();
      expect(dockerfile).toContain("WORKDIR /workspace");
      expect(dockerfile).toContain("WORKDIR /workspace/web");
      expect(dockerfile).toContain("ENV PORT=3000");
      expect(dockerfile).toContain('CMD ["node","index.js"]');
      expect(await Bun.file(path.join(contextDir, "app", "web", "index.js")).text()).toContain("console.log('ok');");
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
