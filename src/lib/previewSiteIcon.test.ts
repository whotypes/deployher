import { describe, expect, test } from "bun:test";
import { resolveProjectGlyphIconSrc, resolveProjectGlyphSiteIconOnly } from "./previewSiteIcon";

describe("resolveProjectGlyphSiteIconOnly", () => {
  test("resolves absolute siteIconUrl", () => {
    expect(resolveProjectGlyphSiteIconOnly("https://example.com/i.png", null)).toBe(
      "https://example.com/i.png"
    );
  });

  test("resolves relative siteIconUrl against preview base", () => {
    expect(
      resolveProjectGlyphSiteIconOnly("/icon.png", "http://r5cnb5rze.localhost:3000")
    ).toBe("http://r5cnb5rze.localhost:3000/icon.png");
  });

  test("returns null for relative icon without preview base", () => {
    expect(resolveProjectGlyphSiteIconOnly("/custom-icon.png", null)).toBeNull();
  });
});

describe("resolveProjectGlyphIconSrc", () => {
  test("prefers favicon on preview base when previewUrl is set, even if siteIconUrl is set", () => {
    expect(
      resolveProjectGlyphIconSrc("https://dead.example/old.png", "http://r5cnb5rze.localhost:3000")
    ).toBe("http://r5cnb5rze.localhost:3000/favicon.ico");
  });

  test("uses siteIconUrl when no previewUrl", () => {
    expect(resolveProjectGlyphIconSrc("https://example.com/i.png", null)).toBe("https://example.com/i.png");
  });

  test("relative siteIconUrl resolves against preview when preview has no usable favicon path", () => {
    expect(resolveProjectGlyphIconSrc("/custom-icon.png", null)).toBeNull();
  });
});
