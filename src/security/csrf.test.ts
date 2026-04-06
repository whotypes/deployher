import { describe, expect, it, mock } from "bun:test";

mock.module("../config", () => ({
  config: {
    env: "development",
    devDomain: "localhost",
    prodDomain: "deployher.example.com",
    devProtocol: "http",
    prodProtocol: "https",
    port: 3001,
    auth: {
      url: undefined as string | undefined
    },
    build: {
      workers: 2,
      accountMaxConcurrent: 1,
      accountSlotTtlSeconds: 21600,
      repoCredentialTtlSeconds: 3600,
      reclaimIdleMs: 5000,
      pendingHeartbeatMs: 30000
    },
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
  getProdBaseUrl: () => "https://deployher.example.com",
  getAuthBaseUrl: () => "http://localhost:3001",
  getTrustedAppOrigins: () => ["http://localhost:3001", "https://deployher.example.com"],
  getDevProjectUrlPattern: () => "http://{project}.localhost:3001",
  getProdProjectUrlPattern: () => "https://{project}.deployher.example.com",
  buildDevSubdomainUrl: (label: string) => `http://${label}.localhost:3001`,
  resolveProjectDomains: (project: { id: string; name: string }) => ({
    dev: `http://${project.id}.localhost:3001`,
    prod: `https://${project.id}.deployher.example.com`
  })
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
        cookie: `deployher_csrf=${token}`,
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
        cookie: `deployher_csrf=${token}`,
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
        cookie: "deployher_csrf=expected-token",
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
    const request = new Request("https://deployher.example.com/projects/123", {
      headers: {
        origin: "https://deployher.example.com"
      }
    });

    const csrf = ensureCsrfToken(request);
    expect(csrf.token.length).toBeGreaterThan(0);
    expect(csrf.shouldSetCookie).toBe(true);
    expect(csrf.cookieValue).toContain("deployher_csrf=");
    expect(csrf.cookieValue).toContain("Secure");
  });
});
