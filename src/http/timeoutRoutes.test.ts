import { describe, expect, test } from "bun:test";
import { shouldDisableRequestTimeout } from "./timeoutRoutes";

describe("shouldDisableRequestTimeout", () => {
  test("disables timeouts for tenant preview hosts", () => {
    expect(shouldDisableRequestTimeout("2vp09bk3m.localhost:3001", "/")).toBe(true);
    expect(
      shouldDisableRequestTimeout(
        "94c2f168-7f58-4042-ae62-9d1837cb67d3.localhost:3001",
        "/assets/app.js"
      )
    ).toBe(true);
  });

  test("disables timeouts for path-based preview and redirect routes", () => {
    expect(shouldDisableRequestTimeout("localhost:3001", "/d/2vp09bk3m/")).toBe(true);
    expect(shouldDisableRequestTimeout("localhost:3001", "/preview/2vp09bk3m")).toBe(true);
  });

  test("disables timeouts for SSE log streams", () => {
    expect(
      shouldDisableRequestTimeout(
        "dashboard.deployher.com",
        "/deployments/94c2f168-7f58-4042-ae62-9d1837cb67d3/log/stream"
      )
    ).toBe(true);
    expect(
      shouldDisableRequestTimeout(
        "dashboard.deployher.com",
        "/deployments/94c2f168-7f58-4042-ae62-9d1837cb67d3/runtime-log/stream"
      )
    ).toBe(true);
  });

  test("keeps normal dashboard requests on the default timeout", () => {
    expect(shouldDisableRequestTimeout("dashboard.deployher.com", "/dashboard")).toBe(false);
    expect(shouldDisableRequestTimeout("api.deployher.com", "/api/projects")).toBe(false);
  });
});
