import { describe, expect, it } from "bun:test";
import { MemoryDetectorFilesystem } from "./memoryDetectorFilesystem";

describe("MemoryDetectorFilesystem", () => {
  it("resolves package.json at repo root", async () => {
    const fs = new MemoryDetectorFilesystem({
      "package.json": '{"name":"x"}'
    });
    expect(await fs.hasPath("package.json")).toBe(true);
    expect(await fs.isFile("package.json")).toBe(true);
    const buf = await fs.readFile("package.json");
    expect(buf.toString("utf8")).toContain("name");
  });

  it("reports directory hasPath when children exist", async () => {
    const fs = new MemoryDetectorFilesystem({
      "src/index.ts": "x"
    });
    expect(await fs.hasPath("src")).toBe(true);
    expect(await fs.isFile("src")).toBe(false);
  });

  it("readdir lists files and dirs at root", async () => {
    const fs = new MemoryDetectorFilesystem({
      "package.json": "{}",
      "src/a.ts": "1"
    });
    const entries = await fs.readdir(".");
    const names = new Set(entries.map((e) => e.name));
    expect(names.has("package.json")).toBe(true);
    expect(names.has("src")).toBe(true);
    const src = entries.find((e) => e.name === "src");
    expect(src?.type).toBe("dir");
  });

  it("chdir scopes reads to subdirectory", async () => {
    const root = new MemoryDetectorFilesystem({
      "apps/web/package.json": '{"name":"web"}'
    });
    const nested = root.chdir("apps/web");
    expect(await nested.hasPath("package.json")).toBe(true);
    expect((await nested.readFile("package.json")).toString("utf8")).toContain("web");
  });
});
