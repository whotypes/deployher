import path from "path";

const DEFAULT_BINARY_RELATIVE_PATH = path.join("dist", "picoclaw-deployer");
const DEFAULT_FALLBACK_BINARY_RELATIVE_PATH = path.join(
  "golang",
  "picoclaw-deployer",
  "bin",
  "picoclaw-deployer"
);
const DEFAULT_CONTAINER_NAME = "deployher-agent-launcher";
const DEFAULT_DATA_DIR_RELATIVE_PATH = path.join("var", "picoclaw-agent");
const DEFAULT_GATEWAY_PORT = 18790;
const DEFAULT_LAUNCHER_PORT = 18800;
const ALREADY_EXISTS_MARKER = "already exists; rerun with --replace to recreate it";

type SpawnedProcess = {
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  exited: Promise<number>;
};

type SpawnFn = (
  cmd: string[],
  options: {
    cwd: string;
    stdout: "pipe";
    stderr: "pipe";
  }
) => SpawnedProcess;

type Deps = {
  cwd: string;
  env: Record<string, string | undefined>;
  fileExists: (targetPath: string) => Promise<boolean>;
  which: (command: string) => string | null;
  spawn: SpawnFn;
  readText: (stream: ReadableStream<Uint8Array> | null) => Promise<string>;
};

const trimEnv = (
  env: Record<string, string | undefined>,
  key: string
): string | undefined => {
  const value = env[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const parsePort = (
  env: Record<string, string | undefined>,
  key: string,
  fallback: number
): number => {
  const raw = trimEnv(env, key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    throw new AgentProjectDeployerError(
      `${key} must be an integer between 1 and 65535`,
      500
    );
  }
  return parsed;
};

const parseBoolean = (
  env: Record<string, string | undefined>,
  key: string,
  fallback: boolean
): boolean => {
  const raw = trimEnv(env, key);
  if (!raw) return fallback;
  switch (raw.toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
};

const defaultReadText = async (
  stream: ReadableStream<Uint8Array> | null
): Promise<string> => {
  if (!stream) return "";
  return await new Response(stream).text();
};

const defaultDeps = (): Deps => ({
  cwd: process.cwd(),
  env: { ...process.env, ...Bun.env },
  fileExists: async (targetPath) => await Bun.file(targetPath).exists(),
  which: (command) => Bun.which(command),
  spawn: (cmd, options) => Bun.spawn(cmd, options),
  readText: defaultReadText
});

const resolveBinaryCandidate = async (
  candidate: string,
  deps: Deps
): Promise<string | null> => {
  if (!candidate) return null;

  if (path.isAbsolute(candidate)) {
    return (await deps.fileExists(candidate)) ? candidate : null;
  }

  const cwdCandidate = path.join(deps.cwd, candidate);
  if (await deps.fileExists(cwdCandidate)) {
    return cwdCandidate;
  }

  return deps.which(candidate);
};

export const resolveAgentProjectDeployerBinaryPath = async (
  depsInput?: Partial<Deps>
): Promise<string | null> => {
  const deps = { ...defaultDeps(), ...depsInput };
  const envOverride = trimEnv(deps.env, "AGENT_PROJECT_BINARY_PATH");
  const candidates = [
    envOverride,
    DEFAULT_BINARY_RELATIVE_PATH,
    DEFAULT_FALLBACK_BINARY_RELATIVE_PATH,
    "picoclaw-deployer"
  ];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    const resolved = await resolveBinaryCandidate(candidate, deps);
    if (resolved) return resolved;
  }

  return null;
};

export class AgentProjectDeployerError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "AgentProjectDeployerError";
    this.status = status;
  }
}

export type AgentProjectDeployerPlan = {
  binaryPath: string;
  containerName: string;
  dataDir: string;
  gatewayPort: number;
  launcherPort: number;
  dashboardToken: string | null;
  pull: boolean;
  gatewayUrl: string;
  launcherUrl: string;
};

export type AgentProjectDeployerResult = AgentProjectDeployerPlan & {
  command: string[];
  alreadyRunning: boolean;
  stdout: string;
  stderr: string;
};

export const resolveAgentProjectDeployerPlan = async (
  depsInput?: Partial<Deps>
): Promise<AgentProjectDeployerPlan> => {
  const deps = { ...defaultDeps(), ...depsInput };
  const binaryPath = await resolveAgentProjectDeployerBinaryPath(deps);
  if (!binaryPath) {
    throw new AgentProjectDeployerError(
      `Picoclaw deployer binary is not available. Build ${DEFAULT_BINARY_RELATIVE_PATH} or set AGENT_PROJECT_BINARY_PATH.`,
      503
    );
  }

  const containerName =
    trimEnv(deps.env, "AGENT_PROJECT_CONTAINER_NAME") ?? DEFAULT_CONTAINER_NAME;
  const dataDirRaw =
    trimEnv(deps.env, "AGENT_PROJECT_DATA_DIR") ??
    path.join(deps.cwd, DEFAULT_DATA_DIR_RELATIVE_PATH);
  const dataDir = path.isAbsolute(dataDirRaw)
    ? dataDirRaw
    : path.join(deps.cwd, dataDirRaw);
  const gatewayPort = parsePort(
    deps.env,
    "AGENT_PROJECT_GATEWAY_PORT",
    DEFAULT_GATEWAY_PORT
  );
  const launcherPort = parsePort(
    deps.env,
    "AGENT_PROJECT_LAUNCHER_PORT",
    DEFAULT_LAUNCHER_PORT
  );
  const dashboardToken = trimEnv(deps.env, "AGENT_PROJECT_DASHBOARD_TOKEN") ?? null;
  const pull = parseBoolean(deps.env, "AGENT_PROJECT_PULL", false);

  return {
    binaryPath,
    containerName,
    dataDir,
    gatewayPort,
    launcherPort,
    dashboardToken,
    pull,
    gatewayUrl: `http://127.0.0.1:${gatewayPort}`,
    launcherUrl: `http://127.0.0.1:${launcherPort}`
  };
};

export const buildAgentProjectDeployerCommand = (
  plan: AgentProjectDeployerPlan,
  options: { replace?: boolean } = {}
): string[] => {
  const command = [
    plan.binaryPath,
    "--mode",
    "launcher",
    "--name",
    plan.containerName,
    "--data-dir",
    plan.dataDir,
    "--gateway-port",
    String(plan.gatewayPort),
    "--launcher-port",
    String(plan.launcherPort)
  ];

  if (plan.dashboardToken) {
    command.push("--dashboard-token", plan.dashboardToken);
  }
  if (plan.pull) {
    command.push("--pull");
  }
  if (options.replace) {
    command.push("--replace");
  }

  return command;
};

export const ensureAgentProjectDeployer = async (
  depsInput?: Partial<Deps>,
  options: { replace?: boolean } = {}
): Promise<AgentProjectDeployerResult> => {
  const deps = { ...defaultDeps(), ...depsInput };
  const plan = await resolveAgentProjectDeployerPlan(deps);
  const command = buildAgentProjectDeployerCommand(plan, options);

  let proc: SpawnedProcess;
  try {
    proc = deps.spawn(command, {
      cwd: deps.cwd,
      stdout: "pipe",
      stderr: "pipe"
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Picoclaw deployer";
    throw new AgentProjectDeployerError(message, 503);
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    deps.readText(proc.stdout),
    deps.readText(proc.stderr),
    proc.exited
  ]);
  const normalizedStdout = stdout.trim();
  const normalizedStderr = stderr.trim();
  const combinedOutput = [normalizedStderr, normalizedStdout].filter(Boolean).join("\n");
  const alreadyRunning = combinedOutput.includes(ALREADY_EXISTS_MARKER);

  if (exitCode !== 0 && !alreadyRunning) {
    throw new AgentProjectDeployerError(
      combinedOutput || `Picoclaw deployer exited with code ${exitCode}`,
      502
    );
  }

  return {
    ...plan,
    command,
    alreadyRunning,
    stdout: normalizedStdout,
    stderr: normalizedStderr
  };
};
