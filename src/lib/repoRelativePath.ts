export const normalizeRepoRelativePathString = (value: string): string | null => {
  const raw = value.trim() || ".";
  if (raw.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("\\\\")) {
    return null;
  }
  const segments: string[] = [];
  for (const part of raw.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    segments.push(part);
  }
  return segments.length === 0 ? "." : segments.join("/");
};

export const isAncestorOrEqualPath = (ancestor: string, descendant: string): boolean => {
  const a = ancestor === "." ? [] : ancestor.split("/");
  const d = descendant === "." ? [] : descendant.split("/");
  if (d.length < a.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== d[i]) return false;
  }
  return true;
};

export const parseRuntimePortInput = (value: string): { ok: true; port: number } | { ok: false } => {
  const trimmed = value.trim();
  if (!trimmed) return { ok: false };
  const port = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) return { ok: false };
  if (String(port) !== trimmed) return { ok: false };
  return { ok: true, port };
};
