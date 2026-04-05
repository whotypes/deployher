import { describe, expect, test } from "bun:test";
import {
  filterGarageTimestampLines,
  parseGarageCapacity,
  parseGarageNodeId,
  randomHex,
} from "./garage";

describe("randomHex", () => {
  test("produces expected length", () => {
    expect(randomHex(32)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseGarageNodeId", () => {
  test("extracts 16-char hex id from first column", () => {
    const out = `abcd1234ef567890  dc1  1.0 GB`;
    expect(parseGarageNodeId(out)).toBe("abcd1234ef567890");
  });

  test("returns undefined when missing", () => {
    expect(parseGarageNodeId("no node here")).toBeUndefined();
  });
});

describe("parseGarageCapacity", () => {
  test("extracts capacity from status line", () => {
    const out = `abcd1234ef567890  dc1  1.2 GB`;
    expect(parseGarageCapacity(out)).toBe("1.2 GB");
  });
});

describe("filterGarageTimestampLines", () => {
  test("removes ISO-timestamp-prefixed lines", () => {
    const raw = `2024-01-01T00:00:00Z noise\nhello\n`;
    expect(filterGarageTimestampLines(raw).trim()).toBe("hello");
  });
});
