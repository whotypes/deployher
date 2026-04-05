import { describe, expect, test } from "bun:test";
import { readEnvValue, readNexusEnvFromFile } from "./env-file";
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
