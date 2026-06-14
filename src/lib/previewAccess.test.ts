import { afterEach, describe, expect, it } from "bun:test";

const ORIGINAL_SECRET = process.env.BETTER_AUTH_SECRET;

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
    const { signPreviewAccessToken, previewAccessTokenExpiresAt } = await import("./previewAccess");
    const token = signPreviewAccessToken("project-123", 3600);
    expect(token.split(".")).toHaveLength(3);
    const expiresAt = previewAccessTokenExpiresAt(token);
    expect(expiresAt).not.toBeNull();
    expect(expiresAt!.getTime()).toBeGreaterThan(Date.now());
  });
});
