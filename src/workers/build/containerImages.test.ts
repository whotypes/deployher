import { describe, expect, test } from "bun:test";
import { resolveBuildContainerImage } from "./containerImages";

describe("resolveBuildContainerImage", () => {
  test("uses explicit BUILD_*_IMAGE", () => {
    expect(
      resolveBuildContainerImage("bun", {
        BUILD_BUN_IMAGE: "registry.example/bun:custom"
      })
    ).toBe("registry.example/bun:custom");
  });

  test("uses legacy BUILD_*_BUILDER_IMAGE for node and bun", () => {
    expect(
      resolveBuildContainerImage("node", {
        BUILD_NODE_BUILDER_IMAGE: "legacy-node:latest"
      })
    ).toBe("legacy-node:latest");
    expect(
      resolveBuildContainerImage("bun", {
        BUILD_BUN_BUILDER_IMAGE: "legacy-bun:latest"
      })
    ).toBe("legacy-bun:latest");
  });

  test("explicit BUILD_*_IMAGE wins over legacy", () => {
    expect(
      resolveBuildContainerImage("bun", {
        BUILD_BUN_IMAGE: "a/b:latest",
        BUILD_BUN_BUILDER_IMAGE: "ignored:latest"
      })
    ).toBe("a/b:latest");
  });

  test("prefixes with BUILD_IMAGE_REGISTRY when set", () => {
    const env = { BUILD_IMAGE_REGISTRY: "localhost:8082" };
    expect(resolveBuildContainerImage("bun", env)).toBe(
      "localhost:8082/deployher-bun-build-image:latest"
    );
    expect(resolveBuildContainerImage("node", env)).toBe(
      "localhost:8082/deployher-node-build-image:latest"
    );
    expect(resolveBuildContainerImage("python", env)).toBe(
      "localhost:8082/python:3.12-bookworm"
    );
  });

  test("strips trailing slashes and http(s) scheme from registry", () => {
    expect(
      resolveBuildContainerImage("bun", {
        BUILD_IMAGE_REGISTRY: "https://reg.example/v1/"
      })
    ).toBe("reg.example/v1/deployher-bun-build-image:latest");
  });

  test("defaults to local-style names when registry unset", () => {
    expect(resolveBuildContainerImage("bun", {})).toBe("deployher-bun-build-image:latest");
    expect(resolveBuildContainerImage("node", {})).toBe("deployher-node-build-image:latest");
    expect(resolveBuildContainerImage("python", {})).toBe("python:3.12-bookworm");
  });

  test("explicit image wins over BUILD_IMAGE_REGISTRY", () => {
    expect(
      resolveBuildContainerImage("node", {
        BUILD_IMAGE_REGISTRY: "localhost:8082",
        BUILD_NODE_IMAGE: "plain:node"
      })
    ).toBe("plain:node");
  });
});
