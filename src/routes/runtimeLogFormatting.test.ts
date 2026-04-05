import { describe, expect, it } from "bun:test";
import { formatRunnerRuntimeLogError } from "./runtimeLogFormatting";

describe("formatRunnerRuntimeLogError", () => {
  it("formats structured startup failure payloads", async () => {
    const response = new Response(
      JSON.stringify({
        error: "Preview startup failed while trying to keep the preview container running during startup.",
        deploymentId: "dep-1",
        stage: "exited",
        exitCode: 1,
        logs: "boom\ntrace"
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" }
      }
    );

    const message = await formatRunnerRuntimeLogError(response);

    expect(message).toContain("Preview startup failed");
    expect(message).toContain("Exit code: 1");
    expect(message).toContain("Startup logs:");
    expect(message).toContain("boom");
  });

  it("keeps the no-active-container message for 404 responses", async () => {
    const message = await formatRunnerRuntimeLogError(
      new Response("No running preview container for this deployment.", { status: 404 })
    );

    expect(message).toContain("No active preview container");
  });

  it("falls back to plain text for non-json runner errors", async () => {
    const message = await formatRunnerRuntimeLogError(
      new Response("Upstream preview failed", { status: 502 })
    );

    expect(message).toBe("Upstream preview failed");
  });
});
