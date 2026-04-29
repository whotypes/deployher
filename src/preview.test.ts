import { describe, expect, test } from "bun:test";
import {
  assertAllowedPullRef,
  buildRuntimeImageTagOnly,
  type PreviewRuntimeRegistryConfig
} from "./preview";

const sampleCfg = (overrides: Partial<PreviewRuntimeRegistryConfig> = {}): PreviewRuntimeRegistryConfig => ({
  registryHost: "nexus:8082",
  dockerRepo: "docker-hosted",
  imageName: "deployher-preview-runtime",
  allowedPullRefPrefix: "nexus:8082/docker-hosted/deployher-preview-runtime@",
  ...overrides
});

describe("assertAllowedPullRef", () => {
  test("accepts ref under configured prefix with valid digest", () => {
    const cfg = sampleCfg();
    const ref =
      "nexus:8082/docker-hosted/deployher-preview-runtime@sha256:" +
      "a".repeat(64);
    expect(() => assertAllowedPullRef(ref, cfg)).not.toThrow();
  });

  test("accepts 127.0.0.1 when configured with localhost (loopback alias)", () => {
    const cfg = sampleCfg({
      registryHost: "localhost:8082",
      allowedPullRefPrefix: "localhost:8082/docker-hosted/deployher-preview-runtime@"
    });
    const ref =
      "127.0.0.1:8082/docker-hosted/deployher-preview-runtime@sha256:" + "a".repeat(64);
    expect(() => assertAllowedPullRef(ref, cfg)).not.toThrow();
  });

  test("accepts localhost when prefix was built from 127.0.0.1 registry host", () => {
    const cfg = sampleCfg({
      registryHost: "127.0.0.1:8082",
      allowedPullRefPrefix: "127.0.0.1:8082/docker-hosted/deployher-preview-runtime@"
    });
    const ref =
      "localhost:8082/docker-hosted/deployher-preview-runtime@sha256:" + "a".repeat(64);
    expect(() => assertAllowedPullRef(ref, cfg)).not.toThrow();
  });

  test("rejects wrong registry", () => {
    const cfg = sampleCfg();
    const ref =
      "evil.example/docker-hosted/deployher-preview-runtime@sha256:" + "b".repeat(64);
    expect(() => assertAllowedPullRef(ref, cfg)).toThrow(
      /not under the configured preview registry/
    );
  });

  test("rejects missing digest", () => {
    const cfg = sampleCfg();
    expect(() => assertAllowedPullRef("nexus:8082/docker-hosted/deployher-preview-runtime:latest", cfg)).toThrow(
      /sha256/
    );
  });

  test("rejects malformed digest length", () => {
    const cfg = sampleCfg();
    const ref = "nexus:8082/docker-hosted/deployher-preview-runtime@sha256:abc";
    expect(() => assertAllowedPullRef(ref, cfg)).toThrow(/invalid digest/);
  });

  test("rejects empty registry host", () => {
    const cfg = sampleCfg({ registryHost: "", allowedPullRefPrefix: "/docker-hosted/deployher-preview-runtime@" });
    const ref =
      "/docker-hosted/deployher-preview-runtime@sha256:" + "c".repeat(64);
    expect(() => assertAllowedPullRef(ref, cfg)).toThrow(/must be configured/);
  });
});

describe("buildRuntimeImageTagOnly", () => {
  test("builds tag path", () => {
    const cfg = sampleCfg();
    expect(buildRuntimeImageTagOnly(cfg, "550e8400-e29b-41d4-a716-446655440000")).toBe(
      "nexus:8082/docker-hosted/deployher-preview-runtime:550e8400-e29b-41d4-a716-446655440000"
    );
  });
});
