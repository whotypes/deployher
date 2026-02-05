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

export const buildClient = async (): Promise<{ success: boolean }> => {
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
  return { success: result.success };
};
