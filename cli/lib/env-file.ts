import fs from "node:fs/promises";

export type NexusEnv = {
  registry: string;
  user: string;
  password: string;
};

const stripQuotes = (v: string): string => v.replace(/^["']|["']$/g, "");

export const readEnvValue = (content: string, key: string): string | undefined => {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = content.match(re);
  if (!m?.[1]) return undefined;
  return stripQuotes(m[1]!.trim());
};

export const readNexusEnvFromFile = async (
  backendEnvFile: string,
): Promise<NexusEnv | null> => {
  let raw: string;
  try {
    raw = await fs.readFile(backendEnvFile, "utf8");
  } catch {
    return null;
  }
  const registry = readEnvValue(raw, "NEXUS_REGISTRY");
  const user = readEnvValue(raw, "NEXUS_USER");
  const password = readEnvValue(raw, "NEXUS_PASSWORD");
  if (!registry || !user || !password) return null;
  return { registry, user, password };
};
