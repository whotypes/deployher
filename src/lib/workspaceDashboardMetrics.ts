import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/db";
import * as schema from "../db/schema";

export const WORKSPACE_DASHBOARD_RANGE_DAYS = 7 as const;

export type WorkspaceDashboardDeployBucket = {
  t: string;
  success: number;
  failed: number;
  started: number;
};

export type WorkspaceDashboardTrafficBucket = {
  t: string;
  count: number;
};

export type WorkspaceDashboardCharts = {
  rangeDays: typeof WORKSPACE_DASHBOARD_RANGE_DAYS;
  deployBuckets: WorkspaceDashboardDeployBucket[];
  trafficBuckets: WorkspaceDashboardTrafficBucket[];
  backlog: { queued: number; building: number };
  terminalInRange: { success: number; failed: number };
  successRate: number | null;
};

export const getWorkspaceDashboardMetrics = async (userId: string): Promise<WorkspaceDashboardCharts> => {
  const since = new Date(Date.now() - WORKSPACE_DASHBOARD_RANGE_DAYS * 24 * 60 * 60 * 1000);

  const deployBucketExpr = sql`date_trunc('day', ${schema.deployments.createdAt})`;

  const bucketRows = await db
    .select({
      t: deployBucketExpr,
      successN: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'success')::int`,
      failedN: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'failed')::int`,
      startedN: sql<number>`count(*)::int`
    })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .where(and(eq(schema.projects.userId, userId), gte(schema.deployments.createdAt, since)))
    .groupBy(deployBucketExpr)
    .orderBy(deployBucketExpr);

  const [terminalRow] = await db
    .select({
      successN: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'success')::int`,
      failedN: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'failed')::int`
    })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .where(and(eq(schema.projects.userId, userId), gte(schema.deployments.createdAt, since)));

  const successN = terminalRow?.successN ?? 0;
  const failedN = terminalRow?.failedN ?? 0;
  const denom = successN + failedN;
  const successRate = denom > 0 ? successN / denom : null;

  const trafficBucketExpr = sql`date_trunc('day', ${schema.previewTrafficEvents.occurredAt})`;

  const trafficRows = await db
    .select({
      t: trafficBucketExpr,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .innerJoin(schema.projects, eq(schema.previewTrafficEvents.projectId, schema.projects.id))
    .where(and(eq(schema.projects.userId, userId), gte(schema.previewTrafficEvents.occurredAt, since)))
    .groupBy(trafficBucketExpr)
    .orderBy(trafficBucketExpr);

  const [backlogRow] = await db
    .select({
      queued: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'queued')::int`,
      building: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'building')::int`
    })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .where(eq(schema.projects.userId, userId));

  return {
    rangeDays: WORKSPACE_DASHBOARD_RANGE_DAYS,
    deployBuckets: bucketRows.map((row) => ({
      t: row.t instanceof Date ? row.t.toISOString() : String(row.t),
      success: row.successN,
      failed: row.failedN,
      started: row.startedN
    })),
    trafficBuckets: trafficRows.map((row) => ({
      t: row.t instanceof Date ? row.t.toISOString() : String(row.t),
      count: row.n
    })),
    backlog: {
      queued: backlogRow?.queued ?? 0,
      building: backlogRow?.building ?? 0
    },
    terminalInRange: { success: successN, failed: failedN },
    successRate
  };
};
