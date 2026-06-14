import { describe, expect, test } from "bun:test";
import { applyEnvPatchToContent, parseEnvKeys, readEnvValue, readNexusEnvFromFile } from "./env-file";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("readEnvValue", () => {
  test("parses unquoted value", () => {
    expect(readEnvValue("FOO=bar\n", "FOO")).toBe("bar");
  });

  test("strips double quotes", () => {
    expect(readEnvValue('FOO="baz"\n', "FOO")).toBe("baz");
  });

  test("returns undefined when missing", () => {
    expect(readEnvValue("OTHER=1\n", "FOO")).toBeUndefined();
  });
});

describe("readNexusEnvFromFile", () => {
  test("returns null when file missing", async () => {
    const p = path.join(os.tmpdir(), `no-env-${Date.now()}`);
    expect(await readNexusEnvFromFile(p)).toBeNull();
  });

  test("returns null when vars incomplete", async () => {
    const p = path.join(os.tmpdir(), `partial-${Date.now()}.env`);
    await fs.writeFile(p, "NEXUS_REGISTRY=localhost:8082\n", "utf8");
    expect(await readNexusEnvFromFile(p)).toBeNull();
    await fs.unlink(p);
  });

  test("parses all three Nexus vars", async () => {
    const p = path.join(os.tmpdir(), `full-${Date.now()}.env`);
    await fs.writeFile(
      p,
      `NEXUS_REGISTRY=localhost:8082
NEXUS_USER=admin
NEXUS_PASSWORD=secret123
`,
      "utf8",
    );
    const n = await readNexusEnvFromFile(p);
    expect(n).toEqual({
      registry: "localhost:8082",
      user: "admin",
      password: "secret123",
    });
    await fs.unlink(p);
  });
});

describe("applyEnvPatchToContent", () => {
  test("sets, appends, and removes values while preserving unrelated lines", () => {
    const patched = applyEnvPatchToContent(
      "# hi\nFOO=old\nBAR=one\nSECRET_KEY=abc\n",
      [
        { type: "set", key: "FOO", value: "new" },
        { type: "append", key: "BAR", value: "two", separator: "," },
        { type: "remove", key: "SECRET_KEY" },
        { type: "set", key: "BAZ", value: "added" },
      ],
    );
    expect(patched.content).toBe("# hi\nFOO=new\nBAR=one,two\n\nBAZ=added\n");
    expect(patched.diffs).toEqual([
      { key: "FOO", before: "old", after: "new", type: "set" },
      { key: "BAR", before: "one", after: "one,two", type: "append" },
      { key: "SECRET_KEY", before: "abc", after: undefined, type: "remove" },
      { key: "BAZ", before: undefined, after: "added", type: "set" },
    ]);
  });

  test("does not report unchanged set operations", () => {
    const patched = applyEnvPatchToContent("FOO=bar\n", [{ type: "set", key: "FOO", value: "bar" }]);
    expect(patched.content).toBe("FOO=bar\n");
    expect(patched.diffs).toEqual([]);
  });
});

describe("parseEnvKeys", () => {
  test("parses simple env assignments", () => {
    expect(parseEnvKeys('FOO=bar\nQUOTED="baz"\n# nope\n')).toEqual({
      FOO: "bar",
      QUOTED: "baz",
    });
  });
});
