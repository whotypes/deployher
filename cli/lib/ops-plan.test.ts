import { describe, expect, test } from "bun:test";
import {
  defaultServicesForEnvKeys,
  inferOpsEnvironment,
  parseOpsEnvironment,
  parseServiceList,
  summarizeEnvDiffs,
} from "./ops-plan";

describe("parseOpsEnvironment", () => {
  test("maps local and production aliases", () => {
    expect(parseOpsEnvironment("development")).toBe("local");
    expect(parseOpsEnvironment("prod")).toBe("production");
    expect(parseOpsEnvironment("wat")).toBeNull();
  });
});

describe("inferOpsEnvironment", () => {
  test("infers from APP_ENV", () => {
    expect(inferOpsEnvironment("production")).toBe("production");
    expect(inferOpsEnvironment("development")).toBe("local");
  });
});

describe("parseServiceList", () => {
  test("parses comma separated services", () => {
    expect(parseServiceList("app-api, edge,,deployment-worker")).toEqual([
      "app-api",
      "edge",
      "deployment-worker",
    ]);
  });
});

describe("defaultServicesForEnvKeys", () => {
  test("uses app services by default", () => {
    expect(defaultServicesForEnvKeys(["S3_BUCKET"])).toEqual([
      "app-api",
      "marketing",
      "edge",
      "deployment-worker",
    ]);
  });

  test("adds builder services for runtime image keys", () => {
    expect(defaultServicesForEnvKeys(["PREVIEW_RUNTIME_REGISTRY"])).toEqual([
      "node-build-image",
      "bun-build-image",
      "app-api",
      "marketing",
      "edge",
      "deployment-worker",
    ]);
  });
});

describe("summarizeEnvDiffs", () => {
  test("masks sensitive values", () => {
    expect(
      summarizeEnvDiffs([
        { key: "BETTER_AUTH_SECRET", before: undefined, after: "secret", type: "set" },
        { key: "GITHUB_CLIENT_ID", before: "old", after: "new", type: "set" },
      ]),
    ).toEqual(["BETTER_AUTH_SECRET: (unset) -> (set)", "GITHUB_CLIENT_ID: old -> new"]);
  });
});

