import { describe, expect, it } from "bun:test";
import { sanitizeProxyResponseHeaders } from "./proxyHeaders";

describe("sanitizeProxyResponseHeaders", () => {
  it("removes content-encoding and content-length from proxied responses", () => {
    const headers = new Headers({
      "content-encoding": "gzip",
      "content-length": "123",
      "content-type": "text/html; charset=utf-8",
      etag: '"abc123"'
    });

    const sanitized = sanitizeProxyResponseHeaders(headers);

    expect(sanitized.get("content-encoding")).toBeNull();
    expect(sanitized.get("content-length")).toBeNull();
    expect(sanitized.get("content-type")).toBe("text/html; charset=utf-8");
    expect(sanitized.get("etag")).toBe('"abc123"');
  });
});
