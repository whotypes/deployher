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

export type EnvPatchOperation =
  | { type: "set"; key: string; value: string }
  | { type: "remove"; key: string }
  | { type: "append"; key: string; value: string; separator?: string };

export type EnvPatchDiff = {
  key: string;
  before?: string;
  after?: string;
  type: EnvPatchOperation["type"];
};

const envLineRe = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

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

export const applyEnvPatchToContent = (
  content: string,
  operations: EnvPatchOperation[],
): { content: string; diffs: EnvPatchDiff[] } => {
  const lines = content.split(/\r?\n/);
  const hasTrailingBlank = lines.length > 0 && lines[lines.length - 1] === "";
  const effectiveLines = hasTrailingBlank ? lines.slice(0, -1) : lines.slice();
  const diffs: EnvPatchDiff[] = [];

  for (const op of operations) {
    const idx = effectiveLines.findIndex((line) => line.startsWith(`${op.key}=`));
    const before = idx >= 0 ? stripQuotes(effectiveLines[idx]!.slice(op.key.length + 1).trim()) : undefined;

    if (op.type === "remove") {
      if (idx >= 0) {
        effectiveLines.splice(idx, 1);
        diffs.push({ key: op.key, before, after: undefined, type: op.type });
      }
      continue;
    }

    const nextValue =
      op.type === "append" && before
        ? `${before}${op.separator ?? ""}${op.value}`
        : op.value;

    if (idx >= 0) {
      effectiveLines[idx] = `${op.key}=${nextValue}`;
    } else {
      if (effectiveLines.length > 0 && effectiveLines[effectiveLines.length - 1] !== "") {
        effectiveLines.push("");
      }
      effectiveLines.push(`${op.key}=${nextValue}`);
    }

    if (before !== nextValue) {
      diffs.push({ key: op.key, before, after: nextValue, type: op.type });
    }
  }

  return { content: `${effectiveLines.join("\n")}\n`, diffs };
};

export const applyEnvPatchFile = async (
  envFilePath: string,
  operations: EnvPatchOperation[],
): Promise<EnvPatchDiff[]> => {
  let content = "";
  try {
    content = await fs.readFile(envFilePath, "utf8");
  } catch {
    content = "";
  }
  const patched = applyEnvPatchToContent(content, operations);
  await fs.writeFile(envFilePath, patched.content, "utf8");
  return patched.diffs;
};

export const parseEnvKeys = (content: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(envLineRe);
    if (!m) continue;
    out[m[1]!] = stripQuotes(m[2]!.trim());
  }
  return out;
};
