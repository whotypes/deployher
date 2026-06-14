import { afterAll, afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { unitTestConfigMock } from "../test/unitConfigMock";

const redisCounts = new Map<string, number>();
const redisTtl = new Map<string, number>();

let trustProxy = false;

mock.module("../config", () => {
  const base = unitTestConfigMock();
  return {
    ...base,
    config: {
      ...base.config,
      observability: {
        ...base.config.observability,
        get trustProxy() {
          return trustProxy;
        }
      }
    }
  };
});

mock.module("../redis", () => ({
  getRedisClient: async () => ({
    send: async (command: string, args: string[]) => {
      const key = args[0];
      if (!key) return null;
      if (command === "INCR") {
        const next = (redisCounts.get(key) ?? 0) + 1;
        redisCounts.set(key, next);
        return next;
      }
      if (command === "EXPIRE") {
        redisTtl.set(key, Number(args[1]));
        return 1;
      }
      return null;
    }
  })
}));

const { checkRateLimit, resetRateLimitMemoryStoreForTests, RATE_LIMIT_PATHS } = await import("./rateLimit");

afterAll(() => {
  mock.restore();
});

const request = (url: string, init: RequestInit = {}): Request => new Request(url, init);

describe("RATE_LIMIT_PATHS", () => {
  test("exports expected path constants", () => {
    expect(RATE_LIMIT_PATHS.AUTH_PREFIX).toBe("/api/auth");
    expect(RATE_LIMIT_PATHS.STATIC_UPLOAD_AVATAR).toBe("/api/avatar");
    expect(RATE_LIMIT_PATHS.STATIC_UPLOAD_DEPLOYMENT_SUFFIX).toBe("/deployments/static-upload");
  });
});

describe("checkRateLimit", () => {
  beforeEach(() => {
    trustProxy = false;
    redisCounts.clear();
    redisTtl.clear();
    resetRateLimitMemoryStoreForTests();
  });

  afterEach(() => {
    resetRateLimitMemoryStoreForTests();
  });

  test("allows requests under the auth POST limit", async () => {
    for (let i = 0; i < 20; i += 1) {
      const result = await checkRateLimit(
        request("http://localhost/api/auth/sign-in/email", { method: "POST" })
      );
      expect(result).toBeNull();
    }
  });

  test("returns 429 when auth POST limit exceeded", async () => {
    for (let i = 0; i < 20; i += 1) {
      await checkRateLimit(request("http://localhost/api/auth/sign-in/email", { method: "POST" }));
    }
    const blocked = await checkRateLimit(
      request("http://localhost/api/auth/sign-in/email", { method: "POST" })
    );
    expect(blocked?.status).toBe(429);
    const body = (await blocked?.json()) as { error: string };
    expect(body.error).toBe("Too many requests");
  });

  test("applies static upload limit", async () => {
    for (let i = 0; i < 10; i += 1) {
      const result = await checkRateLimit(
        request("http://localhost/api/projects/p1/deployments/static-upload", { method: "POST" })
      );
      expect(result).toBeNull();
    }
    const blocked = await checkRateLimit(
      request("http://localhost/api/projects/p1/deployments/static-upload", { method: "POST" })
    );
    expect(blocked?.status).toBe(429);
  });

  test("applies protected mutation limit for /projects routes", async () => {
    for (let i = 0; i < 120; i += 1) {
      await checkRateLimit(request("http://localhost/projects/abc", { method: "DELETE" }));
    }
    const blocked = await checkRateLimit(request("http://localhost/projects/abc", { method: "DELETE" }));
    expect(blocked?.status).toBe(429);
  });

  test("applies api fallback limit for non-mutation /api routes", async () => {
    for (let i = 0; i < 300; i += 1) {
      await checkRateLimit(request("http://localhost/api/projects", { method: "GET" }));
    }
    const blocked = await checkRateLimit(request("http://localhost/api/projects", { method: "GET" }));
    expect(blocked?.status).toBe(429);
  });

  test("skips rate limiting for non-api HTML routes", async () => {
    const result = await checkRateLimit(request("http://localhost/dashboard", { method: "GET" }));
    expect(result).toBeNull();
  });

  test("uses x-forwarded-for first IP when trustProxy is enabled", async () => {
    trustProxy = true;
    const headers = { "x-forwarded-for": "203.0.113.1, 10.0.0.1" };

    for (let i = 0; i < 20; i += 1) {
      await checkRateLimit(
        request("http://localhost/api/auth/sign-in/email", { method: "POST", headers })
      );
    }

    const sameIpBlocked = await checkRateLimit(
      request("http://localhost/api/auth/sign-in/email", { method: "POST", headers })
    );
    expect(sameIpBlocked?.status).toBe(429);

    const otherIp = await checkRateLimit(
      request("http://localhost/api/auth/sign-in/email", {
        method: "POST",
        headers: { "x-forwarded-for": "198.51.100.9" }
      })
    );
    expect(otherIp).toBeNull();
  });
});
