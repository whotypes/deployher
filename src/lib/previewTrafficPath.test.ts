import { describe, expect, test } from "bun:test";
import { normalizePreviewTrafficPathForLog } from "./previewTrafficPath";

describe("normalizePreviewTrafficPathForLog", () => {
  test("empty maps to root path", () => {
    expect(normalizePreviewTrafficPathForLog("")).toBe("/");
  });

  test("strips query string", () => {
    expect(normalizePreviewTrafficPathForLog("foo/bar?x=1")).toBe("/foo/bar");
  });

  test("prefixes leading slash", () => {
    expect(normalizePreviewTrafficPathForLog("a/b")).toBe("/a/b");
  });

  test("removes embedded null bytes", () => {
    expect(normalizePreviewTrafficPathForLog(`a\0/b`)).toBe("/a/b");
  });
});
