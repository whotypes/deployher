import path from "path";
import { detectNodePackageManager, resolveNodeInstallRoot } from "../packageManagers/node";
import type { BuildStrategy, PreviewResolution, RuntimeConfig } from "../types";

const STATIC_OUTPUT_DIRS = ["out", "dist", "build", "public"];
const DEFAULT_SERVER_PORT = 3000;

const formatCommandFailure = (
  stage: string,
  result: { code: number; stdout: string; stderr: string }
): string => {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const sections = [`${stage} failed (exit code ${result.code})`];

  if (stdout) {
    sections.push(`stdout:\n${stdout}`);
  }
  if (stderr) {
    sections.push(`stderr:\n${stderr}`);
  }
  if (!stdout && !stderr) {
    sections.push("No stdout or stderr was captured.");
  }

  return sections.join("\n\n");
};

type NodeDeployherConfig = {
  serveStrategy?: unknown;
  runtimeCommand?: unknown;
  runtimePort?: unknown;
  staticOutputDir?: unknown;
};

type NodePackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  deployher?: NodeDeployherConfig;
};

const detectStaticOutputDir = async (
  repoDir: string,
  runtime: { exists: (filePath: string) => Promise<boolean>; isDirectory: (filePath: string) => Promise<boolean> }
): Promise<string | null> => {
  for (const candidate of STATIC_OUTPUT_DIRS) {
    const full = path.join(repoDir, candidate);
    if (!(await runtime.isDirectory(full))) continue;
    if (await runtime.exists(path.join(full, "index.html"))) return full;
  }
  return null;
};

const resolveExplicitConfig = (
  rawConfig: NodeDeployherConfig | undefined
): {
  serveStrategy?: "static" | "server";
  runtimeCommand?: string[];
  runtimePort?: number;
  staticOutputDir?: string;
} => {
  if (!rawConfig) return {};

  const serveStrategy =
    rawConfig.serveStrategy === "static" || rawConfig.serveStrategy === "server"
      ? rawConfig.serveStrategy
      : undefined;
  const runtimeCommand = Array.isArray(rawConfig.runtimeCommand)
    ? rawConfig.runtimeCommand.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
  const runtimePort =
    typeof rawConfig.runtimePort === "number" && Number.isFinite(rawConfig.runtimePort) && rawConfig.runtimePort > 0
      ? Math.floor(rawConfig.runtimePort)
      : undefined;
  const staticOutputDir =
    typeof rawConfig.staticOutputDir === "string" && rawConfig.staticOutputDir.trim()
      ? rawConfig.staticOutputDir.trim()
      : undefined;

  return {
    ...(serveStrategy ? { serveStrategy } : {}),
    ...(runtimeCommand?.length ? { runtimeCommand } : {}),
    ...(runtimePort ? { runtimePort } : {}),
    ...(staticOutputDir ? { staticOutputDir } : {})
  };
};

const hasDependency = (pkg: NodePackageJson, name: string): boolean =>
  Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);

const fileExists = async (
  repoDir: string,
  fileName: string,
  exists: (filePath: string) => Promise<boolean>
): Promise<boolean> => exists(path.join(repoDir, fileName));

const defaultRuntimeCommand = (
  managerName: "bun" | "pnpm" | "yarn" | "npm"
): string[] => {
  switch (managerName) {
    case "bun":
      return ["bun", "run", "start"];
    case "pnpm":
      return ["corepack", "pnpm", "run", "start"];
    case "yarn":
      return ["corepack", "yarn", "start"];
    case "npm":
    default:
      return ["npm", "run", "start"];
  }
};

const validateStaticOutputDir = async (
  repoDir: string,
  outputDir: string,
  isDirectory: (filePath: string) => Promise<boolean>
): Promise<string> => {
  const resolvedOutputDir = path.resolve(repoDir, outputDir);
  const resolvedRepoDir = path.resolve(repoDir);
  if (
    resolvedOutputDir !== resolvedRepoDir &&
    !resolvedOutputDir.startsWith(`${resolvedRepoDir}${path.sep}`)
  ) {
    throw new Error("package.json#deployher.staticOutputDir must stay inside the repository root");
  }
  if (!(await isDirectory(resolvedOutputDir))) {
    throw new Error(`Configured static output directory not found: ${outputDir}`);
  }
  return resolvedOutputDir;
};

const runtimeWorkingDirFromProjectRoot = (repoRelativeDir: string): string => {
  const n = repoRelativeDir.trim().replace(/\\/g, "/");
  if (n === "" || n === ".") return ".";
  return n;
};

const buildNextRuntimeConfig = (repoRelativeDir: string): RuntimeConfig => ({
  workingDir: runtimeWorkingDirFromProjectRoot(repoRelativeDir),
  port: DEFAULT_SERVER_PORT,
  framework: "nextjs",
  command: [
    "node_modules/next/dist/bin/next",
    "start",
    "-p",
    String(DEFAULT_SERVER_PORT),
    "-H",
    "0.0.0.0"
  ]
});

const normalizeCommandEnv = (
  env: Record<string, string | undefined>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string")
  );

export const nodeBuildStrategy: BuildStrategy = {
  id: "node",
  detect: (repoDir, runtime) => runtime.exists(path.join(repoDir, "package.json")),
  async build(repoDir, ctx, runtime) {
    const pkg = await runtime.readJson<NodePackageJson>(
      path.join(repoDir, "package.json")
    );
    if (!pkg) {
      throw new Error("package.json is unreadable");
    }
    const deployherConfig = resolveExplicitConfig(pkg.deployher);
    if (deployherConfig.serveStrategy && deployherConfig.serveStrategy !== ctx.previewMode) {
      ctx.log(
        `Project Preview type (${ctx.previewMode}) overrides package.json#deployher.serveStrategy (${deployherConfig.serveStrategy}).`
      );
    }

    const useDefaultInstall =
      ctx.installCommandOverride == null || ctx.installCommandOverride.length === 0;
    const installRoot = useDefaultInstall
      ? await resolveNodeInstallRoot(ctx.workspaceDir, ctx.repoRootDir, runtime)
      : ctx.workspaceDir;
    if (useDefaultInstall && installRoot !== ctx.workspaceDir) {
      ctx.log(
        `Resolved dependency install directory to repository path ${path.relative(ctx.repoRootDir, installRoot).replace(/\\/g, "/") || "."} (monorepo lockfile or workspace layout).`
      );
    }

    const manager = await detectNodePackageManager(
      useDefaultInstall ? installRoot : ctx.workspaceDir,
      runtime
    );
    ctx.log(`Using ${manager.name} for install/build`);

    const installEnv = normalizeCommandEnv({
      ...process.env,
      ...ctx.env,
      CI: "1",
      ...(manager.extraEnv ?? {})
    });
    delete installEnv["NODE_ENV"];
    delete installEnv["npm_config_production"];
    delete installEnv["NPM_CONFIG_PRODUCTION"];
    const buildEnv = normalizeCommandEnv({
      ...process.env,
      ...ctx.env,
      CI: "1",
      NODE_ENV: "production"
    });

    const installArgv =
      ctx.installCommandOverride != null && ctx.installCommandOverride.length > 0
        ? ctx.installCommandOverride
        : manager.install;
    ctx.log(
      ctx.installCommandOverride != null && ctx.installCommandOverride.length > 0
        ? `Installing dependencies (custom: ${installArgv.join(" ")})`
        : `Installing dependencies (${manager.install.join(" ")})`
    );
    const installCwd = useDefaultInstall ? installRoot : ctx.workspaceDir;
    const installWorkdirRelative = useDefaultInstall
      ? installRoot === ctx.repoRootDir
        ? "."
        : path.relative(ctx.repoRootDir, installRoot).replace(/\\/g, "/") || "."
      : ctx.workspaceRelativeDir;

    const install = await runtime.runCommand(installArgv, {
      cwd: installCwd,
      env: installEnv,
      workdirRelative: installWorkdirRelative
    });
    if (install.code !== 0) {
      throw new Error(formatCommandFailure("Dependency install", install));
    }

    if (ctx.buildCommandOverride != null && ctx.buildCommandOverride.length > 0) {
      ctx.log(`Running build (custom: ${ctx.buildCommandOverride.join(" ")})`);
      const build = await runtime.runCommand(ctx.buildCommandOverride, {
        cwd: ctx.workspaceDir,
        env: buildEnv,
        workdirRelative: ctx.repoRelativeDir
      });
      if (build.code !== 0) {
        throw new Error(formatCommandFailure("Build", build));
      }
    } else if (pkg.scripts?.build) {
      ctx.log(`Running build (${manager.runBuild.join(" ")})`);
      const build = await runtime.runCommand(manager.runBuild, {
        cwd: ctx.workspaceDir,
        env: buildEnv,
        workdirRelative: ctx.repoRelativeDir
      });
      if (build.code !== 0) {
        throw new Error(formatCommandFailure("Build", build));
      }
    } else {
      ctx.log("No build script found; skipping build step");
    }

    const hintedStaticOutputDir =
      deployherConfig.staticOutputDir
        ? await validateStaticOutputDir(repoDir, deployherConfig.staticOutputDir, runtime.isDirectory)
        : null;
    if (hintedStaticOutputDir && !(await runtime.exists(path.join(hintedStaticOutputDir, "index.html")))) {
      throw new Error(
        `Configured static output directory does not contain a root index.html: ${deployherConfig.staticOutputDir}`
      );
    }

    const staticOutputDir = hintedStaticOutputDir ?? (
      await detectStaticOutputDir(repoDir, {
        exists: runtime.exists,
        isDirectory: runtime.isDirectory
      })
    );
    const nextAppSignals = Boolean(
      ctx.frameworkHint === "nextjs" ||
      hasDependency(pkg, "next") ||
      (await fileExists(repoDir, "next.config.js", runtime.exists)) ||
      (await fileExists(repoDir, "next.config.mjs", runtime.exists)) ||
      (await fileExists(repoDir, "next.config.ts", runtime.exists)) ||
      (await runtime.isDirectory(path.join(repoDir, "app"))) ||
      (await runtime.isDirectory(path.join(repoDir, "pages")))
    );
    const nextServerDetected =
      nextAppSignals && (await runtime.isDirectory(path.join(repoDir, ".next")));
    const explicitServerRuntime = deployherConfig.runtimeCommand?.length
      ? {
          workingDir: runtimeWorkingDirFromProjectRoot(ctx.repoRelativeDir),
          port: deployherConfig.runtimePort ?? DEFAULT_SERVER_PORT,
          command: deployherConfig.runtimeCommand,
          framework: "node" as const
        }
      : null;
    const inferServerFromNodeFrameworkHint =
      ctx.frameworkHint === "node" &&
      (ctx.previewMode === "server" || staticOutputDir == null);
    const serverRuntime = nextServerDetected
      ? buildNextRuntimeConfig(ctx.repoRelativeDir)
      : explicitServerRuntime ?? (
          deployherConfig.serveStrategy === "server" || inferServerFromNodeFrameworkHint
            ? {
                workingDir: runtimeWorkingDirFromProjectRoot(ctx.repoRelativeDir),
                port: deployherConfig.runtimePort ?? DEFAULT_SERVER_PORT,
                command: defaultRuntimeCommand(manager.name),
                framework: "node" as const
              }
            : null
        );
    const staticResolution = (detail: string): PreviewResolution => ({
      code: "static_index_html",
      detail
    });
    const serverResolution = (detail: string): PreviewResolution => ({
      code: nextServerDetected ? "next_dot_next" : "project_forced_server",
      detail
    });

    if (ctx.previewMode === "server") {
      if (!serverRuntime) {
        throw new Error(
          nextAppSignals
            ? "Project Preview type is set to Server, and this looks like a Next.js app, but the build did not produce `.next`. Check the project root directory, Next build output, and any monorepo layout; otherwise switch Preview type to Static or Auto-detect."
            : "Project Preview type is set to Server, but the build did not produce a supported server runtime. For Next.js, ensure `.next` exists after build; otherwise switch Preview type to Static or Auto-detect."
        );
      }
      return {
        buildStrategy: "node",
        serveStrategy: "server",
        runtimeConfig: serverRuntime,
        previewResolution: serverResolution("Project Preview type forced server output.")
      };
    }

    if (ctx.previewMode === "static") {
      if (!staticOutputDir) {
        throw new Error(
          "Project Preview type is set to Static, but the build output did not contain a deployable root index.html. Switch Preview type to Server or Auto-detect and redeploy."
        );
      }
      return {
        buildStrategy: "node",
        serveStrategy: "static",
        outputDir: path.resolve(repoDir, staticOutputDir),
        previewResolution: staticResolution("Project Preview type forced static output.")
      };
    }

    if (serverRuntime) {
      return {
        buildStrategy: "node",
        serveStrategy: "server",
        runtimeConfig: serverRuntime,
        previewResolution: serverResolution(
          nextServerDetected
            ? "Next.js server build detected from `.next` output."
            : "Server runtime inferred from Deployher runtime configuration."
        )
      };
    }

    if (staticOutputDir) {
      if (nextAppSignals) {
        throw new Error(
          "This repository looks like a Next.js app, but Deployher only found static output in the selected project root. Check the project root directory or set an explicit framework/runtime configuration before redeploying."
        );
      }
      return {
        buildStrategy: "node",
        serveStrategy: "static",
        outputDir: path.resolve(repoDir, staticOutputDir),
        previewResolution: staticResolution(
          `Static output detected with root index.html in ${path.relative(repoDir, path.resolve(repoDir, staticOutputDir)) || "."}.`
        )
      };
    }

    throw new Error(
      "Node build completed but could not be classified. No supported server runtime or deployable static root index.html was found. Set Preview type to Static or Server only if your build actually produces that output."
    );
  }
};
