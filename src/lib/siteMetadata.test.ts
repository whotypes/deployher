import { describe, expect, test } from "bun:test";
import { preferPreviewOriginForExternalAsset } from "./previewAssetUrl";
import {
    buildPreviewIconCandidateUrls,
    buildSiteMetaFetchAttempts,
    extractDocumentBaseUrlFromHtml,
    extractIconFromHtml,
    extractOgImageFromHtml,
    parseSiteMetadataFromHtml,
    rebaseAssetUrlOntoPreviewOrigin,
    resolveMetadataFetchRequest,
    siteMetadataIndexHtmlUrl
} from "./siteMetadata";

describe("buildSiteMetaFetchAttempts", () => {
  test("adds internal fallbacks for tenant .localhost without override", () => {
    const r = buildSiteMetaFetchAttempts("http://abc.localhost:3000/foo?x=1", null);
    expect(Array.isArray(r)).toBe(true);
    if (!Array.isArray(r)) return;
    expect(r.length).toBeGreaterThanOrEqual(4);
    expect(r[0]?.url).toBe("http://abc.localhost:3000/foo?x=1");
    expect(r[0]?.hostHeader).toBe("abc.localhost:3000");
    expect(r.map((x) => x.url)).toContain("http://127.0.0.1:3000/foo?x=1");
    expect(r.map((x) => x.url)).toContain("http://app:3000/foo?x=1");
    expect(r.map((x) => x.url)).toContain("http://host.docker.internal:3000/foo?x=1");
  });

  test("single attempt for non-localhost host when no override", () => {
    const r = buildSiteMetaFetchAttempts("https://preview.example.com/", null);
    expect(Array.isArray(r)).toBe(true);
    if (!Array.isArray(r)) return;
    expect(r).toHaveLength(1);
    expect(r[0]?.url).toBe("https://preview.example.com/");
  });

  test("configured origin runs first then public URL and dockers for tenant .localhost", () => {
    const r = buildSiteMetaFetchAttempts("http://abc.localhost:3000/", "http://127.0.0.1:3000");
    expect(Array.isArray(r)).toBe(true);
    if (!Array.isArray(r)) return;
    expect(r[0]?.url).toBe("http://127.0.0.1:3000/");
    expect(r[0]?.hostHeader).toBe("abc.localhost:3000");
    expect(r[1]?.url).toBe("http://abc.localhost:3000/");
    const urls = r.map((x) => x.url);
    expect(urls).toContain("http://app:3000/");
    expect(urls).toContain("http://host.docker.internal:3000/");
    expect(new Set(urls).size).toBe(urls.length);
  });

  test("configured origin plus direct URL only for non-.localhost previews", () => {
    const r = buildSiteMetaFetchAttempts("https://preview.example.com/path?q=1", "http://127.0.0.1:3000");
    expect(Array.isArray(r)).toBe(true);
    if (!Array.isArray(r)) return;
    expect(r).toHaveLength(2);
    expect(r[0]?.url).toBe("http://127.0.0.1:3000/path?q=1");
    expect(r[0]?.hostHeader).toBe("preview.example.com");
    expect(r[1]?.url).toBe("https://preview.example.com/path?q=1");
  });

  test("rejects invalid SITE_META_FETCH_ORIGIN", () => {
    const r = buildSiteMetaFetchAttempts("http://abc.localhost:3000/", "not-a-url");
    expect(Array.isArray(r)).toBe(false);
    if (Array.isArray(r)) return;
    expect(r.error.toLowerCase()).toContain("site_meta_fetch_origin");
  });
});

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

  test("reads multiline meta tag (regex fallback) when one-line <meta> scan misses", () => {
    const html = `<head>
<meta
  property="og:image"
  content="/nested/og.png" />
</head>`;
    expect(extractOgImageFromHtml(html, "https://dep.example/")).toBe("https://dep.example/nested/og.png");
  });
});

describe("siteMetadataIndexHtmlUrl", () => {
  test("resolves index in same directory as preview", () => {
    expect(siteMetadataIndexHtmlUrl("https://a.example/prefix/")).toBe("https://a.example/prefix/index.html");
    expect(siteMetadataIndexHtmlUrl("https://a.example/")).toBe("https://a.example/index.html");
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

describe("extractDocumentBaseUrlFromHtml", () => {
  test("uses first base href in head for relative resolution", () => {
    const html = `<head><base href="https://cdn.example/assets/" /><meta property="og:image" content="og.png" /></head>`;
    expect(extractDocumentBaseUrlFromHtml(html, "https://app.example/")).toBe("https://cdn.example/assets/");
  });

  test("resolves relative base href against document url", () => {
    const html = `<head><base href="subdir/" /></head>`;
    expect(extractDocumentBaseUrlFromHtml(html, "https://app.example/app/")).toBe("https://app.example/app/subdir/");
  });

  test("falls back to document url when no base", () => {
    expect(extractDocumentBaseUrlFromHtml("<html></html>", "https://ex.com/foo")).toBe("https://ex.com/foo");
  });
});

describe("parseSiteMetadataFromHtml", () => {
  test("resolves og and icon paths against base href from index html", () => {
    const html = `
      <head>
        <base href="/nested/" />
        <link rel="icon" href="f.ico" />
        <meta property="og:image" content="og.jpg" />
      </head>
    `;
    expect(parseSiteMetadataFromHtml(html, "https://dep.example/")).toEqual({
      iconUrl: "https://dep.example/nested/f.ico",
      ogImageUrl: "https://dep.example/nested/og.jpg"
    });
  });

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

  test("rewrites absolute production og:image to preview origin (same path as public/)", () => {
    const html = `<head><meta property="og:image" content="https://ghiblify.dev/demo/og.webp" /></head>`;
    const preview = "http://r5cnb5rze.localhost:3000/";
    expect(parseSiteMetadataFromHtml(html, preview).ogImageUrl).toBe(
      "http://r5cnb5rze.localhost:3000/demo/og.webp"
    );
  });

  test("rewrites production favicon to preview origin", () => {
    const html = `<head><link rel="icon" href="https://ghiblify.dev/favicon.ico" /></head>`;
    const preview = "http://abc.localhost:3000/";
    expect(parseSiteMetadataFromHtml(html, preview).iconUrl).toBe("http://abc.localhost:3000/favicon.ico");
  });
});

describe("buildPreviewIconCandidateUrls", () => {
  test("dedupes and appends common root paths after the resolved icon URL", () => {
    const urls = buildPreviewIconCandidateUrls(
      "http://abc.localhost:3000/wrong-path.png",
      "http://abc.localhost:3000/"
    );
    expect(urls[0]).toBe("http://abc.localhost:3000/wrong-path.png");
    expect(urls).toContain("http://abc.localhost:3000/apple-touch-icon.png");
    expect(urls).toContain("http://abc.localhost:3000/favicon.ico");
    expect(urls.length).toBe(5);
  });

  test("does not duplicate apple-touch when resolved is already that path", () => {
    const urls = buildPreviewIconCandidateUrls(
      "http://abc.localhost:3000/apple-touch-icon.png",
      "http://abc.localhost:3000/"
    );
    expect(urls.filter((u) => u.endsWith("/apple-touch-icon.png")).length).toBe(1);
    expect(urls.length).toBe(4);
  });
});

describe("preferPreviewOriginForExternalAsset", () => {
  test("swaps host to preview origin", () => {
    expect(
      preferPreviewOriginForExternalAsset(
        "https://prod.example/demo/og.webp?q=1#h",
        "http://tenant.localhost:3000/"
      )
    ).toBe("http://tenant.localhost:3000/demo/og.webp?q=1#h");
  });

  test("leaves URL unchanged when host already matches preview", () => {
    expect(
      preferPreviewOriginForExternalAsset("http://tenant.localhost:3000/x.png", "http://tenant.localhost:3000/")
    ).toBe("http://tenant.localhost:3000/x.png");
  });

  test("returns null for null input", () => {
    expect(preferPreviewOriginForExternalAsset(null, "http://a/")).toBeNull();
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
