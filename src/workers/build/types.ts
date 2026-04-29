export type BuildStrategyId = "node" | "python" | "static";
export type DeploymentBuildStrategy = BuildStrategyId | "unknown";
export type ServeStrategy = "static" | "server";
export type PreviewMode = "auto" | "static" | "server";
export type ServerPreviewTarget = "isolated-runner";
export type FrameworkHint = "auto" | "nextjs" | "node" | "python" | "static";
export type RuntimeImageMode = "auto" | "platform" | "dockerfile";
export type PreviewResolutionCode =
  | "project_forced_static"
  | "project_forced_server"
  | "next_dot_next"
  | "static_index_html"
  | "python_static_output"
  | "dockerfile_only_server";
export type PreviewResolution = {
  code: PreviewResolutionCode;
  detail?: string;
};
export type RuntimeConfig = {
  workingDir?: string;
  port: number;
  command: string[];
  framework?: "nextjs" | "node";
  env?: Record<string, string>;
};

export type RuntimePackaging =
  | {
      kind: "next-standalone";
    }
  | {
      kind: "next-trace";
    }
  | {
      kind: "workspace-install";
      installCommand: string[];
    };

export type BuildResult = {
  buildStrategy: BuildStrategyId;
  serveStrategy: ServeStrategy;
  outputDir?: string;
  runtimeConfig?: RuntimeConfig;
  runtimePackaging?: RuntimePackaging;
  previewResolution: PreviewResolution;
};

export type BuildExecutionContext = {
  deploymentId: string;
  logs: string[];
  log: (line: string) => void;
  appendLogChunk: (content: string) => void;
  env: Record<string, string>;
  /** Extracted repository root (contains the full checkout). */
  repoRootDir: string;
  repoDir: string;
  workspaceDir: string;
  repoRelativeDir: string;
  workspaceRelativeDir: string;
  previewMode: PreviewMode;
  serverPreviewTarget: ServerPreviewTarget;
  frameworkHint: FrameworkHint;
  installCommandOverride: string[] | null;
  buildCommandOverride: string[] | null;
};

export type RunCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type BuildRuntime = {
  containerRepoDir?: string;
  exists: (filePath: string) => Promise<boolean>;
  isDirectory: (filePath: string) => Promise<boolean>;
  which: (command: string) => string | null;
  readJson: <T>(filePath: string) => Promise<T | null>;
  readToml: <T>(filePath: string) => Promise<T | null>;
  runCommand: (
    cmd: string[],
    options: { cwd: string; env?: Record<string, string>; workdirRelative?: string }
  ) => Promise<RunCommandResult>;
  resolveBunCli: () => { command: string; env?: Record<string, string> };
};

export type BuildStrategy = {
  id: BuildStrategyId;
  detect: (repoDir: string, runtime: BuildRuntime) => Promise<boolean>;
  build: (
    repoDir: string,
    ctx: BuildExecutionContext,
    runtime: BuildRuntime
  ) => Promise<BuildResult>;
};
