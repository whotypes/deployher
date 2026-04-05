import { describe, expect, it } from "bun:test";
import path from "path";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { mergeBuildProjectConfigWithRepoDeployherToml, type BuildWorkerProjectConfig } from "./repoDeployherConfig";

const baseConfig = (): BuildWorkerProjectConfig => ({
  previewMode: "auto",
  serverPreviewTarget: "isolated-runner",
  runtimeImageMode: "auto",
  dockerfilePath: null,
  dockerBuildTarget: null,
  skipHostStrategyBuild: false,
  runtimeContainerPort: 3000,
  workspaceRootDir: ".",
  projectRootDir: ".",
  frameworkHint: "auto",
  installCommand: null,
  buildCommand: null
});

describe("mergeBuildProjectConfigWithRepoDeployherToml", () => {
  it("returns the same config when deployher.toml is missing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deployher-merge-"));
    try {
      const input = baseConfig();
      const merged = await mergeBuildProjectConfigWithRepoDeployherToml(input, dir, () => {});
      expect(merged).toEqual(input);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("applies [deployher] when project fields match defaults", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deployher-merge-"));
    try {
      await writeFile(
        path.join(dir, "deployher.toml"),
        `[deployher]
preview_mode = "server"
runtime_image_mode = "dockerfile"
skip_host_strategy_build = true
runtime_container_port = 3000
`,
        "utf8"
      );
      const logs: string[] = [];
      const merged = await mergeBuildProjectConfigWithRepoDeployherToml(
        baseConfig(),
        dir,
        (line) => {
          logs.push(line);
        }
      );
      expect(merged.previewMode).toBe("server");
      expect(merged.runtimeImageMode).toBe("dockerfile");
      expect(merged.skipHostStrategyBuild).toBe(true);
      expect(merged.runtimeContainerPort).toBe(3000);
      expect(logs.some((l) => l.startsWith("Applied deployher.toml"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not override preview mode when the project is already non-default", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "deployher-merge-"));
    try {
      await writeFile(
        path.join(dir, "deployher.toml"),
        `[deployher]
preview_mode = "server"
`,
        "utf8"
      );
      const input = { ...baseConfig(), previewMode: "static" as const };
      const merged = await mergeBuildProjectConfigWithRepoDeployherToml(input, dir, () => {});
      expect(merged.previewMode).toBe("static");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
