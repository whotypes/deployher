import { describe, expect, test } from "bun:test";
import { sanitizeRelativePath, stripOptionalArtifactRoot } from "./staticUploadPaths";

describe("sanitizeRelativePath", () => {
  test("normalizes and rejects traversal", () => {
    expect(sanitizeRelativePath("foo/bar")).toBe("foo/bar");
    expect(sanitizeRelativePath("../x")).toBe(null);
    expect(sanitizeRelativePath("a/../b")).toBe(null);
    expect(sanitizeRelativePath("/abs")).toBe("abs");
  });
});

describe("stripOptionalArtifactRoot", () => {
  test("strips shared dist root", () => {
    expect(stripOptionalArtifactRoot(["dist/index.html", "dist/a.css"])).toEqual(["index.html", "a.css"]);
  });

  test("leaves mixed roots unchanged", () => {
    expect(stripOptionalArtifactRoot(["dist/a", "build/b"])).toEqual(["dist/a", "build/b"]);
  });
});
