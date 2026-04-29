import { describe, expect, test } from "bun:test";
import { requestUsesCliBearerAuth } from "./cliAuth";

describe("requestUsesCliBearerAuth", () => {
  test("matches Bearer header", () => {
    expect(
      requestUsesCliBearerAuth(new Request("http://localhost/api/x", { headers: { authorization: "Bearer abc" } }))
    ).toBe(true);
    expect(
      requestUsesCliBearerAuth(
        new Request("http://localhost/api/x", { headers: { Authorization: "bearer xyz" } })
      )
    ).toBe(true);
  });

  test("false for missing or short header", () => {
    expect(requestUsesCliBearerAuth(new Request("http://localhost/api/x"))).toBe(false);
    expect(
      requestUsesCliBearerAuth(new Request("http://localhost/api/x", { headers: { authorization: "Bearer" } }))
    ).toBe(false);
  });
});
