import { describe, expect, test } from "bun:test";
import { isSafeAppRedirect, resolveSafeRedirect } from "./safeRedirect";

describe("isSafeAppRedirect", () => {
  test("allows same-origin relative paths", () => {
    expect(isSafeAppRedirect("/dashboard")).toBe(true);
    expect(isSafeAppRedirect("/projects/abc")).toBe(true);
    expect(isSafeAppRedirect("/login?redirect=%2Fdashboard")).toBe(true);
  });

  test("rejects protocol-relative and absolute URLs", () => {
    expect(isSafeAppRedirect("//evil.com")).toBe(false);
    expect(isSafeAppRedirect("//evil.com/path")).toBe(false);
    expect(isSafeAppRedirect("https://evil.com")).toBe(false);
    expect(isSafeAppRedirect("http://evil.com")).toBe(false);
  });

  test("rejects empty and non-path values", () => {
    expect(isSafeAppRedirect("")).toBe(false);
    expect(isSafeAppRedirect("dashboard")).toBe(false);
    expect(isSafeAppRedirect("javascript:alert(1)")).toBe(false);
  });
});

describe("resolveSafeRedirect", () => {
  test("returns safe path when valid", () => {
    expect(resolveSafeRedirect("/dashboard", "/")).toBe("/dashboard");
  });

  test("returns fallback for unsafe or missing paths", () => {
    expect(resolveSafeRedirect("//evil.com", "/")).toBe("/");
    expect(resolveSafeRedirect("https://evil.com", "/home")).toBe("/home");
    expect(resolveSafeRedirect("", "/")).toBe("/");
    expect(resolveSafeRedirect(null, "/")).toBe("/");
    expect(resolveSafeRedirect(undefined, "/projects")).toBe("/projects");
  });
});
