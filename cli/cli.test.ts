import { describe, expect, test } from "bun:test";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dir, "..");
const cliEntry = path.join(import.meta.dir, "index.ts");

describe("deployher CLI", () => {
  test("--help exits 0", async () => {
    const proc = Bun.spawn(["bun", cliEntry, "--help"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);
  });

  test("--version prints package version", async () => {
    const proc = Bun.spawn(["bun", cliEntry, "--version"], {
      cwd: repoRoot,
      stdout: "pipe",
    });
    const out = await new Response(proc.stdout).text();
    expect(await proc.exited).toBe(0);
    expect(out.trim().length).toBeGreaterThan(0);
  });

  test("grant-operator --help exits 0", async () => {
    const proc = Bun.spawn(["bun", cliEntry, "grant-operator", "--help"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);
  });

  test("login --help exits 0", async () => {
    const proc = Bun.spawn(["bun", cliEntry, "login", "--help"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);
  });

  test("detect --help exits 0", async () => {
    const proc = Bun.spawn(["bun", cliEntry, "detect", "--help"], {
      cwd: repoRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(await proc.exited).toBe(0);
  });
});
