import path from "path";
import { detectPythonPackageManager } from "../packageManagers/python";
import type { BuildStrategy } from "../types";

type PyprojectToml = {
  tool?: {
    pdploy?: {
      buildCommand?: unknown;
      outputDir?: unknown;
    };
  };
};

const resolveBuildConfigFromPyproject = (
  pyproject: PyprojectToml | null
): { buildCommand: string[]; outputDir: string } | null => {
  const rawBuildCommand = pyproject?.tool?.pdploy?.buildCommand;
  const rawOutputDir = pyproject?.tool?.pdploy?.outputDir;

  if (!Array.isArray(rawBuildCommand) || rawBuildCommand.length === 0) {
    return null;
  }

  if (!rawBuildCommand.every((item) => typeof item === "string" && item.trim().length > 0)) {
    throw new Error("[tool.pdploy].buildCommand in pyproject.toml must be a non-empty string array");
  }

  if (typeof rawOutputDir !== "string" || rawOutputDir.trim().length === 0) {
    throw new Error("[tool.pdploy].outputDir in pyproject.toml must be a non-empty string");
  }

  return {
    buildCommand: rawBuildCommand.map((item) => item.trim()),
    outputDir: rawOutputDir.trim()
  };
};

export const pythonBuildStrategy: BuildStrategy = {
  id: "python",
  async detect(repoDir, runtime) {
    return (await runtime.exists(path.join(repoDir, "pyproject.toml"))) ||
      (await runtime.exists(path.join(repoDir, "requirements.txt")));
  },
  async build(repoDir, ctx, runtime) {
    const manager = await detectPythonPackageManager(repoDir, runtime);
    ctx.log(`Using ${manager.name} for Python dependency install`);

    const env = {
      ...process.env,
      CI: "1",
      PYTHONUNBUFFERED: "1"
    };

    ctx.log(`Installing dependencies (${manager.install.join(" ")})`);
    const install = await runtime.runCommand(manager.install, { cwd: repoDir, env });
    if (install.stdout) ctx.logs.push(install.stdout.trim());
    if (install.stderr) ctx.logs.push(install.stderr.trim());
    if (install.code !== 0) {
      throw new Error(`Dependency install failed: ${install.stderr || install.stdout}`);
    }

    let buildCommand: string[] | null = null;
    let outputDir: string | null = null;

    if (await runtime.exists(path.join(repoDir, "mkdocs.yml"))) {
      buildCommand = ["python", "-m", "mkdocs", "build", "--clean"];
      outputDir = "site";
      ctx.log("Detected mkdocs.yml; using default MkDocs build settings");
    } else {
      const pyproject = await runtime.readToml<PyprojectToml>(path.join(repoDir, "pyproject.toml"));
      const config = resolveBuildConfigFromPyproject(pyproject);
      if (config) {
        buildCommand = config.buildCommand;
        outputDir = config.outputDir;
        ctx.log("Using [tool.pdploy] buildCommand/outputDir from pyproject.toml");
      }
    }

    if (!buildCommand || !outputDir) {
      throw new Error(
        "Python project build config not found. Add mkdocs.yml or configure [tool.pdploy].buildCommand and [tool.pdploy].outputDir in pyproject.toml"
      );
    }

    ctx.log(`Running build (${buildCommand.join(" ")})`);
    const build = await runtime.runCommand(buildCommand, { cwd: repoDir, env });
    if (build.stdout) ctx.logs.push(build.stdout.trim());
    if (build.stderr) ctx.logs.push(build.stderr.trim());
    if (build.code !== 0) {
      throw new Error(`Build failed: ${build.stderr || build.stdout}`);
    }

    const resolvedOutputDir = path.resolve(repoDir, outputDir);
    const repoRoot = path.resolve(repoDir);
    if (resolvedOutputDir !== repoRoot && !resolvedOutputDir.startsWith(`${repoRoot}${path.sep}`)) {
      throw new Error("[tool.pdploy].outputDir must stay within the repository root");
    }
    if (!(await runtime.isDirectory(resolvedOutputDir))) {
      throw new Error(`Build output directory not found: ${outputDir}`);
    }

    return {
      buildStrategy: "python",
      serveStrategy: "static",
      outputDir: resolvedOutputDir
    };
  }
};
