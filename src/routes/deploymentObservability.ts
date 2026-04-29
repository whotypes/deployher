import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { config } from "../config";
import { json, notFound } from "../http/helpers";

const parseRangeDays = (value: string | null): 7 | 30 => {
  if (value === "30") return 30;
  return 7;
};

const percentileSorted = (sorted: number[], p: number): number | null => {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
  return sorted[idx] ?? null;
};

const getDeploymentOwnedByUser = async (deploymentId: string, userId: string) => {
  const [row] = await db
    .select({
      deployment: schema.deployments,
      projectId: schema.projects.id
    })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .where(and(eq(schema.deployments.id, deploymentId), eq(schema.projects.userId, userId)))
    .limit(1);
  return row ?? null;
};

export const getDeploymentObservability = async (req: RequestWithParamsAndSession) => {
  const deploymentId = req.params["id"];
  if (!deploymentId) return notFound("Deployment not found");

  const owned = await getDeploymentOwnedByUser(deploymentId, req.session.user.id);
  if (!owned) return notFound("Deployment not found");

  const url = new URL(req.url);
  const rangeDays = parseRangeDays(url.searchParams.get("rangeDays"));
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  const pathLabelExpr = sql<string>`coalesce(nullif(trim(${schema.previewTrafficEvents.path}), ''), ${schema.previewTrafficEvents.pathBucket}, 'unknown')`;

  const [totalRow] = await db
    .select({
      n: sql<number>`count(*)::int`,
      withDuration: sql<number>`count(*) FILTER (WHERE ${schema.previewTrafficEvents.durationMs} IS NOT NULL)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.deploymentId, deploymentId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    );

  const sampleCount = totalRow?.n ?? 0;

  const durationRows = await db
    .select({ durationMs: schema.previewTrafficEvents.durationMs })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.deploymentId, deploymentId),
        gte(schema.previewTrafficEvents.occurredAt, since),
        isNotNull(schema.previewTrafficEvents.durationMs)
      )
    )
    .limit(50_000);

  const durationsSorted = durationRows
    .map((r) => r.durationMs)
    .filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  const byStatusRows = await db
    .select({
      statusCode: schema.previewTrafficEvents.statusCode,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.deploymentId, deploymentId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .groupBy(schema.previewTrafficEvents.statusCode);

  const byMethodRows = await db
    .select({
      method: schema.previewTrafficEvents.method,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.deploymentId, deploymentId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .groupBy(schema.previewTrafficEvents.method);

  const byPathBucketRows = await db
    .select({
      pathBucket: schema.previewTrafficEvents.pathBucket,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.deploymentId, deploymentId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .groupBy(schema.previewTrafficEvents.pathBucket);

  const byPathLabelRows = await db
    .select({
      pathLabel: pathLabelExpr,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.deploymentId, deploymentId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .groupBy(pathLabelExpr);

  const recentRows = await db
    .select({
      occurredAt: schema.previewTrafficEvents.occurredAt,
      clientIp: schema.previewTrafficEvents.clientIp,
      method: schema.previewTrafficEvents.method,
      statusCode: schema.previewTrafficEvents.statusCode,
      path: schema.previewTrafficEvents.path,
      pathBucket: schema.previewTrafficEvents.pathBucket,
      durationMs: schema.previewTrafficEvents.durationMs
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.deploymentId, deploymentId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .orderBy(desc(schema.previewTrafficEvents.occurredAt))
    .limit(80);

  const p50 = percentileSorted(durationsSorted, 0.5);
  const p95 = percentileSorted(durationsSorted, 0.95);

  return json({
    deploymentId: owned.deployment.id,
    deploymentShortId: owned.deployment.shortId,
    projectId: owned.projectId,
    status: owned.deployment.status,
    rangeDays,
    sampleRate: config.observability.previewTrafficSampleRate,
    sampleCount,
    durationSampleCount: totalRow?.withDuration ?? 0,
    durationMs: {
      p50: p50 !== null && Number.isFinite(p50) ? p50 : null,
      p95: p95 !== null && Number.isFinite(p95) ? p95 : null
    },
    byStatus: [...byStatusRows]
      .sort((a, b) => b.n - a.n)
      .map((row) => ({ statusCode: row.statusCode, count: row.n })),
    byMethod: [...byMethodRows]
      .sort((a, b) => b.n - a.n)
      .map((row) => ({ method: row.method, count: row.n })),
    byPathBucket: [...byPathBucketRows]
      .sort((a, b) => b.n - a.n)
      .map((row) => ({
        pathBucket: row.pathBucket ?? "unknown",
        count: row.n
      })),
    byPath: [...byPathLabelRows]
      .sort((a, b) => b.n - a.n)
      .map((row) => ({ path: row.pathLabel, count: row.n })),
    recent: recentRows.map((row) => ({
      occurredAt: row.occurredAt.toISOString(),
      clientIp: row.clientIp,
      method: row.method,
      statusCode: row.statusCode,
      path: row.path && row.path.trim() ? row.path : (row.pathBucket ?? "unknown"),
      durationMs: row.durationMs
    }))
  });
};
