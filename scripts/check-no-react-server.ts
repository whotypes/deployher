#!/usr/bin/env bun
/**
 * Ensures Bun server code paths do not import React or SSR streaming APIs.
 * Excludes Vite client (`src/spa/**`), tests, and type stubs.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

const root = path.join(import.meta.dir, "..");
const srcDir = path.join(root, "src");

const FORBIDDEN = [
  /from\s+["']react["']/,
  /from\s+["']react-dom["']/,
  /from\s+["']react-dom\//,
  /react-dom\/server/,
  /renderToReadableStream/,
  /renderToString/,
  /renderToStaticMarkup/
];

const shouldSkip = (rel: string): boolean => {
  if (rel.startsWith("spa/")) return true;
  if (rel.endsWith(".test.ts")) return true;
  if (rel === "vite-env.d.ts") return true;
  return false;
};

async function* walk(dir: string, baseRel = ""): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = baseRel ? `${baseRel}/${e.name}` : e.name;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full, rel);
    } else if (e.isFile() && e.name.endsWith(".ts") && !e.name.endsWith(".tsx")) {
      if (!shouldSkip(rel)) {
        yield full;
      }
    }
  }
}

let failed = false;
for await (const file of walk(srcDir)) {
  const text = await Bun.file(file).text();
  const rel = path.relative(root, file);
  for (const pattern of FORBIDDEN) {
    if (pattern.test(text)) {
      console.error(`${rel}: forbidden pattern ${pattern}`);
      failed = true;
    }
  }
}

if (failed) {
  console.error("check-no-react-server: failed");
  process.exit(1);
}

console.log("check-no-react-server: ok");
