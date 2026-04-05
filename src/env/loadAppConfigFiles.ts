import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

const flattenTomlValues = (
  obj: Record<string, unknown>,
  prefix = "",
  out: Record<string, string> = {}
): Record<string, string> => {
  for (const [k, v] of Object.entries(obj)) {
    const segment = prefix ? `${prefix}_${k}` : k;
    if (isPlainObject(v)) {
      flattenTomlValues(v, segment, out);
    } else if (v === undefined || v === null) {
      continue;
    } else if (typeof v === "boolean") {
      out[segment.toUpperCase()] = v ? "1" : "0";
    } else {
      out[segment.toUpperCase()] = String(v);
    }
  }
  return out;
};

const readTomlFileSync = (filePath: string): Record<string, unknown> => {
  if (!existsSync(filePath)) return {};
  const text = readFileSync(filePath, "utf8").trim();
  if (!text) return {};
  return Bun.TOML.parse(text) as Record<string, unknown>;
};

export const loadTomlAppConfigSync = (repoRoot: string): Record<string, string> => {
  const defaultPath = path.join(repoRoot, "config", "default.toml");
  const localPath = path.join(repoRoot, "config", "local.toml");
  const merged = { ...readTomlFileSync(defaultPath), ...readTomlFileSync(localPath) };
  return flattenTomlValues(merged);
};

export type LoadAppConfigFilesResult = {
  repoRoot: string;
  fromToml: Record<string, string>;
};

export const loadAppConfigFiles = async (repoRoot: string): Promise<LoadAppConfigFilesResult> => {
  const fromToml = loadTomlAppConfigSync(repoRoot);
  return { repoRoot, fromToml };
};
