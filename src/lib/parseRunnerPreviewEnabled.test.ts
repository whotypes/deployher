import { describe, expect, it } from "bun:test";
import { parseRunnerPreviewEnabled } from "./parseRunnerPreviewEnabled";

describe("parseRunnerPreviewEnabled", () => {
  it("is true when RUNNER_URL is set and flag is empty", () => {
    expect(parseRunnerPreviewEnabled(undefined, "http://127.0.0.1:8787")).toBe(true);
    expect(parseRunnerPreviewEnabled("", "http://preview-runner:8787")).toBe(true);
  });

  it("is false when URL is empty and flag is empty", () => {
    expect(parseRunnerPreviewEnabled(undefined, undefined)).toBe(false);
    expect(parseRunnerPreviewEnabled("", "")).toBe(false);
  });

  it("respects explicit opt-out with URL present", () => {
    expect(parseRunnerPreviewEnabled("0", "http://127.0.0.1:8787")).toBe(false);
    expect(parseRunnerPreviewEnabled("false", "http://127.0.0.1:8787")).toBe(false);
  });

  it("respects explicit opt-in", () => {
    expect(parseRunnerPreviewEnabled("1", undefined)).toBe(true);
  });
});
