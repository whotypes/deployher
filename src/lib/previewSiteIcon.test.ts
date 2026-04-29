import { describe, expect, test } from "bun:test";
import {
  resolveProjectGlyphIconFaviconIcoFallback,
  resolveProjectGlyphIconSrc,
  resolveProjectGlyphSiteIconOnly
} from "./previewSiteIcon";

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
  test("prefers siteIconUrl when previewUrl is set", () => {
    expect(
      resolveProjectGlyphIconSrc("https://dead.example/old.png", "http://r5cnb5rze.localhost:3000")
    ).toBe("https://dead.example/old.png");
  });

  test("falls back to favicon.ico on preview when siteIconUrl is empty", () => {
    expect(resolveProjectGlyphIconSrc(null, "http://r5cnb5rze.localhost:3000")).toBe(
      "http://r5cnb5rze.localhost:3000/favicon.ico"
    );
  });

  test("uses siteIconUrl when no previewUrl", () => {
    expect(resolveProjectGlyphIconSrc("https://example.com/i.png", null)).toBe("https://example.com/i.png");
  });

  test("relative siteIconUrl resolves against preview when preview has no usable favicon path", () => {
    expect(resolveProjectGlyphIconSrc("/custom-icon.png", null)).toBeNull();
  });
});

describe("resolveProjectGlyphIconFaviconIcoFallback", () => {
  test("returns preview favicon.ico when siteIconUrl differs from default ico path", () => {
    expect(
      resolveProjectGlyphIconFaviconIcoFallback(
        "http://r5cnb5rze.localhost:3000/favicon.webp",
        "http://r5cnb5rze.localhost:3000"
      )
    ).toBe("http://r5cnb5rze.localhost:3000/favicon.ico");
  });

  test("returns null when siteIconUrl is already favicon.ico", () => {
    expect(
      resolveProjectGlyphIconFaviconIcoFallback(
        "http://r5cnb5rze.localhost:3000/favicon.ico",
        "http://r5cnb5rze.localhost:3000"
      )
    ).toBeNull();
  });
});
