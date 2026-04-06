import { beforeEach, describe, expect, it, mock } from "bun:test";

const existingKeys = new Set<string>();
const storedJson = new Map<string, unknown>();
let currentDeployment: Record<string, unknown> | null = null;
const runnerConfig = {
  previewEnabled: false,
  url: undefined as string | undefined,
  sharedSecret: undefined as string | undefined
};

const mockBuildConfig = {
  workers: 2,
  accountMaxConcurrent: 1,
  accountSlotTtlSeconds: 21600,
  repoCredentialTtlSeconds: 3600,
  reclaimIdleMs: 5000,
  pendingHeartbeatMs: 30000
} as const;

mock.module("../config", () => ({
  config: {
    env: "development",
    devDomain: "localhost",
    prodDomain: "localhost",
    devProtocol: "http",
    prodProtocol: "https",
    port: 3001,
    auth: {
      url: undefined as string | undefined
    },
    build: mockBuildConfig,
    preview: {
      assetBaseUrl: "https://assets.example.test"
    },
    runner: runnerConfig,
    observability: {
      previewTrafficSampleRate: 0,
      trustProxy: false
    },
    redis: {
      url: undefined
    }
  },
  getDevBaseUrl: () => "http://localhost:3001",
  getProdBaseUrl: () => "http://localhost:3000",
  getAuthBaseUrl: () => "http://localhost:3001",
  getTrustedAppOrigins: () => ["http://localhost:3001"],
  getDevProjectUrlPattern: () => "http://{project}.localhost:3001",
  getProdProjectUrlPattern: () => "https://{project}.localhost",
  buildDevSubdomainUrl: (label: string) => `http://${label}.localhost:3001`,
  resolveProjectDomains: (project: { id: string; name: string }) => ({
    dev: `http://${project.id}.localhost:3001`,
    prod: `https://${project.id}.localhost`
  })
}));

mock.module("../db/db", () => ({
  db: {
    select() {
      return this;
    },
    from() {
      return this;
    },
    where() {
      return this;
    },
    limit: async () => (currentDeployment ? [currentDeployment] : [])
  }
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

const {
  buildSubdomainPreviewUrl,
  resolvePreviewAssetPathForStrategy,
  serveDeploymentAsset,
  serveSubdomainPreview
} = await import("./preview");

const deployment = {
  artifactPrefix: "artifacts/deployment-1"
} as never;

describe("resolvePreviewAssetPathForStrategy", () => {
  it("maps empty path to index.html for static previews", () => {
    expect(resolvePreviewAssetPathForStrategy("", "static")).toBe("index.html");
    expect(resolvePreviewAssetPathForStrategy("", null)).toBe("index.html");
  });

  it("maps empty path to empty string for server previews (Next.js serves / not /index.html)", () => {
    expect(resolvePreviewAssetPathForStrategy("", "server")).toBe("");
  });

  it("preserves non-empty paths", () => {
    expect(resolvePreviewAssetPathForStrategy("_next/static/chunk.js", "server")).toBe(
      "_next/static/chunk.js"
    );
  });
});

describe("serveDeploymentAsset", () => {
  beforeEach(() => {
    existingKeys.clear();
    storedJson.clear();
    currentDeployment = null;
    runnerConfig.previewEnabled = false;
    runnerConfig.url = undefined;
    runnerConfig.sharedSecret = undefined;
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

  it("returns 503 for server previews that have no runtime image", async () => {
    runnerConfig.previewEnabled = true;
    runnerConfig.url = "http://runner.internal";
    currentDeployment = {
      id: "94c2f168-7f58-4042-ae62-9d1837cb67d3",
      shortId: "2vp09bk3m",
      status: "success",
      serveStrategy: "server",
      buildServerPreviewTarget: "isolated-runner",
      runtimeImagePullRef: null,
      runtimeImageArtifactKey: null,
      runtimeConfig: {
        port: 3000,
        command: []
      },
      artifactPrefix: "artifacts/test"
    };

    const response = await serveSubdomainPreview(
      new Request("http://2vp09bk3m.localhost:3001/"),
      { id: "2vp09bk3m", isShortId: true }
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "No runtime image is available for this deployment"
    });
  });
});
