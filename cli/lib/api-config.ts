import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { getDeployherConfigDir } from "./deployher-config-dir";

export type ManagedCliConfig = {
  version: 1;
  apiBaseUrl: string;
  accessToken: string;
};

const CONFIG_VERSION = 1 as const;
const CONFIG_FILE = "config.json";

export const defaultConfigPath = () => path.join(getDeployherConfigDir(), CONFIG_FILE);

const normalizeBaseUrl = (raw: string): string => {
  const url = new URL(raw.trim());
  return url.origin.replace(/\/+$/, "");
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseManagedCliConfig = (rawJson: string): ManagedCliConfig | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson) as unknown;
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  if (parsed.version !== CONFIG_VERSION) return null;
  if (typeof parsed.apiBaseUrl !== "string" || !parsed.apiBaseUrl.trim()) return null;
  if (typeof parsed.accessToken !== "string" || !parsed.accessToken.trim()) return null;
  try {
    const apiBaseUrl = normalizeBaseUrl(parsed.apiBaseUrl);
    return { version: CONFIG_VERSION, apiBaseUrl, accessToken: parsed.accessToken.trim() };
  } catch {
    return null;
  }
};

export const readManagedCliConfig = async (
  filePath?: string
): Promise<{ path: string; config: ManagedCliConfig } | null> => {
  const resolved = filePath ?? defaultConfigPath();
  try {
    const text = await readFile(resolved, "utf8");
    const config = parseManagedCliConfig(text);
    if (!config) return null;
    return { path: resolved, config };
  } catch {
    return null;
  }
};

export const writeManagedCliConfig = async (
  config: ManagedCliConfig,
  filePath?: string
): Promise<string> => {
  const resolved = filePath ?? defaultConfigPath();
  const dir = path.dirname(resolved);
  await mkdir(dir, { recursive: true });
  await writeFile(resolved, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return resolved;
};

export const deleteManagedCliConfig = async (filePath?: string): Promise<boolean> => {
  const resolved = filePath ?? defaultConfigPath();
  try {
    await unlink(resolved);
    return true;
  } catch {
    return false;
  }
};
