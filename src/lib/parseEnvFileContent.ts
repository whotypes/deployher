const KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const parseEnvFileContent = (content: string): Record<string, string> => {
  const normalized = content.replace(/\r\n?/g, "\n");
  const parsed: Record<string, string> = {};
  const lines = normalized.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const withoutExport = trimmed.startsWith("export ")
      ? trimmed.slice("export ".length).trim()
      : trimmed;
    const separatorIndex = withoutExport.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!KEY_REGEX.test(key)) continue;

    let value = withoutExport.slice(separatorIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, "\\");
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
};

const lineLooksLikeEnvAssignment = (line: string): boolean => {
  const t = line.trim();
  if (!t || t.startsWith("#")) return false;
  const body = t.startsWith("export ") ? t.slice("export ".length).trim() : t;
  const i = body.indexOf("=");
  if (i <= 0) return false;
  const key = body.slice(0, i).trim();
  return KEY_REGEX.test(key);
};

export const looksLikeEnvPaste = (text: string): boolean => {
  const t = text.trim();
  if (!t || t.length < 3) return false;
  const lines = t.split("\n");
  const meaningful = lines.filter((l) => l.trim() && !l.trim().startsWith("#"));
  if (meaningful.length === 0) return false;
  if (meaningful.length >= 2) {
    const hits = meaningful.filter(lineLooksLikeEnvAssignment);
    return hits.length >= 2;
  }
  return lineLooksLikeEnvAssignment(meaningful[0] ?? "");
};
