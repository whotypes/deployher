import { describe, expect, test } from "bun:test";
import { buildPublicPreviewUrl } from "../config";
import { effectiveDeploymentPreviewUrl } from "./previewDeploymentUrl";

describe("effectiveDeploymentPreviewUrl", () => {
  test("success with shortId always matches canonical public URL (ignores stale DB)", () => {
    expect(
      effectiveDeploymentPreviewUrl("success", "http://stale.localhost:3001/wrong", "abc")
    ).toBe(buildPublicPreviewUrl("abc"));
  });

  test("falls back to DB when success but shortId missing", () => {
    expect(effectiveDeploymentPreviewUrl("success", "https://legacy.example/path", null)).toBe(
      "https://legacy.example/path"
    );
  });

  test("falls back to subdomain URL when success, empty preview URL, shortId set", () => {
    expect(effectiveDeploymentPreviewUrl("success", null, "r5cnb5rze")).toBe(
      buildPublicPreviewUrl("r5cnb5rze")
    );
  });

  test("does not invent URL when not success", () => {
    expect(effectiveDeploymentPreviewUrl("failed", null, "r5cnb5rze")).toBeNull();
  });
});
