import path from "path";
import { STATIC_SITE_INDEX_HTML_RELATIVE_PATHS } from "../../../lib/staticSiteEntrypoints";
import type { BuildRuntime, BuildStrategy } from "../types";

const STATIC_ENTRYPOINTS = STATIC_SITE_INDEX_HTML_RELATIVE_PATHS.map((entry) => {
  const outputDir =
    entry === "index.html" ? "." : entry.replace(/\/index\.html$/, "");
  return { entry, outputDir } as const;
});

const detectStaticOutputDir = async (
  repoDir: string,
  runtime: Pick<BuildRuntime, "exists">
): Promise<string | null> => {
  for (const candidate of STATIC_ENTRYPOINTS) {
    if (await runtime.exists(path.join(repoDir, candidate.entry))) {
      return candidate.outputDir;
    }
  }
  return null;
};

export const staticBuildStrategy: BuildStrategy = {
  id: "static",
  async detect(repoDir, runtime) {
    return (await detectStaticOutputDir(repoDir, runtime)) !== null;
  },
  async build(repoDir, ctx, runtime) {
    if (ctx.installCommandOverride?.length || ctx.buildCommandOverride?.length) {
      ctx.log(
        "Custom install/build commands in project settings apply to Node.js builds only."
      );
    }
    const outputDir = await detectStaticOutputDir(repoDir, runtime);
    if (!outputDir) {
      throw new Error(
        "Static site entrypoint not found. Expected one of: index.html, public/index.html, dist/index.html, build/index.html"
      );
    }
    if (ctx.previewMode === "server") {
      throw new Error(
        "Project Preview type is set to Server, but this build only produced static output. Switch Preview type to Static or Auto-detect and redeploy."
      );
    }

    const resolvedOutputDir = path.resolve(repoDir, outputDir);
    ctx.log(`Detected static site output at ${outputDir === "." ? "." : outputDir}`);

    return {
      buildStrategy: "static",
      serveStrategy: "static",
      outputDir: resolvedOutputDir,
      previewResolution: {
        code: "project_forced_static",
        detail:
          ctx.previewMode === "static"
            ? "Project Preview type forced static output."
            : "Static site entrypoint with root index.html detected."
      }
    };
  }
};
