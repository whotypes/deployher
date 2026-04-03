import { beforeEach, describe, expect, it, mock } from "bun:test";

const existingKeys = new Set<string>();
const storedJson = new Map<string, unknown>();

mock.module("../config", () => ({
  config: {
    devDomain: "localhost",
    prodDomain: "localhost",
    devProtocol: "http",
    prodProtocol: "https",
    port: 3001,
    preview: {
      assetBaseUrl: "https://assets.example.test"
    },
    runner: {
      previewEnabled: false,
      url: undefined,
      trustedLocalDocker: false,
      sharedSecret: undefined
    },
    redis: {
      url: undefined
    }
  },
  buildDevSubdomainUrl: (label: string) => `http://${label}.localhost:3001`
}));

mock.module("../previewRuntime", () => ({
  ensureTrustedLocalPreviewContainer: async () => ({ baseUrl: "http://127.0.0.1:3000" })
}));

mock.module("../db/db", () => ({
  db: {}
}));

mock.module("../redis", () => ({
  getRedisClient: async () => null
}));

mock.module("../storage", () => ({
  exists: async (key: string) => existingKeys.has(key),
  getJson: async <T>(key: string) => storedJson.get(key) as T,
  getStream: (key: string) => new Response(`body:${key}`).body as ReadableStream<Uint8Array>,
  isStorageConfigured: () => true,
  presign: (key: string) => `https://signed.example.test/${key}`
}));

const { buildSubdomainPreviewUrl, serveDeploymentAsset } = await import("./preview");

const deployment = {
  artifactPrefix: "artifacts/deployment-1"
} as never;

describe("serveDeploymentAsset", () => {
  beforeEach(() => {
    existingKeys.clear();
    storedJson.clear();
  });

  it("serves root index.html for /", async () => {
    existingKeys.add("artifacts/deployment-1/index.html");

    const response = await serveDeploymentAsset(deployment, "index.html");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("body:artifacts/deployment-1/index.html");
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
  });

  it("serves nested directory index.html when the path has no extension", async () => {
    existingKeys.add("artifacts/deployment-1/docs/index.html");

    const response = await serveDeploymentAsset(deployment, "docs");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("body:artifacts/deployment-1/docs/index.html");
  });

  it("falls back to root index.html for unknown non-file routes", async () => {
    existingKeys.add("artifacts/deployment-1/index.html");

    const response = await serveDeploymentAsset(deployment, "missing-route");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("body:artifacts/deployment-1/index.html");
  });

  it("redirects asset requests directly when a preview manifest is present", async () => {
    storedJson.set("artifacts/deployment-1/preview-manifest.json", {
      version: 1,
      generatedAt: new Date().toISOString(),
      artifactPrefix: "artifacts/deployment-1",
      rootIndexPath: "index.html",
      spaFallbackPath: "index.html",
      directoryIndexes: {},
      entries: {
        "assets/app.12345678.js": {
          path: "assets/app.12345678.js",
          key: "artifacts/deployment-1/assets/app.12345678.js",
          contentType: "application/javascript; charset=utf-8",
          cacheClass: "immutable",
          cacheControl: "public, max-age=31536000, immutable"
        }
      }
    });

    const response = await serveDeploymentAsset(
      {
        id: "deployment-1",
        artifactPrefix: "artifacts/deployment-1",
        previewManifestKey: "artifacts/deployment-1/preview-manifest.json"
      } as never,
      "assets/app.12345678.js"
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(
      "https://assets.example.test/artifacts/deployment-1/assets/app.12345678.js"
    );
  });

  it("builds preview URLs with the configured port", () => {
    expect(buildSubdomainPreviewUrl("abc123def4")).toBe("http://abc123def4.localhost:3001");
  });
});
