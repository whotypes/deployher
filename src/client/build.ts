import "../env/bootstrap";
import path from "path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const root = path.resolve(import.meta.dir, "..", "..");

export const clientOutDir = path.join(root, "dist", "client");
const clientEntrypoints = [
  path.join(root, "src", "ui", "client", "sidebar-hydrate.tsx"),
  path.join(root, "src", "ui", "client", "layout.ts"),
  path.join(root, "src", "ui", "client", "project-switcher-mount.tsx"),
  path.join(root, "src", "ui", "client", "layout-prefs-menu.tsx"),
  path.join(root, "src", "ui", "client", "new-project-page.tsx"),
  path.join(root, "src", "ui", "client", "deployment-detail-page.tsx"),
  path.join(root, "src", "ui", "client", "project-detail-page.tsx"),
  path.join(root, "src", "ui", "client", "project-settings-page.tsx"),
  path.join(root, "src", "ui", "client", "account-page.tsx"),
  path.join(root, "src", "ui", "client", "admin-examples-page.tsx"),
  path.join(root, "src", "ui", "client", "health-page.tsx"),
  path.join(root, "src", "ui", "client", "project-observability-page.tsx"),
  path.join(root, "src", "ui", "client", "dashboard-page.tsx"),
  path.join(root, "src", "ui", "client", "landing-page.tsx")
];

const appCssPath = path.join(root, "src", "ui", "client", "globals.css");

type BuildClientOptions = {
  force?: boolean;
};

const parseBoolean = (value: string | undefined): boolean => {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const shouldSkipClientBuild = (force: boolean): boolean => {
  if (force) return false;
  return parseBoolean(process.env.SKIP_CLIENT_BUILD ?? Bun.env.SKIP_CLIENT_BUILD);
};

const compileCss = async (): Promise<void> => {
  const cssFile = Bun.file(appCssPath);
  if (!(await cssFile.exists())) return;
  const css = await cssFile.text();
  const result = await postcss([tailwindcss]).process(css, {
    from: appCssPath,
    to: path.join(clientOutDir, "app.css")
  });
  await Bun.write(path.join(clientOutDir, "app.css"), result.css);
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
  await compileCss();
  return { success: result.success, skipped: false };
};
