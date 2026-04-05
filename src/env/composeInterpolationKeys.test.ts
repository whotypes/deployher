import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";
import { COMPOSE_INTERPOLATION_KEYS } from "./composeInterpolationKeys";

const extractInterpolationKeys = (yaml: string): string[] => {
  const re = /\$\{([A-Za-z_][A-Za-z0-9_]*)/g;
  const set = new Set<string>();
  let match = re.exec(yaml);
  while (match !== null) {
    const key = match[1];
    if (key !== undefined) {
      set.add(key);
    }
    match = re.exec(yaml);
  }
  return [...set].sort();
};

describe("compose interpolation drift guard", () => {
  test("COMPOSE_INTERPOLATION_KEYS matches docker-compose.yml ${VAR} references", () => {
    const composePath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "docker-compose.yml");
    const yaml = readFileSync(composePath, "utf8");
    const fromCompose = extractInterpolationKeys(yaml);
    const fromModule: string[] = [...COMPOSE_INTERPOLATION_KEYS].sort();
    expect(fromModule).toEqual(fromCompose);
  });
});
