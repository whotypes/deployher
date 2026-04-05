import { and, eq, isNotNull, or } from "drizzle-orm";
import { config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { notifyPreviewRunnersPrewarm } from "../preview";

type DeploymentRuntimeConfig = NonNullable<typeof schema.deployments.$inferSelect.runtimeConfig>;

export type RunnerEnsurePreviewInput = {
  deploymentId: string;
  projectId: string;
  runtimeImagePullRef?: string;
  runtimeImageArtifactKey?: string;
  runtimeConfig: DeploymentRuntimeConfig | null;
};

const normalizeRuntimeConfigForRunner = (
  raw: DeploymentRuntimeConfig | null
): {
  port: number;
  command: string[];
  workingDir?: string;
  framework?: "nextjs" | "node";
  env?: Record<string, string>;
} => {
  const base = raw && typeof raw === "object" ? raw : {};
  const port =
    typeof base.port === "number" && Number.isFinite(base.port) && base.port > 0 && base.port < 65536
      ? base.port
      : 3000;
  const command = Array.isArray(base.command)
    ? base.command.filter((x): x is string => typeof x === "string")
    : [];
  const workingDir = typeof base.workingDir === "string" ? base.workingDir : undefined;
  const framework =
    base.framework === "nextjs" || base.framework === "node" ? base.framework : undefined;
  return { port, command, ...(workingDir ? { workingDir } : {}), ...(framework ? { framework } : {}) };
};

export const requestRunnerEnsurePreview = async (input: RunnerEnsurePreviewInput): Promise<void> => {
  const runnerBase = (config.runner.url ?? "").trim().replace(/\/+$/, "");
  if (!runnerBase || !config.runner.previewEnabled) {
    return;
  }
  const pullRef = input.runtimeImagePullRef?.trim() ?? "";
  const artifactKey = input.runtimeImageArtifactKey?.trim() ?? "";
  if (!pullRef && !artifactKey) {
    return;
  }
  if (pullRef && artifactKey) {
    return;
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  const secret = (config.runner.sharedSecret ?? "").trim();
  if (secret) {
    headers.set("x-deployher-runner-secret", secret);
  }

  const body = {
    deploymentId: input.deploymentId,
    projectId: input.projectId,
    runtimeImagePullRef: pullRef || undefined,
    runtimeImageArtifactKey: artifactKey || undefined,
    runtimeConfig: normalizeRuntimeConfigForRunner(input.runtimeConfig)
  };

  const res = await fetch(`${runnerBase}/internal/ensure-preview`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000)
  });
  if (!res.ok && res.status !== 202) {
    const text = await res.text().catch(() => "");
    throw new Error(`runner ensure-preview returned ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }
};

const collectPrewarmPullRefs = async (): Promise<string[]> => {
  const buildingRows = await db
    .select({ pullRef: schema.deployments.runtimeImagePullRef })
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.status, "building"),
        isNotNull(schema.deployments.runtimeImagePullRef)
      )
    );

  const currentRows = await db
    .select({ pullRef: schema.deployments.runtimeImagePullRef })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.projects.currentDeploymentId, schema.deployments.id))
    .where(
      and(
        eq(schema.deployments.status, "success"),
        eq(schema.deployments.serveStrategy, "server"),
        isNotNull(schema.deployments.runtimeImagePullRef)
      )
    );

  const refs = new Set<string>();
  for (const row of buildingRows) {
    const r = row.pullRef?.trim();
    if (r) refs.add(r);
  }
  for (const row of currentRows) {
    const r = row.pullRef?.trim();
    if (r) refs.add(r);
  }
  return [...refs];
};

export const ensureCurrentServerPreviewContainers = async (): Promise<void> => {
  if (!config.runner.previewEnabled) return;
  if (!(config.runner.url ?? "").trim()) return;

  const rows = await db
    .select({
      deploymentId: schema.deployments.id,
      projectId: schema.deployments.projectId,
      pullRef: schema.deployments.runtimeImagePullRef,
      artifactKey: schema.deployments.runtimeImageArtifactKey,
      runtimeConfig: schema.deployments.runtimeConfig
    })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.projects.currentDeploymentId, schema.deployments.id))
    .where(
      and(
        eq(schema.deployments.status, "success"),
        eq(schema.deployments.serveStrategy, "server"),
        or(
          isNotNull(schema.deployments.runtimeImagePullRef),
          isNotNull(schema.deployments.runtimeImageArtifactKey)
        )
      )
    );

  if (rows.length === 0) {
    return;
  }

  console.log(`Preview runner: ensuring ${rows.length} current server preview container(s)`);
  for (const row of rows) {
    const pull = row.pullRef?.trim() ?? "";
    const art = row.artifactKey?.trim() ?? "";
    void requestRunnerEnsurePreview({
      deploymentId: row.deploymentId,
      projectId: row.projectId,
      runtimeImagePullRef: pull || undefined,
      runtimeImageArtifactKey: art || undefined,
      runtimeConfig: row.runtimeConfig
    }).catch((err) => {
      console.error(`Preview ensure failed for deployment ${row.deploymentId}:`, err);
    });
  }
};

export const rehydratePreviewRunnerAfterAppStart = async (): Promise<void> => {
  if (!config.runner.previewEnabled) return;
  if (!(config.runner.url ?? "").trim()) return;

  const refs = await collectPrewarmPullRefs();
  if (refs.length > 0) {
    console.log(`Preview runner rehydrate: prewarming ${refs.length} runtime image ref(s)`);
    for (const ref of refs) {
      void notifyPreviewRunnersPrewarm(ref);
    }
  }

  await ensureCurrentServerPreviewContainers();
};
