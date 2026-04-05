import { describe, expect, test } from "bun:test";
import {
  extractIconFromHtml,
  extractOgImageFromHtml,
  parseSiteMetadataFromHtml,
  rebaseAssetUrlOntoPreviewOrigin,
  resolveMetadataFetchRequest
} from "./siteMetadata";

describe("resolveMetadataFetchRequest", () => {
  test("passes through public URL when no override", () => {
    const r = resolveMetadataFetchRequest("http://abc.localhost:3000/foo?x=1", null);
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.url).toBe("http://abc.localhost:3000/foo?x=1");
      expect(r.hostHeader).toBe("abc.localhost:3000");
    }
  });

  test("rewrites origin and preserves Host from public URL", () => {
    const r = resolveMetadataFetchRequest("http://abc.localhost:3000/", "http://127.0.0.1:3000");
    expect("error" in r).toBe(false);
    if (!("error" in r)) {
      expect(r.url).toBe("http://127.0.0.1:3000/");
      expect(r.hostHeader).toBe("abc.localhost:3000");
    }
  });

  test("rejects non-http preview URL", () => {
    const r = resolveMetadataFetchRequest("javascript:alert(1)", null);
    expect("error" in r).toBe(true);
  });
});

describe("extractOgImageFromHtml", () => {
  test("reads og:image property form", () => {
    const html = `<head><meta property="og:image" content="/pic.png" /></head>`;
    expect(extractOgImageFromHtml(html, "https://ex.com/")).toBe("https://ex.com/pic.png");
  });

  test("reads og:image with content before property", () => {
    const html = `<meta content="https://cdn.example/og.jpg" property="og:image" />`;
    expect(extractOgImageFromHtml(html, "https://ex.com/")).toBe("https://cdn.example/og.jpg");
  });

  test("falls back to twitter:image", () => {
    const html = `<meta name="twitter:image" content="/tw.png" />`;
    expect(extractOgImageFromHtml(html, "https://ex.com/")).toBe("https://ex.com/tw.png");
  });

  test("prefers og:image over twitter:image when og comes first", () => {
    const html = `
      <meta property="og:image" content="https://a.com/og.png" />
      <meta name="twitter:image" content="https://b.com/tw.png" />
    `;
    expect(extractOgImageFromHtml(html, "https://ex.com/")).toBe("https://a.com/og.png");
  });

  test("prefers og:image even when twitter:image appears earlier", () => {
    const html = `
      <meta name="twitter:image" content="https://b.com/tw.png" />
      <meta property="og:image" content="https://a.com/og.png" />
    `;
    expect(extractOgImageFromHtml(html, "https://ex.com/")).toBe("https://a.com/og.png");
  });
});

describe("extractIconFromHtml", () => {
  test("prefers apple-touch-icon", () => {
    const html = `
      <link rel="icon" href="/f.ico" />
      <link rel="apple-touch-icon" href="/apple.png" />
    `;
    expect(extractIconFromHtml(html, "https://ex.com/")).toBe("https://ex.com/apple.png");
  });

  test("picks largest sized icon among rel=icon", () => {
    const html = `
      <link rel="icon" type="image/png" sizes="16x16" href="/16.png" />
      <link rel="icon" type="image/png" sizes="48x48" href="/48.png" />
    `;
    expect(extractIconFromHtml(html, "https://ex.com/")).toBe("https://ex.com/48.png");
  });

  test("skips mask-icon", () => {
    const html = `<link rel="mask-icon" href="/m.svg" color="#000" /><link rel="icon" href="/f.ico" />`;
    expect(extractIconFromHtml(html, "https://ex.com/")).toBe("https://ex.com/f.ico");
  });
});

describe("parseSiteMetadataFromHtml", () => {
  test("extracts both", () => {
    const html = `
      <head>
        <link rel="icon" href="/f.ico" />
        <meta property="og:image" content="/og.jpg" />
      </head>
    `;
    expect(parseSiteMetadataFromHtml(html, "https://app.example/")).toEqual({
      iconUrl: "https://app.example/f.ico",
      ogImageUrl: "https://app.example/og.jpg"
    });
  });

  test("rebases og:image from loopback onto deployment preview host", () => {
    const html = `<meta property="og:image" content="http://localhost:3000/opengraph-image.png?opengraph-image.f24bf553.png" />`;
    const preview = "http://qpkghorfe.localhost:3000/";
    expect(parseSiteMetadataFromHtml(html, preview).ogImageUrl).toBe(
      "http://qpkghorfe.localhost:3000/opengraph-image.png?opengraph-image.f24bf553.png"
    );
  });
});

describe("rebaseAssetUrlOntoPreviewOrigin", () => {
  test("maps localhost asset to preview origin", () => {
    expect(
      rebaseAssetUrlOntoPreviewOrigin(
        "http://localhost:3000/opengraph-image.png?q=1",
        "http://abc.localhost:3000/"
      )
    ).toBe("http://abc.localhost:3000/opengraph-image.png?q=1");
  });

  test("leaves CDN URLs unchanged", () => {
    expect(
      rebaseAssetUrlOntoPreviewOrigin("https://cdn.example/og.jpg", "http://abc.localhost:3000/")
    ).toBe("https://cdn.example/og.jpg");
  });

  test("returns null for null input", () => {
    expect(rebaseAssetUrlOntoPreviewOrigin(null, "http://a/")).toBeNull();
  });
});
