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

export const upsertEnvValue = async (
  envFilePath: string,
  key: string,
  value: string,
): Promise<void> => {
  let content = "";
  try {
    content = await fs.readFile(envFilePath, "utf8");
  } catch {
    await fs.writeFile(envFilePath, `${key}=${value}\n`, "utf8");
    return;
  }

  const lines = content.split(/\r?\n/);
  let updated = false;
  const out = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      updated = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!updated) {
    if (out.length > 0 && out[out.length - 1] !== "") out.push("");
    out.push(`${key}=${value}`);
  }

  await fs.writeFile(envFilePath, `${out.join("\n")}\n`, "utf8");
};
