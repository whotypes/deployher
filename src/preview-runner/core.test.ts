import { beforeEach, describe, expect, it, mock } from "bun:test";
import {
  ensurePreviewContainerWithDeps,
  PREVIEW_PROJECT_LABEL,
  PreviewStartupError,
  type RuntimeConfig
} from "./core";

type FakeInspect = {
  State?: { Running?: boolean; ExitCode?: number };
  Config?: { Labels?: Record<string, string> };
  NetworkSettings?: { Networks?: Record<string, { IPAddress?: string | null }> };
  Name?: string;
};

type LogsCallback = (err: Error | null, result?: Buffer | NodeJS.ReadableStream) => void;

const runtimeConfig: RuntimeConfig = {
  port: 3000,
  command: ["node", "server.js"],
  workingDir: "/workspace"
};

const futureExpiry = String(Date.now() + 60_000);

describe("ensurePreviewContainerWithDeps", () => {
  let removed: string[];
  let createCalled: number;
  let lastCreateOptions: Record<string, unknown> | null;

  beforeEach(() => {
    removed = [];
    createCalled = 0;
    lastCreateOptions = null;
  });

  it("reuses an existing running and ready container", async () => {
    const inspect: FakeInspect = {
      State: { Running: true },
      Config: { Labels: { "io.deployher.preview.expires_at": futureExpiry } },
      NetworkSettings: { Networks: { "deployher_default": { IPAddress: "172.20.0.10" } } },
      Name: "/deployher-preview-existing"
    };

    const result = await ensurePreviewContainerWithDeps(
      {
        deploymentId: "dep-1",
        runtimeConfig,
        ttlMs: 30_000,
        memoryBytes: 1024,
        nanoCpus: 1_000_000_000,
        dockerNetwork: "deployher_default"
      },
      {
        dockerClient: {
          listContainers: async () => [{ Id: "existing-1" }],
          getContainer: () => ({
            inspect: async () => inspect as never,
            start: async () => {},
            logs: (_opts: unknown, cb: LogsCallback) => cb(null, Buffer.from(""))
          }),
          createContainer: async () => {
            createCalled += 1;
            throw new Error("should not create");
          }
        },
        pruneExpiredPreviewContainers: async () => {},
        removeContainerIfExists: async (id) => {
          removed.push(id);
        },
        resolvePreviewImageId: async () => "image:latest",
        sanitizeLabelValue: (value) => value,
        waitForHttp: async () => true,
        getContainerHost: (value) =>
          value.NetworkSettings?.Networks?.["deployher_default"]?.IPAddress ?? null
      }
    );

    expect(result).toEqual({ upstreamBase: "http://172.20.0.10:3000" });
    expect(createCalled).toBe(0);
    expect(removed).toEqual([]);
  });

  it("removes a dead prior container before creating a new one", async () => {
    const staleInspect: FakeInspect = {
      State: { Running: false, ExitCode: 1 },
      Config: { Labels: { "io.deployher.preview.expires_at": futureExpiry } },
      NetworkSettings: { Networks: { "deployher_default": { IPAddress: "172.20.0.11" } } },
      Name: "/deployher-preview-stale"
    };
    const freshInspect: FakeInspect = {
      State: { Running: true },
      Config: { Labels: { "io.deployher.preview.expires_at": futureExpiry } },
      NetworkSettings: { Networks: { "deployher_default": { IPAddress: "172.20.0.12" } } },
      Name: "/deployher-preview-fresh"
    };

    const result = await ensurePreviewContainerWithDeps(
      {
        deploymentId: "dep-2",
        runtimeConfig,
        ttlMs: 30_000,
        memoryBytes: 1024,
        nanoCpus: 1_000_000_000,
        dockerNetwork: "deployher_default"
      },
      {
        dockerClient: {
          listContainers: async () => [{ Id: "stale-1" }],
          getContainer: () => ({
            inspect: async () => staleInspect as never,
            start: async () => {},
            logs: (_opts: unknown, cb: LogsCallback) => cb(null, Buffer.from(""))
          }),
          createContainer: async (options: Record<string, unknown>) => {
            createCalled += 1;
            lastCreateOptions = options;
            return {
              id: "fresh-1",
              start: async () => {},
              inspect: async () => freshInspect as never,
              logs: (_opts: unknown, cb: LogsCallback) => cb(null, Buffer.from(""))
            };
          }
        },
        pruneExpiredPreviewContainers: async () => {},
        removeContainerIfExists: async (id) => {
          removed.push(id);
        },
        resolvePreviewImageId: async () => "image:latest",
        sanitizeLabelValue: (value) => value,
        waitForHttp: async () => true,
        getContainerHost: (value) =>
          value.NetworkSettings?.Networks?.["deployher_default"]?.IPAddress ?? null
      }
    );

    expect(removed).toEqual(["stale-1"]);
    expect(createCalled).toBe(1);
    expect(result).toEqual({ upstreamBase: "http://172.20.0.12:3000" });
    expect(lastCreateOptions?.["Env"]).toEqual(["PORT=3000"]);
  });

  it("throws a startup error when a new container never becomes ready", async () => {
    const firstInspect: FakeInspect = {
      State: { Running: true },
      Config: { Labels: { "io.deployher.preview.expires_at": futureExpiry } },
      NetworkSettings: { Networks: { "deployher_default": { IPAddress: "172.20.0.13" } } },
      Name: "/deployher-preview-failing"
    };
    const secondInspect: FakeInspect = {
      State: { Running: false, ExitCode: 1 },
      Config: { Labels: { "io.deployher.preview.expires_at": futureExpiry } },
      NetworkSettings: { Networks: { "deployher_default": { IPAddress: "172.20.0.13" } } },
      Name: "/deployher-preview-failing"
    };
    let inspectCall = 0;

    try {
      await ensurePreviewContainerWithDeps(
        {
          deploymentId: "dep-3",
          runtimeConfig,
          ttlMs: 30_000,
          memoryBytes: 1024,
          nanoCpus: 1_000_000_000,
          dockerNetwork: "deployher_default"
        },
        {
          dockerClient: {
            listContainers: async () => [],
            getContainer: () => {
              throw new Error("unused");
            },
            createContainer: async () => {
              createCalled += 1;
              return {
                id: "failing-1",
                start: async () => {},
                inspect: async () => (++inspectCall === 1 ? (firstInspect as never) : (secondInspect as never)),
                logs: (_opts: unknown, cb: LogsCallback) => cb(null, Buffer.from("boot failed\nline two"))
              };
            }
          },
          pruneExpiredPreviewContainers: async () => {},
          removeContainerIfExists: async (id) => {
            removed.push(id);
          },
          resolvePreviewImageId: async () => "image:latest",
          sanitizeLabelValue: (value) => value,
          waitForHttp: async () => false,
          getContainerHost: (value) =>
            value.NetworkSettings?.Networks?.["deployher_default"]?.IPAddress ?? null
        }
      );
      throw new Error("expected ensurePreviewContainerWithDeps to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PreviewStartupError);
      const details = (error as PreviewStartupError).details;
      expect(details.deploymentId).toBe("dep-3");
      expect(details.stage).toBe("exited");
      expect(details.exitCode).toBe(1);
      expect(details.logs).toContain("boot failed");
    }

    expect(createCalled).toBe(1);
    expect(removed).toEqual(["failing-1"]);
  });

  it("passes runtime-only env vars to the preview container without letting them override PORT", async () => {
    const freshInspect: FakeInspect = {
      State: { Running: true },
      Config: { Labels: { "io.deployher.preview.expires_at": futureExpiry } },
      NetworkSettings: { Networks: { "deployher_default": { IPAddress: "172.20.0.22" } } },
      Name: "/deployher-preview-fresh"
    };

    await ensurePreviewContainerWithDeps(
      {
        deploymentId: "dep-4",
        runtimeConfig: {
          ...runtimeConfig,
          env: {
            DATABASE_URL: "postgres://db.internal/app",
            NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: "base64-key",
            PORT: "9999"
          }
        },
        ttlMs: 30_000,
        memoryBytes: 1024,
        nanoCpus: 1_000_000_000,
        dockerNetwork: "deployher_default"
      },
      {
        dockerClient: {
          listContainers: async () => [],
          getContainer: () => {
            throw new Error("unused");
          },
          createContainer: async (options: Record<string, unknown>) => {
            lastCreateOptions = options;
            return {
              id: "fresh-2",
              start: async () => {},
              inspect: async () => freshInspect as never,
              logs: (_opts: unknown, cb: LogsCallback) => cb(null, Buffer.from(""))
            };
          }
        },
        pruneExpiredPreviewContainers: async () => {},
        removeContainerIfExists: async (id) => {
          removed.push(id);
        },
        resolvePreviewImageId: async () => "image:latest",
        sanitizeLabelValue: (value) => value,
        waitForHttp: async () => true,
        getContainerHost: (value) =>
          value.NetworkSettings?.Networks?.["deployher_default"]?.IPAddress ?? null
      }
    );

    expect(lastCreateOptions?.["Env"]).toEqual([
      "DATABASE_URL=postgres://db.internal/app",
      "NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=base64-key",
      "PORT=3000"
    ]);
  });

  it("removes other project preview containers before ensuring the requested deployment", async () => {
    const freshInspect: FakeInspect = {
      State: { Running: true },
      Config: { Labels: { "io.deployher.preview.expires_at": futureExpiry } },
      NetworkSettings: { Networks: { "deployher_default": { IPAddress: "172.20.0.30" } } },
      Name: "/deployher-preview-new"
    };

    let listCall = 0;
    await ensurePreviewContainerWithDeps(
      {
        deploymentId: "dep-new",
        projectId: "proj-1",
        runtimeConfig,
        ttlMs: 30_000,
        memoryBytes: 1024,
        nanoCpus: 1_000_000_000,
        dockerNetwork: "deployher_default"
      },
      {
        dockerClient: {
          listContainers: async (opts: { filters?: { label?: string[] } }) => {
            listCall += 1;
            const labels = opts.filters?.label ?? [];
            if (listCall === 1) {
              expect(labels.some((l) => l.includes(PREVIEW_PROJECT_LABEL))).toBe(true);
              return [
                {
                  Id: "sibling-old",
                  Labels: {
                    "io.deployher.preview.deployment": "dep-old"
                  }
                }
              ];
            }
            return [];
          },
          getContainer: () => {
            throw new Error("unused");
          },
          createContainer: async (options: Record<string, unknown>) => {
            lastCreateOptions = options;
            return {
              id: "fresh-proj",
              start: async () => {},
              inspect: async () => freshInspect as never,
              logs: (_opts: unknown, cb: LogsCallback) => cb(null, Buffer.from(""))
            };
          }
        },
        pruneExpiredPreviewContainers: async () => {},
        removeContainerIfExists: async (id) => {
          removed.push(id);
        },
        resolvePreviewImageId: async () => "image:latest",
        sanitizeLabelValue: (value) => value,
        waitForHttp: async () => true,
        getContainerHost: (value) =>
          value.NetworkSettings?.Networks?.["deployher_default"]?.IPAddress ?? null
      }
    );

    expect(removed).toEqual(["sibling-old"]);
    const createLabels = lastCreateOptions?.["Labels"] as Record<string, string> | undefined;
    expect(createLabels?.[PREVIEW_PROJECT_LABEL]).toBe("proj-1");
  });
});
