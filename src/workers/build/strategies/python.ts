import path from "path";
import { detectPythonPackageManager, resolvePythonCommand } from "../packageManagers/python";
import type { BuildStrategy } from "../types";

type PyprojectToml = {
  tool?: {
    deployher?: {
      buildCommand?: unknown;
      outputDir?: unknown;
    };
  };
};

const formatCommandFailure = (
  stage: string,
  result: { code: number; stdout: string; stderr: string }
): string => {
  const suffix = result.code === 137 ? " (exit 137 often indicates container OOM kill)" : "";
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();
  const sections = [`${stage} failed (exit code ${result.code})${suffix}`];

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

const resolveBuildConfigFromPyproject = (
  pyproject: PyprojectToml | null
): { buildCommand: string[]; outputDir: string } | null => {
  const section = pyproject?.tool?.deployher;
  const rawBuildCommand = section?.buildCommand;
  const rawOutputDir = section?.outputDir;

  if (!Array.isArray(rawBuildCommand) || rawBuildCommand.length === 0) {
    return null;
  }

  if (!rawBuildCommand.every((item) => typeof item === "string" && item.trim().length > 0)) {
    throw new Error("[tool.deployher].buildCommand in pyproject.toml must be a non-empty string array");
  }

  if (typeof rawOutputDir !== "string" || rawOutputDir.trim().length === 0) {
    throw new Error("[tool.deployher].outputDir in pyproject.toml must be a non-empty string");
  }

  return {
    buildCommand: rawBuildCommand.map((item) => item.trim()),
    outputDir: rawOutputDir.trim()
  };
};

export const pythonBuildStrategy: BuildStrategy = {
  id: "python",
  async detect(repoDir, runtime) {
    const hasPyproject = await runtime.exists(path.join(repoDir, "pyproject.toml"));
    const hasRequirements = await runtime.exists(path.join(repoDir, "requirements.txt"));
    if (!hasPyproject && !hasRequirements) {
      return false;
    }

    const hasMkdocs = await runtime.exists(path.join(repoDir, "mkdocs.yml"));
    const hasDockerfile = await runtime.exists(path.join(repoDir, "Dockerfile"));
    if (hasRequirements && hasDockerfile && !hasPyproject && !hasMkdocs) {
      return false;
    }

    return true;
  },
  async build(repoDir, ctx, runtime) {
    if (ctx.installCommandOverride?.length || ctx.buildCommandOverride?.length) {
      ctx.log(
        "Custom install/build commands in project settings apply to Node.js builds only."
      );
    }
    const pythonCommand = resolvePythonCommand(runtime);
    ctx.log(`Using Python executable: ${pythonCommand}`);

    const manager = await detectPythonPackageManager(repoDir, runtime, pythonCommand);
    ctx.log(`Using ${manager.name} for Python dependency install`);

    const env: Record<string, string> = {
      ...process.env,
      ...ctx.env,
      CI: "1",
      PYTHONUNBUFFERED: "1"
    };

    let buildPythonCommand = pythonCommand;
    let installCommand = manager.install;
    let commandEnv: Record<string, string> = env;
    let venvDirRelative: string | null = null;

    if (manager.name === "pip") {
      venvDirRelative = `.deployher-venv-${ctx.deploymentId}`;
      const venvBinDirRelative = path.posix.join(venvDirRelative, "bin");
      const venvPythonRelative = path.posix.join(venvBinDirRelative, "python");
      const venvPython =
        runtime.containerRepoDir != null
          ? `${runtime.containerRepoDir}/${venvDirRelative}/bin/python`
          : venvPythonRelative;

      if (await runtime.exists(path.join(repoDir, venvDirRelative))) {
        await runtime.runCommand(["rm", "-rf", venvDirRelative], {
          cwd: repoDir,
          env,
          workdirRelative: ctx.repoRelativeDir
        });
      }

      ctx.log(`Creating virtual environment (${pythonCommand} -m venv ${venvDirRelative})`);
      const venvCreate = await runtime.runCommand([pythonCommand, "-m", "venv", venvDirRelative], {
        cwd: repoDir,
        env,
        workdirRelative: ctx.repoRelativeDir
      });
      if (venvCreate.code !== 0) {
        throw new Error(formatCommandFailure("Virtualenv creation", venvCreate));
      }

      buildPythonCommand = venvPython;
      installCommand = [
        venvPython,
        "-m",
        "pip",
        "install",
        "--no-cache-dir",
        "-r",
        "requirements.txt"
      ];
      commandEnv = {
        ...env,
        // Keep these relative to cwd so they work in both host and container runtimes.
        VIRTUAL_ENV: venvDirRelative,
        PATH: `${venvBinDirRelative}${path.delimiter}${env.PATH ?? ""}`
      };
      ctx.log(`Using virtual environment: ${venvDirRelative}`);
    }

    ctx.log(`Installing dependencies (${installCommand.join(" ")})`);
    const install = await runtime.runCommand(installCommand, {
      cwd: repoDir,
      env: commandEnv,
      workdirRelative: ctx.repoRelativeDir
    });
    if (install.code !== 0) {
      throw new Error(formatCommandFailure("Dependency install", install));
    }

    let buildCommand: string[] | null = null;
    let outputDir: string | null = null;

    if (await runtime.exists(path.join(repoDir, "mkdocs.yml"))) {
      buildCommand = [buildPythonCommand, "-m", "mkdocs", "build", "--clean"];
      outputDir = "site";
      ctx.log("Detected mkdocs.yml; using default MkDocs build settings");
    } else {
      const pyproject = await runtime.readToml<PyprojectToml>(path.join(repoDir, "pyproject.toml"));
      const config = resolveBuildConfigFromPyproject(pyproject);
      if (config) {
        const rawCmd = config.buildCommand;
        buildCommand =
          rawCmd[0] === "python" || rawCmd[0] === "python3"
            ? [buildPythonCommand, ...rawCmd.slice(1)]
            : rawCmd;
        outputDir = config.outputDir;
        ctx.log("Using [tool.deployher] buildCommand/outputDir from pyproject.toml");
      }
    }

    if (!buildCommand || !outputDir) {
      throw new Error(
        "Python project build config not found. Add mkdocs.yml or configure [tool.deployher].buildCommand and [tool.deployher].outputDir in pyproject.toml"
      );
    }

    ctx.log(`Running build (${buildCommand.join(" ")})`);
    const build = await runtime.runCommand(buildCommand, {
      cwd: repoDir,
      env: commandEnv,
      workdirRelative: ctx.repoRelativeDir
    });
    if (build.code !== 0) {
      throw new Error(formatCommandFailure("Build", build));
    }

    const resolvedOutputDir = path.resolve(repoDir, outputDir);
    const repoRoot = path.resolve(repoDir);
    if (resolvedOutputDir !== repoRoot && !resolvedOutputDir.startsWith(`${repoRoot}${path.sep}`)) {
      throw new Error("[tool.deployher].outputDir must stay within the repository root");
    }
    if (!(await runtime.isDirectory(resolvedOutputDir))) {
      throw new Error(`Build output directory not found: ${outputDir}`);
    }
    if (!(await runtime.exists(path.join(resolvedOutputDir, "index.html")))) {
      throw new Error(
        `Build output directory does not contain a root index.html: ${outputDir}`
      );
    }
    if (ctx.previewMode === "server") {
      throw new Error(
        "Project Preview type is set to Server, but this Python build produced static output only. Switch Preview type to Static or Auto-detect and redeploy."
      );
    }

    if (venvDirRelative != null) {
      await runtime.runCommand(["rm", "-rf", venvDirRelative], {
        cwd: repoDir,
        env,
        workdirRelative: ctx.repoRelativeDir
      });
    }

    return {
      buildStrategy: "python",
      serveStrategy: "static",
      outputDir: resolvedOutputDir,
      previewResolution: {
        code: "python_static_output",
        detail:
          ctx.previewMode === "static"
            ? "Project Preview type forced static output."
            : "Python build produced static output with a root index.html."
      }
    };
  }
};
