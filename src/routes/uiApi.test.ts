import { beforeAll, describe, expect, test } from "bun:test";
import { setStartedAt } from "../appContext";
import { getHealthApi } from "./uiApi";

describe("uiApi", () => {
  beforeAll(() => {
    setStartedAt(Date.now());
  });

  test("getHealthApi returns JSON with status", async () => {
    const res = getHealthApi();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(["ok", "degraded", "down"]).toContain(body.status);
  });
});
