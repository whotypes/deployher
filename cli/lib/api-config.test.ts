import { describe, expect, test } from "bun:test";
import { parseManagedCliConfig } from "./api-config";

describe("parseManagedCliConfig", () => {
  test("parses valid JSON", () => {
    const r = parseManagedCliConfig(
      JSON.stringify({
        version: 1,
        apiBaseUrl: "https://app.example.com",
        accessToken: "token-abc"
      })
    );
    expect(r).toEqual({
      version: 1,
      apiBaseUrl: "https://app.example.com",
      accessToken: "token-abc"
    });
  });

  test("normalizes api base url", () => {
    const r = parseManagedCliConfig(
      JSON.stringify({
        version: 1,
        apiBaseUrl: "http://localhost:3000/",
        accessToken: "t"
      })
    );
    expect(r?.apiBaseUrl).toBe("http://localhost:3000");
  });

  test("rejects wrong version", () => {
    expect(parseManagedCliConfig(JSON.stringify({ version: 2, apiBaseUrl: "https://a", accessToken: "t" }))).toBe(
      null
    );
  });
});
