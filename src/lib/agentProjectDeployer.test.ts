import path from "path";
import { describe, expect, test } from "bun:test";
import {
  AgentProjectDeployerError,
  buildAgentProjectDeployerCommand,
  ensureAgentProjectDeployer,
  resolveAgentProjectDeployerPlan,
  resolveAgentProjectDeployerBinaryPath
} from "./agentProjectDeployer";

const streamFromText = (text: string): ReadableStream<Uint8Array> =>
  new Response(text).body as ReadableStream<Uint8Array>;

describe("resolveAgentProjectDeployerBinaryPath", () => {
  test("prefers the built dist binary", async () => {
    const cwd = "/workspace";

    const binaryPath = await resolveAgentProjectDeployerBinaryPath({
      cwd,
      env: {},
      fileExists: async (targetPath) => targetPath === path.join(cwd, "dist", "picoclaw-deployer"),
      which: () => null,
      spawn: () => {
        throw new Error("not used");
      },
      readText: async () => ""
    });

    expect(binaryPath).toBe(path.join(cwd, "dist", "picoclaw-deployer"));
  });
});

describe("ensureAgentProjectDeployer", () => {
  test("builds a replace command for deployment-time restarts", async () => {
    const cwd = "/workspace";

    const plan = await resolveAgentProjectDeployerPlan({
      cwd,
      env: {},
      fileExists: async (targetPath) => targetPath === path.join(cwd, "dist", "picoclaw-deployer"),
      which: () => null,
      spawn: () => {
        throw new Error("not used");
      },
      readText: async () => ""
    });

    expect(buildAgentProjectDeployerCommand(plan, { replace: true })).toEqual([
      path.join(cwd, "dist", "picoclaw-deployer"),
      "--mode",
      "launcher",
      "--name",
      "deployher-agent-launcher",
      "--data-dir",
      path.join(cwd, "var", "picoclaw-agent"),
      "--gateway-port",
      "18790",
      "--launcher-port",
      "18800",
      "--replace"
    ]);
  });

  test("starts the launcher deployer with the expected command", async () => {
    const cwd = "/workspace";
    const seenCommands: string[][] = [];

    const result = await ensureAgentProjectDeployer({
      cwd,
      env: {
        AGENT_PROJECT_PULL: "true"
      },
      fileExists: async (targetPath) => targetPath === path.join(cwd, "dist", "picoclaw-deployer"),
      which: () => null,
      spawn: (cmd) => {
        seenCommands.push(cmd);
        return {
          stdout: streamFromText("Started PicoClaw container\nLauncher UI: http://127.0.0.1:18800\n"),
          stderr: streamFromText(""),
          exited: Promise.resolve(0)
        };
      },
      readText: async (stream) => await new Response(stream).text()
    });

    expect(seenCommands).toEqual([
      [
        path.join(cwd, "dist", "picoclaw-deployer"),
        "--mode",
        "launcher",
        "--name",
        "deployher-agent-launcher",
        "--data-dir",
        path.join(cwd, "var", "picoclaw-agent"),
        "--gateway-port",
        "18790",
        "--launcher-port",
        "18800",
        "--pull"
      ]
    ]);
    expect(result.alreadyRunning).toBe(false);
    expect(result.launcherUrl).toBe("http://127.0.0.1:18800");
    expect(result.gatewayUrl).toBe("http://127.0.0.1:18790");
  });

  test("treats an existing shared launcher as success", async () => {
    const cwd = "/workspace";

    const result = await ensureAgentProjectDeployer({
      cwd,
      env: {},
      fileExists: async (targetPath) => targetPath === path.join(cwd, "dist", "picoclaw-deployer"),
      which: () => null,
      spawn: () => ({
        stdout: streamFromText(""),
        stderr: streamFromText(
          'container "deployher-agent-launcher" already exists; rerun with --replace to recreate it\n'
        ),
        exited: Promise.resolve(1)
      }),
      readText: async (stream) => await new Response(stream).text()
    });

    expect(result.alreadyRunning).toBe(true);
    expect(result.containerName).toBe("deployher-agent-launcher");
  });

  test("returns a configuration error when the binary is missing", async () => {
    await expect(
      ensureAgentProjectDeployer({
        cwd: "/workspace",
        env: {},
        fileExists: async () => false,
        which: () => null,
        spawn: () => {
          throw new Error("not used");
        },
        readText: async () => ""
      })
    ).rejects.toMatchObject({
      name: "AgentProjectDeployerError",
      status: 503
    });
  });
});
