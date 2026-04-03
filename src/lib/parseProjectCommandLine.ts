export const MAX_PROJECT_COMMAND_LINE_LENGTH = 4096;

export type ParseProjectCommandLineResult =
  | { ok: true; argv: string[] | null }
  | { ok: false; error: string };

const pushToken = (out: string[], raw: string): void => {
  const t = raw.trim();
  if (t.length > 0) out.push(t);
};

/**
 * Parse a single-line install/build command into argv for Docker Cmd (no shell).
 * Double quotes merge words; backslash escapes inside quotes. Empty / whitespace → null (use defaults).
 */
export const parseProjectCommandLine = (input: string): ParseProjectCommandLineResult => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { ok: true, argv: null };
  }
  if (trimmed.length > MAX_PROJECT_COMMAND_LINE_LENGTH) {
    return {
      ok: false,
      error: `command must be at most ${MAX_PROJECT_COMMAND_LINE_LENGTH} characters`
    };
  }

  const argv: string[] = [];
  let i = 0;
  let current = "";
  let inQuote = false;

  const flushWord = (): void => {
    if (current.length > 0) {
      pushToken(argv, current);
      current = "";
    }
  };

  while (i < trimmed.length) {
    const c = trimmed[i]!;
    if (inQuote) {
      if (c === "\\" && i + 1 < trimmed.length) {
        const next = trimmed[i + 1]!;
        if (next === '"' || next === "\\") {
          current += next;
          i += 2;
          continue;
        }
        current += c;
        i += 1;
        continue;
      }
      if (c === '"') {
        inQuote = false;
        i += 1;
        continue;
      }
      current += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      flushWord();
      inQuote = true;
      i += 1;
      continue;
    }
    if (/\s/.test(c)) {
      flushWord();
      i += 1;
      continue;
    }
    current += c;
    i += 1;
  }

  if (inQuote) {
    return { ok: false, error: "unterminated double quote in command" };
  }
  flushWord();

  if (argv.length === 0) {
    return { ok: false, error: "command has no non-empty tokens" };
  }

  return { ok: true, argv };
};

export const formatStoredProjectCommand = (argv: string[] | null): string | null => {
  if (argv == null || argv.length === 0) return null;
  return argv
    .map((part) => {
      if (part.length === 0) return '""';
      if (/[\s"\\]/.test(part)) {
        const escaped = part.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return `"${escaped}"`;
      }
      return part;
    })
    .join(" ");
};

export const parseStoredProjectCommandForBuild = (
  raw: string | null | undefined
): { argv: string[] | null; warning?: string } => {
  if (raw == null || raw.trim() === "") return { argv: null };
  const parsed = parseProjectCommandLine(raw);
  if (!parsed.ok) {
    return { argv: null, warning: parsed.error };
  }
  return { argv: parsed.argv };
};

export const parseProjectCommandForStorage = (
  value: unknown,
  fieldLabel: string
): { ok: true; stored: string | null } | { ok: false; error: string } => {
  if (value === null || (typeof value === "string" && value.trim() === "")) {
    return { ok: true, stored: null };
  }
  if (typeof value !== "string") {
    return { ok: false, error: `${fieldLabel} must be a string or null` };
  }
  const parsed = parseProjectCommandLine(value);
  if (!parsed.ok) {
    return { ok: false, error: `${fieldLabel}: ${parsed.error}` };
  }
  if (parsed.argv === null) {
    return { ok: true, stored: null };
  }
  return { ok: true, stored: formatStoredProjectCommand(parsed.argv) ?? null };
};
