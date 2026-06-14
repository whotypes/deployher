import { describe, expect, mock, test } from "bun:test";
import { unitTestConfigMock } from "../test/unitConfigMock";

const landingOrigins = () => ["https://deployher.example.com"];

mock.module("../config", () => ({
  ...unitTestConfigMock(),
  getLandingOrigins: landingOrigins
}));

const {
  canonicalWhyOnLandingUrl,
  getCanonicalLandingOrigin,
  postAuthExitRedirectUrl,
  requestHostIsDashApp
} = await import("./deployherHosts");

describe("getCanonicalLandingOrigin", () => {
  test("returns landing origin when dash is a separate host", () => {
    expect(getCanonicalLandingOrigin()).toBe("https://deployher.example.com");
  });
});

describe("canonicalWhyOnLandingUrl", () => {
  test("points at marketing /why", () => {
    expect(canonicalWhyOnLandingUrl()).toBe("https://deployher.example.com/why");
  });
});

describe("postAuthExitRedirectUrl", () => {
  test("sends dash sign-out to marketing apex", () => {
    const req = new Request("https://dash.deployher.example.com/logout", {
      method: "POST",
      headers: { host: "dash.deployher.example.com" }
    });
    expect(postAuthExitRedirectUrl(req)).toBe("https://deployher.example.com/");
  });

  test("keeps same-origin / on non-dash hosts", () => {
    const req = new Request("https://deployher.example.com/logout", {
      method: "POST",
      headers: { host: "deployher.example.com" }
    });
    expect(postAuthExitRedirectUrl(req)).toBe("https://deployher.example.com/");
  });
});

describe("requestHostIsDashApp", () => {
  test("matches configured dash hostname", () => {
    const req = new Request("https://dash.deployher.example.com/", {
      headers: { host: "dash.deployher.example.com" }
    });
    expect(requestHostIsDashApp(req)).toBe(true);
  });
});
