import { describe, expect, test } from "bun:test";
import { isPdployApiPathOnTenantHost } from "./router";

describe("isPdployApiPathOnTenantHost", () => {
  test("matches known dashboard API prefixes for tenant preview host", () => {
    expect(isPdployApiPathOnTenantHost("/api/csrf")).toBe(true);
    expect(isPdployApiPathOnTenantHost("/api/session")).toBe(true);
    expect(isPdployApiPathOnTenantHost("/api/ui/projects-page")).toBe(true);
    expect(isPdployApiPathOnTenantHost("/api/projects")).toBe(true);
    expect(isPdployApiPathOnTenantHost("/api/projects/abc")).toBe(true);
    expect(isPdployApiPathOnTenantHost("/api/deployments/x")).toBe(true);
    expect(isPdployApiPathOnTenantHost("/api/github/repos")).toBe(true);
    expect(isPdployApiPathOnTenantHost("/api/admin/foo")).toBe(true);
  });

  test("does not match arbitrary /api paths (tenant host serves them as deployment assets)", () => {
    expect(isPdployApiPathOnTenantHost("/api/openapi.json")).toBe(false);
    expect(isPdployApiPathOnTenantHost("/api/v1/users")).toBe(false);
    expect(isPdployApiPathOnTenantHost("/api/static/foo")).toBe(false);
  });
});
