import { describe, expect, it } from "bun:test";
import { strToU8, zipSync } from "fflate";
import {
  computeRepoLocsFromZipBuffer,
  countLinesInBytes,
  parsePathFilter,
  pathPassesFilter
} from "./githubRepoLocs";

describe("countLinesInBytes", () => {
  it("counts physical lines", () => {
    expect(countLinesInBytes(strToU8(""))).toBe(0);
    expect(countLinesInBytes(strToU8("a"))).toBe(1);
    expect(countLinesInBytes(strToU8("a\nb"))).toBe(2);
    expect(countLinesInBytes(strToU8("a\nb\n"))).toBe(2);
  });
});

describe("parsePathFilter and pathPassesFilter", () => {
  it("applies include and exclude tokens", () => {
    const p = parsePathFilter(".ts$,!test");
    expect(pathPassesFilter("src/x.ts", p)).toBe(true);
    expect(pathPassesFilter("src/test.ts", p)).toBe(false);
  });

  it("supports prefix includes", () => {
    const p = parsePathFilter("^src/");
    expect(pathPassesFilter("src/a.ts", p)).toBe(true);
    expect(pathPassesFilter("lib/b.ts", p)).toBe(false);
  });
});

describe("computeRepoLocsFromZipBuffer", () => {
  it("strips zip root and skips node_modules", () => {
    const zipped = zipSync({
      "r-abc/src/a.ts": strToU8("line1\nline2\n"),
      "r-abc/node_modules/x.js": strToU8("zzz\n")
    });
    const res = computeRepoLocsFromZipBuffer(zipped, {
      projectRoot: "",
      filter: ""
    });
    expect(res.truncated).toBe(false);
    expect(res.locs.loc).toBe(2);
    expect(res.locs.children?.src).toBeDefined();
    const src = res.locs.children?.src;
    expect(typeof src === "object" && src !== null && "loc" in src && src.loc).toBe(2);
  });

  it("scopes to project root", () => {
    const zipped = zipSync({
      "r-abc/apps/web/x.ts": strToU8("a\n"),
      "r-abc/apps/other/y.ts": strToU8("b\nc\n")
    });
    const res = computeRepoLocsFromZipBuffer(zipped, {
      projectRoot: "apps/web",
      filter: ""
    });
    expect(res.locs.loc).toBe(1);
    expect(res.locs.children?.["x.ts"]).toBe(1);
  });

  it("includes public and static binary assets at 0 LOC", () => {
    const zipped = zipSync({
      "r-abc/src/a.ts": strToU8("x\n"),
      "r-abc/public/demo/og.webp": new Uint8Array([0x52, 0x49, 0x46, 0x46]),
      "r-abc/static/hero.png": new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      "r-abc/src/asset.png": strToU8("not-in-public\n")
    });
    const res = computeRepoLocsFromZipBuffer(zipped, {
      projectRoot: "",
      filter: ""
    });
    expect(res.locs.children?.public).toBeDefined();
    const pub = res.locs.children?.public;
    expect(typeof pub === "object" && pub !== null && "children" in pub && pub.children?.demo).toBeDefined();
    const demo = pub && typeof pub === "object" && "children" in pub ? pub.children?.demo : undefined;
    expect(typeof demo === "object" && demo !== null && "children" in demo && demo.children?.["og.webp"]).toBe(0);

    expect(res.locs.children?.static).toBeDefined();
    const st = res.locs.children?.static;
    expect(
      typeof st === "object" && st !== null && "children" in st && st.children?.["hero.png"]
    ).toBe(0);

    expect(res.locs.children?.src).toBeDefined();
    expect(res.locs.children?.src).toMatchObject({
      loc: 1,
      children: { "a.ts": 1 }
    });
  });

  it("includes oversized public binary assets in the tree", () => {
    const big = new Uint8Array(512 * 1024 + 1024);
    big[0] = 0xff;
    big[1] = 0xd8;
    const zipped = zipSync({
      "r-abc/public/huge.jpg": big
    });
    const res = computeRepoLocsFromZipBuffer(zipped, {
      projectRoot: "",
      filter: ""
    });
    expect(res.locs.children?.public).toBeDefined();
    const pub = res.locs.children?.public;
    expect(
      typeof pub === "object" && pub !== null && "children" in pub && pub.children?.["huge.jpg"]
    ).toBe(0);
  });
});
