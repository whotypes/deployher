import { describe, expect, test } from "bun:test";
import { buildPublicPreviewUrl } from "../config";
import { resolveLivePreviewPageUrl } from "./livePreviewDeployment";

describe("resolveLivePreviewPageUrl", () => {
  test("uses canonical URL from shortId (ignores stale stored previewUrl)", () => {
    expect(resolveLivePreviewPageUrl({ previewUrl: "  https://ex.com/p  ", shortId: "x" })).toBe(
      buildPublicPreviewUrl("x")
    );
  });

  test("falls back to trimmed previewUrl when shortId empty", () => {
    expect(resolveLivePreviewPageUrl({ previewUrl: "  https://ex.com/p  ", shortId: "" })).toBe(
      "https://ex.com/p"
    );
  });

  test("builds from shortId when previewUrl empty", () => {
    const u = resolveLivePreviewPageUrl({ previewUrl: "", shortId: "abc" });
    expect(u).toBe(buildPublicPreviewUrl("abc"));
  });
});
