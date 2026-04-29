import { describe, expect, test } from "bun:test";
import { resolveLivePreviewPageUrl } from "./livePreviewDeployment";

describe("resolveLivePreviewPageUrl", () => {
  test("uses trimmed previewUrl when set", () => {
    expect(resolveLivePreviewPageUrl({ previewUrl: "  https://ex.com/p  ", shortId: "x" })).toBe(
      "https://ex.com/p"
    );
  });

  test("falls back to dev subdomain when previewUrl is empty", () => {
    const u = resolveLivePreviewPageUrl({ previewUrl: "", shortId: "abc" });
    expect(u).toContain("abc");
    expect(u.startsWith("http")).toBe(true);
  });
});
