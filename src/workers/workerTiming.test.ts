import { describe, expect, it } from "bun:test";
import { getEffectivePendingHeartbeatMs, hasFreshWorkerHeartbeat } from "./workerTiming";

describe("worker timing helpers", () => {
  it("caps heartbeat to half the reclaim window", () => {
    expect(getEffectivePendingHeartbeatMs(5000, 30000)).toBe(2500);
    expect(getEffectivePendingHeartbeatMs(30000, 5000)).toBe(5000);
  });

  it("detects fresh worker heartbeats within the reclaim window", () => {
    const now = Date.UTC(2026, 2, 30, 12, 0, 0);
    expect(hasFreshWorkerHeartbeat(new Date(now - 4000), 5000, now)).toBe(true);
    expect(hasFreshWorkerHeartbeat(new Date(now - 6000), 5000, now)).toBe(false);
    expect(hasFreshWorkerHeartbeat(null, 5000, now)).toBe(false);
  });
});
