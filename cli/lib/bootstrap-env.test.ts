import { describe, expect, test } from "bun:test";
import {
  envKeyLooksSensitive,
  maskEnvValueForDisplay,
  normalizeDomainForBootstrap,
  routingModeFromPathRoutingEnv,
} from "./bootstrap-env";

describe("normalizeDomainForBootstrap", () => {
  test("strips protocol and path", () => {
    expect(normalizeDomainForBootstrap("https://Ex.com/foo")).toBe("Ex.com");
  });

  test("strips trailing port", () => {
    expect(normalizeDomainForBootstrap("https://x.com:443")).toBe("x.com");
  });

  test("handles bare host", () => {
    expect(normalizeDomainForBootstrap("deployher.com")).toBe("deployher.com");
  });
});

describe("routingModeFromPathRoutingEnv", () => {
  test("maps known values", () => {
    expect(routingModeFromPathRoutingEnv("0")).toBe("host");
    expect(routingModeFromPathRoutingEnv("false")).toBe("host");
    expect(routingModeFromPathRoutingEnv("1")).toBe("path");
    expect(routingModeFromPathRoutingEnv("true")).toBe("path");
    expect(routingModeFromPathRoutingEnv("")).toBeNull();
    expect(routingModeFromPathRoutingEnv(undefined)).toBeNull();
  });
});

describe("envKeyLooksSensitive", () => {
  test("treats GitHub client id as non-secret for display", () => {
    expect(envKeyLooksSensitive("GITHUB_CLIENT_ID")).toBe(false);
  });

  test("treats auth and registry secrets as sensitive", () => {
    expect(envKeyLooksSensitive("BETTER_AUTH_SECRET")).toBe(true);
    expect(envKeyLooksSensitive("GITHUB_CLIENT_SECRET")).toBe(true);
    expect(envKeyLooksSensitive("NEXUS_PASSWORD")).toBe(true);
  });
});

describe("maskEnvValueForDisplay", () => {
  test("masks sensitive keys", () => {
    expect(maskEnvValueForDisplay("BETTER_AUTH_SECRET", "abc")).toBe("(set)");
  });

  test("leaves public ids visible", () => {
    expect(maskEnvValueForDisplay("GITHUB_CLIENT_ID", "Iv1.abc")).toBe("Iv1.abc");
  });
});
