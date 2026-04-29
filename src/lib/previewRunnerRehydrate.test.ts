import { describe, expect, it } from "bun:test";
import { normalizeRuntimeConfigForRunner } from "./previewRunnerRehydrate";

describe("normalizeRuntimeConfigForRunner", () => {
  it("passes runtime env through to the preview runner payload", () => {
    expect(
      normalizeRuntimeConfigForRunner({
        port: 3000,
        command: ["./start-all.sh"],
        env: { DISCORD_TOKEN: "secret-token", OTHER: "x" }
      })
    ).toEqual({
      port: 3000,
      command: ["./start-all.sh"],
      env: { DISCORD_TOKEN: "secret-token", OTHER: "x" }
    });
  });

  it("omits empty env objects", () => {
    expect(normalizeRuntimeConfigForRunner({ port: 8080, command: [], env: {} })).toEqual({
      port: 8080,
      command: []
    });
  });

  it("defaults port and command when missing", () => {
    expect(normalizeRuntimeConfigForRunner(null)).toEqual({ port: 3000, command: [] });
  });
});
