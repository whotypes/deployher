export type BuildStrategyId = "node" | "python";
export type DeploymentBuildStrategy = BuildStrategyId | "unknown";
export type ServeStrategy = "static" | "server";

export type BuildResult = {
  buildStrategy: BuildStrategyId;
  serveStrategy: ServeStrategy;
  outputDir?: string;
};

export type BuildExecutionContext = {
  deploymentId: string;
  logs: string[];
  log: (line: string) => void;
};

export type RunCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type BuildRuntime = {
  exists: (filePath: string) => Promise<boolean>;
  isDirectory: (filePath: string) => Promise<boolean>;
  readJson: <T>(filePath: string) => Promise<T | null>;
  readToml: <T>(filePath: string) => Promise<T | null>;
  runCommand: (
    cmd: string[],
    options: { cwd: string; env?: Record<string, string> }
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
