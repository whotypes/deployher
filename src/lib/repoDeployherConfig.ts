import path from "path";
import * as schema from "../db/schema";
import { parseRepoRelativePath, parseRuntimeImageMode } from "./projectPaths";

type BuildProjectRow = typeof schema.projects.$inferSelect;

export type BuildWorkerProjectConfig = Pick<
  BuildProjectRow,
  | "previewMode"
  | "serverPreviewTarget"
  | "runtimeImageMode"
  | "dockerfilePath"
  | "dockerBuildTarget"
  | "skipHostStrategyBuild"
  | "runtimeContainerPort"
  | "workspaceRootDir"
  | "projectRootDir"
  | "frameworkHint"
  | "installCommand"
  | "buildCommand"
>;

const PREVIEW_MODES = new Set<BuildProjectRow["previewMode"]>(["auto", "static", "server"]);
const SERVER_PREVIEW_TARGETS = new Set<BuildProjectRow["serverPreviewTarget"]>(["isolated-runner"]);

const DEPLOYHER_TOML_DEFAULTS: Pick<
  BuildProjectRow,
  | "previewMode"
  | "serverPreviewTarget"
  | "runtimeImageMode"
  | "dockerfilePath"
  | "dockerBuildTarget"
  | "skipHostStrategyBuild"
  | "runtimeContainerPort"
> = {
  previewMode: "auto",
  serverPreviewTarget: "isolated-runner",
  runtimeImageMode: "auto",
  dockerfilePath: null,
  dockerBuildTarget: null,
  skipHostStrategyBuild: false,
  runtimeContainerPort: 3000
};

type RawDeployherFile = {
  deployher?: Record<string, unknown>;
};

const parsePreviewMode = (value: unknown): BuildProjectRow["previewMode"] | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as BuildProjectRow["previewMode"];
  return PREVIEW_MODES.has(normalized) ? normalized : null;
};

const parseServerPreviewTarget = (value: unknown): BuildProjectRow["serverPreviewTarget"] | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim() as BuildProjectRow["serverPreviewTarget"];
  return SERVER_PREVIEW_TARGETS.has(normalized) ? normalized : null;
};

const parseSkipHost = (value: unknown): boolean | null => {
  if (typeof value !== "boolean") return null;
  return value;
};

const parseRuntimeContainerPort = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized >= 1 && normalized <= 65535 ? normalized : null;
};

const parseDockerBuildTarget = (value: unknown): string | null => {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const readRawDeployherTable = async (repoDir: string): Promise<Record<string, unknown> | null> => {
  const filePath = path.join(repoDir, "deployher.toml");
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(await file.text());
  } catch {
    throw new Error("deployher.toml could not be parsed as TOML");
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("deployher.toml must be a TOML table");
  }
  const root = parsed as RawDeployherFile;
  const table = root.deployher;
  if (table === undefined) {
    return null;
  }
  if (table === null || typeof table !== "object") {
    throw new Error("deployher.toml [deployher] must be a table");
  }
  return table as Record<string, unknown>;
};

export const mergeBuildProjectConfigWithRepoDeployherToml = async (
  projectConfig: BuildWorkerProjectConfig,
  repoDir: string,
  log: (line: string) => void
): Promise<BuildWorkerProjectConfig> => {
  const table = await readRawDeployherTable(repoDir);
  if (!table) {
    return projectConfig;
  }

  const patch: Partial<BuildWorkerProjectConfig> = {};
  const applied: string[] = [];

  if (table.preview_mode !== undefined) {
    const next = parsePreviewMode(table.preview_mode);
    if (!next) {
      throw new Error("deployher.toml preview_mode must be one of: auto, static, server");
    }
    if (projectConfig.previewMode === DEPLOYHER_TOML_DEFAULTS.previewMode) {
      patch.previewMode = next;
      applied.push(`preview_mode=${next}`);
    }
  }

  if (table.server_preview_target !== undefined) {
    const next = parseServerPreviewTarget(table.server_preview_target);
    if (!next) {
      throw new Error("deployher.toml server_preview_target must be: isolated-runner");
    }
    if (projectConfig.serverPreviewTarget === DEPLOYHER_TOML_DEFAULTS.serverPreviewTarget) {
      patch.serverPreviewTarget = next;
      applied.push(`server_preview_target=${next}`);
    }
  }

  if (table.runtime_image_mode !== undefined) {
    const next = parseRuntimeImageMode(table.runtime_image_mode);
    if (!next) {
      throw new Error("deployher.toml runtime_image_mode must be one of: auto, platform, dockerfile");
    }
    if (projectConfig.runtimeImageMode === DEPLOYHER_TOML_DEFAULTS.runtimeImageMode) {
      patch.runtimeImageMode = next;
      applied.push(`runtime_image_mode=${next}`);
    }
  }

  if (table.dockerfile_path !== undefined) {
    const next =
      table.dockerfile_path === null ? null : parseRepoRelativePath(table.dockerfile_path);
    if (table.dockerfile_path !== null && next == null) {
      throw new Error(
        "deployher.toml dockerfile_path must be null or a relative repository path like Dockerfile"
      );
    }
    if (projectConfig.dockerfilePath === DEPLOYHER_TOML_DEFAULTS.dockerfilePath) {
      patch.dockerfilePath = next;
      applied.push(next == null ? "dockerfile_path=null" : `dockerfile_path=${next}`);
    }
  }

  if (table.docker_build_target !== undefined) {
    const next = parseDockerBuildTarget(table.docker_build_target);
    if (table.docker_build_target !== null && next == null) {
      throw new Error("deployher.toml docker_build_target must be null or a non-empty string");
    }
    if (projectConfig.dockerBuildTarget === DEPLOYHER_TOML_DEFAULTS.dockerBuildTarget) {
      patch.dockerBuildTarget = next;
      applied.push(next == null ? "docker_build_target=null" : `docker_build_target=${next}`);
    }
  }

  if (table.skip_host_strategy_build !== undefined) {
    const next = parseSkipHost(table.skip_host_strategy_build);
    if (next === null) {
      throw new Error("deployher.toml skip_host_strategy_build must be a boolean");
    }
    if (projectConfig.skipHostStrategyBuild === DEPLOYHER_TOML_DEFAULTS.skipHostStrategyBuild) {
      patch.skipHostStrategyBuild = next;
      applied.push(`skip_host_strategy_build=${next}`);
    }
  }

  if (table.runtime_container_port !== undefined) {
    const next = parseRuntimeContainerPort(table.runtime_container_port);
    if (next === null) {
      throw new Error("deployher.toml runtime_container_port must be an integer from 1 to 65535");
    }
    if (projectConfig.runtimeContainerPort === DEPLOYHER_TOML_DEFAULTS.runtimeContainerPort) {
      patch.runtimeContainerPort = next;
      applied.push(`runtime_container_port=${next}`);
    }
  }

  if (applied.length === 0) {
    return projectConfig;
  }

  log(`Applied deployher.toml (${applied.join(", ")})`);
  return { ...projectConfig, ...patch };
};
