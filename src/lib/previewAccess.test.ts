import { afterEach, describe, expect, it, mock } from "bun:test";

const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;

mock.module("../auth/session", () => ({
  getSession: async () => null
}));

describe("previewAccess tokens", () => {
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) {
      delete process.env.BETTER_AUTH_SECRET;
    } else {
      process.env.BETTER_AUTH_SECRET = ORIGINAL_SECRET;
    }
  });

  it("signs and verifies preview access tokens", async () => {
    process.env.BETTER_AUTH_SECRET = "test-preview-secret";
    const { signPreviewAccessToken, previewAccessTokenExpiresAt, verifyPreviewAccessToken } =
      await import("./previewAccess");
    const token = signPreviewAccessToken("project-123", 3600);
    expect(token.split(".")).toHaveLength(3);
    const expiresAt = previewAccessTokenExpiresAt(token);
    expect(expiresAt).not.toBeNull();
    expect(expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(verifyPreviewAccessToken(token, "project-123")).toBe(true);
    expect(verifyPreviewAccessToken(token, "other-project")).toBe(false);
  });
});
