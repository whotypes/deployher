import path from "path";
import { detectNodePackageManager } from "../packageManagers/node";
import type { BuildStrategy } from "../types";

const BUILD_OUTPUT_DIRS = ["dist", "build", "out", ".next", "public"];

const detectOutputDir = async (
  repoDir: string,
  isDirectory: (filePath: string) => Promise<boolean>
): Promise<string | null> => {
  for (const candidate of BUILD_OUTPUT_DIRS) {
    const full = path.join(repoDir, candidate);
    if (await isDirectory(full)) return full;
  }
  return null;
};

export const nodeBuildStrategy: BuildStrategy = {
  id: "node",
  detect: (repoDir, runtime) => runtime.exists(path.join(repoDir, "package.json")),
  async build(repoDir, ctx, runtime) {
    const pkg = await runtime.readJson<{ scripts?: Record<string, string> }>(
      path.join(repoDir, "package.json")
    );
    if (!pkg) {
      throw new Error("package.json is unreadable");
    }

    const manager = await detectNodePackageManager(repoDir, runtime);
    ctx.log(`Using ${manager.name} for install/build`);

    const installEnv = {
      ...process.env,
      ...ctx.env,
      CI: "1",
      ...(manager.extraEnv ?? {})
    };
    delete installEnv.NODE_ENV;
    delete installEnv.npm_config_production;
    delete installEnv.NPM_CONFIG_PRODUCTION;
    const buildEnv = {
      ...process.env,
      ...ctx.env,
      CI: "1",
      NODE_ENV: "production"
    };

    ctx.log(`Installing dependencies (${manager.install.join(" ")})`);
    const install = await runtime.runCommand(manager.install, { cwd: repoDir, env: installEnv });
    if (install.stdout) ctx.logs.push(install.stdout.trim());
    if (install.stderr) ctx.logs.push(install.stderr.trim());
    if (install.code !== 0) {
      throw new Error(`Install failed: ${install.stderr || install.stdout}`);
    }

    if (pkg.scripts?.build) {
      ctx.log(`Running build (${manager.runBuild.join(" ")})`);
      const build = await runtime.runCommand(manager.runBuild, { cwd: repoDir, env: buildEnv });
      if (build.stdout) ctx.logs.push(build.stdout.trim());
      if (build.stderr) ctx.logs.push(build.stderr.trim());
      if (build.code !== 0) {
        throw new Error(`Build failed: ${build.stderr || build.stdout}`);
      }
    } else {
      ctx.log("No build script found; skipping build step");
    }

    const outputDir = await detectOutputDir(repoDir, runtime.isDirectory);
    if (!outputDir) {
      throw new Error(`No build output found. Looked for: ${BUILD_OUTPUT_DIRS.join(", ")}`);
    }

    return {
      buildStrategy: "node",
      serveStrategy: "static",
      outputDir
    };
  }
};
