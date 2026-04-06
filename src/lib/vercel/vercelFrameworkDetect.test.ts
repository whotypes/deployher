import { describe, expect, it } from "bun:test";
import {
  mapVercelFrameworkToDeployher,
  mergeVercelAndLegacyHints,
  STATIC_SITE_PRIMARY_FRAMEWORK
} from "./mapFrameworkToDeployher";
import { detectFrameworkFromFileContents } from "./runFrameworkDetection";
import { inferRepoFrameworkHints } from "../repoFrameworkHints";

describe("detectFrameworkFromFileContents", () => {
  it("detects Next.js from package.json only", async () => {
    const record = await detectFrameworkFromFileContents({
      "package.json": JSON.stringify({
        name: "app",
        dependencies: { next: "15.0.0", react: "19.0.0" }
      })
    });
    expect(record?.slug).toBe("nextjs");
    expect(record?.name).toContain("Next");
  });

  it("detects Python from requirements.txt like Vercel framework list", async () => {
    const record = await detectFrameworkFromFileContents({
      "requirements.txt": "mkdocs-material\n"
    });
    expect(record?.slug).toBe("python");
    expect(record?.name).toBe("Python");
  });
});

describe("mapVercelFrameworkToDeployher", () => {
  it("suggests server preview for Next without build script", () => {
    const mapped = mapVercelFrameworkToDeployher(
      {
        name: "Next.js",
        slug: "nextjs",
        logo: "https://example.com/n.svg",
        description: "x",
        settings: {
          installCommand: { placeholder: "" },
          buildCommand: { value: "next build" },
          devCommand: { value: "next dev" },
          outputDirectory: { placeholder: "" }
        },
        getOutputDirName: async () => "out"
      } as Parameters<typeof mapVercelFrameworkToDeployher>[0],
      { scripts: { dev: "next dev" } }
    );
    expect(mapped.suggestedFrameworkHint).toBe("nextjs");
    expect(mapped.suggestedPreviewMode).toBe("server");
    expect(mapped.warnings.length).toBeGreaterThan(0);
  });

  it("merges legacy python with vercel absence", () => {
    const legacy = inferRepoFrameworkHints(null, {
      pyprojectToml: "[project]\nname = \"docs\"\n"
    });
    const vercel = mapVercelFrameworkToDeployher(null, null);
    const merged = mergeVercelAndLegacyHints(vercel, legacy, false);
    expect(merged.suggestedFrameworkHint).toBe("python");
    expect(merged.primaryFramework).toBeNull();
  });

  it("merges legacy static site with vercel absence and supplies primary logo", () => {
    const legacy = inferRepoFrameworkHints(null, {
      staticHtmlScan: {
        indexHtml: "<!doctype html>",
        publicIndexHtml: null,
        distIndexHtml: null,
        buildIndexHtml: null
      }
    });
    const vercel = mapVercelFrameworkToDeployher(null, null);
    const merged = mergeVercelAndLegacyHints(vercel, legacy, false);
    expect(merged.suggestedFrameworkHint).toBe("static");
    expect(merged.primaryFramework).toEqual(STATIC_SITE_PRIMARY_FRAMEWORK);
  });
});
