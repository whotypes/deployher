import path from "path";

const root = path.resolve(import.meta.dir, "..", "..");

export const clientOutDir = path.join(root, "dist", "client");
const clientEntrypoints = [
  path.join(root, "src", "ui", "client", "layout.ts"),
  path.join(root, "src", "ui", "client", "projects-page.ts"),
  path.join(root, "src", "ui", "client", "deployment-detail-page.ts"),
  path.join(root, "src", "ui", "client", "project-detail-page.ts")
];

const appCssPath = path.join(root, "src", "ui", "client", "app.css");

type BuildClientOptions = {
  force?: boolean;
};

const parseBoolean = (value: string | undefined): boolean => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const shouldSkipClientBuild = (force: boolean): boolean => {
  if (force) return false;
  return parseBoolean(Bun.env.SKIP_CLIENT_BUILD);
};

export const buildClient = async (
  options: BuildClientOptions = {}
): Promise<{ success: boolean; skipped: boolean }> => {
  if (shouldSkipClientBuild(Boolean(options.force))) {
    return { success: true, skipped: true };
  }

  const result = await Bun.build({
    entrypoints: clientEntrypoints,
    outdir: clientOutDir,
    naming: "[name].[ext]",
    target: "browser"
  });
  if (!result.success) {
    console.error("Client build failed:", result.logs);
  }
  const cssFile = Bun.file(appCssPath);
  if (await cssFile.exists()) {
    await Bun.write(path.join(clientOutDir, "app.css"), cssFile);
  }
  return { success: result.success, skipped: false };
};
