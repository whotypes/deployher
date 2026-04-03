import { describe, expect, test } from "bun:test";
import {
  formatStoredProjectCommand,
  MAX_PROJECT_COMMAND_LINE_LENGTH,
  parseProjectCommandLine,
  parseProjectCommandForStorage
} from "./parseProjectCommandLine";

describe("parseProjectCommandLine", () => {
  test("empty and whitespace → null argv", () => {
    expect(parseProjectCommandLine("")).toEqual({ ok: true, argv: null });
    expect(parseProjectCommandLine("  \t  ")).toEqual({ ok: true, argv: null });
  });

  test("simple tokens", () => {
    expect(parseProjectCommandLine("npm ci --legacy-peer-deps")).toEqual({
      ok: true,
      argv: ["npm", "ci", "--legacy-peer-deps"]
    });
  });

  test("quoted segment with spaces", () => {
    expect(parseProjectCommandLine('npm run "build prod"')).toEqual({
      ok: true,
      argv: ["npm", "run", "build prod"]
    });
  });

  test("escaped backslash inside quotes", () => {
    expect(parseProjectCommandLine('"a\\\\b"')).toEqual({
      ok: true,
      argv: ["a\\b"]
    });
  });

  test("unterminated quote", () => {
    const r = parseProjectCommandLine('npm ci "fix');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("unterminated");
  });

  test("only quotes / whitespace tokens → error", () => {
    const r = parseProjectCommandLine('""');
    expect(r.ok).toBe(false);
  });

  test("too long", () => {
    const r = parseProjectCommandLine("a".repeat(MAX_PROJECT_COMMAND_LINE_LENGTH + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("at most");
  });
});

describe("parseProjectCommandForStorage", () => {
  test("null empty string and whitespace → stored null", () => {
    expect(parseProjectCommandForStorage(null, "x")).toEqual({ ok: true, stored: null });
    expect(parseProjectCommandForStorage("", "x")).toEqual({ ok: true, stored: null });
    expect(parseProjectCommandForStorage("   ", "x")).toEqual({ ok: true, stored: null });
  });

  test("invalid type", () => {
    const r = parseProjectCommandForStorage(1, "installCommand");
    expect(r.ok).toBe(false);
  });

  test("normalized storage", () => {
    const r = parseProjectCommandForStorage("  npm   ci  ", "installCommand");
    expect(r).toEqual({ ok: true, stored: "npm ci" });
  });
});

describe("formatStoredProjectCommand", () => {
  test("round-trip with space in arg", () => {
    const argv = ["npm", "run", "build prod"];
    const line = formatStoredProjectCommand(argv);
    expect(line).toBe('npm run "build prod"');
    expect(parseProjectCommandLine(line!)).toEqual({ ok: true, argv });
  });
});
