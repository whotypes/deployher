import "../env/bootstrap";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..", "..");

export const clientOutDir = path.join(root, "dist", "client");

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

export const buildClient = async (
  options: BuildClientOptions = {}
): Promise<{ success: boolean; skipped: boolean }> => {
  if (shouldSkipClientBuild(Boolean(options.force))) {
    return { success: true, skipped: true };
  }

  try {
    const { build: viteBuild } = await import("vite");
    await viteBuild({
      configFile: path.join(root, "vite.config.ts"),
      root
    });
    return { success: true, skipped: false };
  } catch (e) {
    console.error("Vite client build failed:", e);
    return { success: false, skipped: false };
  }
};
