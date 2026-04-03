import { describe, expect, it, mock } from "bun:test";

mock.module("../config", () => ({
  config: {
    devDomain: "localhost",
    prodDomain: "pdploy.example.com",
    devProtocol: "http",
    prodProtocol: "https",
    port: 3001,
    preview: {
      assetBaseUrl: undefined
    },
    runner: {
      previewEnabled: false,
      url: undefined
    },
    redis: {
      url: undefined
    }
  },
  getDevBaseUrl: () => "http://localhost:3001",
  getProdBaseUrl: () => "https://pdploy.example.com",
  buildDevSubdomainUrl: (label: string) => `http://${label}.localhost:3001`
}));

const {
  ensureCsrfToken,
  validateMutationRequest
} = await import("./csrf");

describe("csrf validation", () => {
  it("accepts same-origin mutation requests with matching cookie and header tokens", async () => {
    const token = "csrf-token-1";
    const request = new Request("http://localhost:3001/projects/123", {
      method: "POST",
      headers: {
        cookie: `pdploy_csrf=${token}`,
        origin: "http://localhost:3001",
        "sec-fetch-site": "same-origin",
        "x-csrf-token": token
      }
    });

    const result = await validateMutationRequest(request, token);
    expect(result).toEqual({ ok: true });
  });

  it("rejects cross-site mutation requests", async () => {
    const token = "csrf-token-2";
    const request = new Request("http://localhost:3001/projects/123", {
      method: "DELETE",
      headers: {
        cookie: `pdploy_csrf=${token}`,
        origin: "https://evil.example.com",
        "sec-fetch-site": "cross-site",
        "x-csrf-token": token
      }
    });

    const result = await validateMutationRequest(request, token);
    expect(result).toEqual({
      ok: false,
      reason: "Cross-site requests are not allowed"
    });
  });

  it("rejects requests with missing or mismatched tokens", async () => {
    const request = new Request("http://localhost:3001/projects/123", {
      method: "PATCH",
      headers: {
        cookie: "pdploy_csrf=expected-token",
        origin: "http://localhost:3001",
        "sec-fetch-site": "same-origin",
        "x-csrf-token": "wrong-token"
      }
    });

    const result = await validateMutationRequest(request, "expected-token");
    expect(result).toEqual({
      ok: false,
      reason: "Invalid CSRF token"
    });
  });

  it("issues a reusable csrf cookie when the request has none", () => {
    const request = new Request("https://pdploy.example.com/projects/123", {
      headers: {
        origin: "https://pdploy.example.com"
      }
    });

    const csrf = ensureCsrfToken(request);
    expect(csrf.token.length).toBeGreaterThan(0);
    expect(csrf.shouldSetCookie).toBe(true);
    expect(csrf.cookieValue).toContain("pdploy_csrf=");
    expect(csrf.cookieValue).toContain("Secure");
  });
});
