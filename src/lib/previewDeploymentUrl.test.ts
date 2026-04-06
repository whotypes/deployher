import { describe, expect, test } from "bun:test";
import { effectiveDeploymentPreviewUrl } from "./previewDeploymentUrl";

describe("effectiveDeploymentPreviewUrl", () => {
  test("uses DB URL when present for success", () => {
    expect(
      effectiveDeploymentPreviewUrl("success", "http://custom.example/p", "abc")
    ).toBe("http://custom.example/p");
  });

  test("falls back to subdomain URL when success and preview URL empty", () => {
    expect(effectiveDeploymentPreviewUrl("success", null, "r5cnb5rze")).toMatch(/r5cnb5rze/);
  });

  test("does not invent URL when not success", () => {
    expect(effectiveDeploymentPreviewUrl("failed", null, "r5cnb5rze")).toBeNull();
  });
});
