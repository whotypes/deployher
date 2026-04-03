import { describe, expect, test } from "bun:test";
import { looksLikeEnvPaste, parseEnvFileContent } from "./parseEnvFileContent";

describe("parseEnvFileContent", () => {
  test("parses basic and export lines", () => {
    expect(
      parseEnvFileContent("FOO=bar\nexport BAZ=qux\n# c\n\n")
    ).toEqual({ FOO: "bar", BAZ: "qux" });
  });

  test("quoted double", () => {
    expect(parseEnvFileContent('X="a\\nb"')).toEqual({ X: "a\nb" });
  });
});

describe("looksLikeEnvPaste", () => {
  test("detects multiline env", () => {
    expect(looksLikeEnvPaste("A=1\nB=2")).toBe(true);
  });

  test("detects single pair", () => {
    expect(looksLikeEnvPaste("SECRET_KEY=abc")).toBe(true);
  });

  test("rejects random text", () => {
    expect(looksLikeEnvPaste("hello world")).toBe(false);
  });
});
