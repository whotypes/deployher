import { describe, expect, test } from "bun:test";
import { isDeployherApiPathOnTenantHost } from "./lib/deployherHosts";

describe("isDeployherApiPathOnTenantHost", () => {
  test("matches known dashboard API prefixes for tenant preview host", () => {
    expect(isDeployherApiPathOnTenantHost("/api/csrf")).toBe(true);
    expect(isDeployherApiPathOnTenantHost("/api/session")).toBe(true);
    expect(isDeployherApiPathOnTenantHost("/api/ui/projects-page")).toBe(true);
    expect(isDeployherApiPathOnTenantHost("/api/projects")).toBe(true);
    expect(isDeployherApiPathOnTenantHost("/api/projects/abc")).toBe(true);
    expect(isDeployherApiPathOnTenantHost("/api/deployments/x")).toBe(true);
    expect(isDeployherApiPathOnTenantHost("/api/github/repos")).toBe(true);
    expect(isDeployherApiPathOnTenantHost("/api/admin/foo")).toBe(true);
  });

  test("does not match arbitrary /api paths (tenant host serves them as deployment assets)", () => {
    expect(isDeployherApiPathOnTenantHost("/api/openapi.json")).toBe(false);
    expect(isDeployherApiPathOnTenantHost("/api/v1/users")).toBe(false);
    expect(isDeployherApiPathOnTenantHost("/api/static/foo")).toBe(false);
  });
});
