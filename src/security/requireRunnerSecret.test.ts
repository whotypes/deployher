import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { unitTestConfigMock } from "../test/unitConfigMock";

const runnerConfig = {
  sharedSecret: undefined as string | undefined
};

let appEnv: "development" | "production" = "development";

mock.module("../config", () => {
  const base = unitTestConfigMock();
  return {
    ...base,
    config: {
      ...base.config,
      get env() {
        return appEnv;
      },
      runner: runnerConfig
    }
  };
});

const { isRunnerSecretConfigured, verifyRunnerSecretOrDeny } = await import("./requireRunnerSecret");

afterAll(() => {
  mock.restore();
});

const requestWithSecret = (secret: string | undefined): Request =>
  new Request("http://localhost/internal/trigger-preview-rehydrate", {
    method: "POST",
    headers: secret ? { "x-deployher-runner-secret": secret } : {}
  });

describe("isRunnerSecretConfigured", () => {
  beforeEach(() => {
    runnerConfig.sharedSecret = undefined;
    appEnv = "development";
  });

  test("returns false when secret is missing", () => {
    expect(isRunnerSecretConfigured()).toBe(false);
  });

  test("returns true when secret is set", () => {
    runnerConfig.sharedSecret = "runner-secret";
    expect(isRunnerSecretConfigured()).toBe(true);
  });
});

describe("verifyRunnerSecretOrDeny", () => {
  beforeEach(() => {
    runnerConfig.sharedSecret = undefined;
    appEnv = "development";
  });

  test("allows requests in development when secret is not configured", () => {
    expect(verifyRunnerSecretOrDeny(requestWithSecret(undefined))).toBeNull();
  });

  test("returns 503 in production when secret is not configured", async () => {
    appEnv = "production";
    const response = verifyRunnerSecretOrDeny(requestWithSecret(undefined));
    expect(response?.status).toBe(503);
    const body = (await response?.json()) as { error: string };
    expect(body.error).toBe("Runner secret not configured");
  });

  test("returns 401 when secret is wrong", async () => {
    runnerConfig.sharedSecret = "expected-secret";
    const response = verifyRunnerSecretOrDeny(requestWithSecret("wrong-secret"));
    expect(response?.status).toBe(401);
    const body = (await response?.json()) as { error: string };
    expect(body.error).toBe("Unauthorized");
  });

  test("allows requests with matching secret", () => {
    runnerConfig.sharedSecret = "expected-secret";
    expect(verifyRunnerSecretOrDeny(requestWithSecret("expected-secret"))).toBeNull();
  });
});
