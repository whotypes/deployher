import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { badRequest, json, notFound, parseJson } from "../http/helpers";
import { config, getDevBaseUrl, getProdBaseUrl } from "../config";

const getProjectForUser = async (projectId: string, userId: string) => {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return project ?? null;
};

const appBaseUrl = () => (config.env === "development" ? getDevBaseUrl() : getProdBaseUrl());

const parseRangeDays = (value: string | null): 7 | 30 => {
  if (value === "30") return 30;
  return 7;
};

const parseBucket = (value: string | null): "hour" | "day" => {
  if (value === "day") return "day";
  return "hour";
};

const isValidWebhookUrl = (raw: string): boolean => {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
};

export const getObservabilityMetrics = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) return notFound("Project not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const url = new URL(req.url);
  const rangeDays = parseRangeDays(url.searchParams.get("rangeDays"));
  const bucket = parseBucket(url.searchParams.get("bucket"));
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  const bucketExpr =
    bucket === "hour"
      ? sql`date_trunc('hour', ${schema.deployments.createdAt})`
      : sql`date_trunc('day', ${schema.deployments.createdAt})`;

  const bucketRows = await db
    .select({
      t: bucketExpr,
      successN: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'success')::int`,
      failedN: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'failed')::int`,
      startedN: sql<number>`count(*)::int`
    })
    .from(schema.deployments)
    .where(
      and(eq(schema.deployments.projectId, projectId), gte(schema.deployments.createdAt, since))
    )
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  const [terminalRow] = await db
    .select({
      successN: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'success')::int`,
      failedN: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'failed')::int`
    })
    .from(schema.deployments)
    .where(
      and(eq(schema.deployments.projectId, projectId), gte(schema.deployments.createdAt, since))
    );

  const successN = terminalRow?.successN ?? 0;
  const failedN = terminalRow?.failedN ?? 0;
  const denom = successN + failedN;
  const successRate = denom > 0 ? successN / denom : null;

  const durationRows = await db
    .select({
      createdAt: schema.deployments.createdAt,
      finishedAt: schema.deployments.finishedAt
    })
    .from(schema.deployments)
    .where(
      and(
        eq(schema.deployments.projectId, projectId),
        gte(schema.deployments.createdAt, since),
        inArray(schema.deployments.status, ["success", "failed"]),
        isNotNull(schema.deployments.finishedAt)
      )
    )
    .limit(10_000);

  const durationsSec = durationRows
    .map((r) => {
      if (!r.finishedAt) return null;
      return (r.finishedAt.getTime() - r.createdAt.getTime()) / 1000;
    })
    .filter((v): v is number => v !== null && Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);

  const percentileSorted = (sorted: number[], p: number): number | null => {
    if (sorted.length === 0) return null;
    const idx = Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1);
    return sorted[idx] ?? null;
  };

  const p50 = percentileSorted(durationsSec, 0.5);
  const p95 = percentileSorted(durationsSec, 0.95);

  const [backlogRow] = await db
    .select({
      queued: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'queued')::int`,
      building: sql<number>`count(*) FILTER (WHERE ${schema.deployments.status} = 'building')::int`
    })
    .from(schema.deployments)
    .where(eq(schema.deployments.projectId, projectId));

  const [oldestQueued] = await db
    .select({ createdAt: schema.deployments.createdAt })
    .from(schema.deployments)
    .where(
      and(eq(schema.deployments.projectId, projectId), eq(schema.deployments.status, "queued"))
    )
    .orderBy(schema.deployments.createdAt)
    .limit(1);

  return json({
    rangeDays,
    bucket,
    successRate,
    terminalInRange: { success: successN, failed: failedN },
    buildDurationSeconds: {
      p50: Number.isFinite(p50) ? p50 : null,
      p95: Number.isFinite(p95) ? p95 : null
    },
    backlog: {
      queued: backlogRow?.queued ?? 0,
      building: backlogRow?.building ?? 0,
      oldestQueuedAt: oldestQueued?.createdAt?.toISOString() ?? null
    },
    buckets: bucketRows.map((row) => ({
      t: row.t instanceof Date ? row.t.toISOString() : String(row.t),
      success: row.successN,
      failed: row.failedN,
      started: row.startedN
    }))
  });
};

export const getObservabilityTraffic = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) return notFound("Project not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const url = new URL(req.url);
  const rangeDays = parseRangeDays(url.searchParams.get("rangeDays"));
  const since = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000);

  const bucketExpr = sql`date_trunc('day', ${schema.previewTrafficEvents.occurredAt})`;

  const byDay = await db
    .select({
      t: bucketExpr,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.projectId, projectId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);

  const byStatusRows = await db
    .select({
      statusCode: schema.previewTrafficEvents.statusCode,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.projectId, projectId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .groupBy(schema.previewTrafficEvents.statusCode);

  const byStatus = [...byStatusRows].sort((a, b) => b.n - a.n);

  const topIpsRows = await db
    .select({
      clientIp: schema.previewTrafficEvents.clientIp,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.projectId, projectId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .groupBy(schema.previewTrafficEvents.clientIp);

  const topIps = [...topIpsRows].sort((a, b) => b.n - a.n).slice(0, 20);

  const byPathBucketRows = await db
    .select({
      pathBucket: schema.previewTrafficEvents.pathBucket,
      n: sql<number>`count(*)::int`
    })
    .from(schema.previewTrafficEvents)
    .where(
      and(
        eq(schema.previewTrafficEvents.projectId, projectId),
        gte(schema.previewTrafficEvents.occurredAt, since)
      )
    )
    .groupBy(schema.previewTrafficEvents.pathBucket);

  const byPathBucket = [...byPathBucketRows].sort((a, b) => b.n - a.n);

  return json({
    rangeDays,
    sampleRate: config.observability.previewTrafficSampleRate,
    byDay: byDay.map((row) => ({
      t: row.t instanceof Date ? row.t.toISOString() : String(row.t),
      count: row.n
    })),
    byStatus: byStatus.map((row) => ({ statusCode: row.statusCode, count: row.n })),
    topIps: topIps.map((row) => ({ clientIp: row.clientIp, count: row.n })),
    byPathBucket: byPathBucket.map((row) => ({
      pathBucket: row.pathBucket ?? "unknown",
      count: row.n
    }))
  });
};

export const listAlertDestinations = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) return notFound("Project not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const rows = await db
    .select()
    .from(schema.projectAlertDestinations)
    .where(eq(schema.projectAlertDestinations.projectId, projectId))
    .orderBy(desc(schema.projectAlertDestinations.createdAt));

  return json(
    rows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      webhookUrl: r.webhookUrl,
      createdAt: r.createdAt.toISOString()
    }))
  );
};

export const createAlertDestination = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) return notFound("Project not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const body = await parseJson<{ webhookUrl?: unknown }>(req);
  if (!body || typeof body.webhookUrl !== "string" || !body.webhookUrl.trim()) {
    return badRequest("webhookUrl is required");
  }
  const webhookUrl = body.webhookUrl.trim();
  if (!isValidWebhookUrl(webhookUrl)) {
    return badRequest("webhookUrl must be http or https");
  }

  const [row] = await db
    .insert(schema.projectAlertDestinations)
    .values({ projectId, webhookUrl })
    .returning();

  if (!row) return json({ error: "Failed to create destination" }, { status: 500 });
  return json(
    {
      id: row.id,
      projectId: row.projectId,
      webhookUrl: row.webhookUrl,
      createdAt: row.createdAt.toISOString()
    },
    { status: 201 }
  );
};

export const deleteAlertDestination = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  const destId = req.params["destId"];
  if (!projectId || !destId) return notFound("Not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const [existing] = await db
    .select()
    .from(schema.projectAlertDestinations)
    .where(
      and(
        eq(schema.projectAlertDestinations.id, destId),
        eq(schema.projectAlertDestinations.projectId, projectId)
      )
    )
    .limit(1);

  if (!existing) return notFound("Destination not found");

  await db.delete(schema.projectAlertDestinations).where(eq(schema.projectAlertDestinations.id, destId));
  return json({ ok: true });
};

export const listAlertRules = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) return notFound("Project not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const rows = await db
    .select({
      rule: schema.projectAlertRules,
      destination: schema.projectAlertDestinations
    })
    .from(schema.projectAlertRules)
    .innerJoin(
      schema.projectAlertDestinations,
      eq(schema.projectAlertRules.destinationId, schema.projectAlertDestinations.id)
    )
    .where(eq(schema.projectAlertRules.projectId, projectId))
    .orderBy(desc(schema.projectAlertRules.createdAt));

  return json(
    rows.map(({ rule, destination }) => ({
      id: rule.id,
      projectId: rule.projectId,
      destinationId: rule.destinationId,
      destinationWebhookUrl: destination.webhookUrl,
      ruleType: rule.ruleType,
      threshold: rule.threshold,
      cooldownSeconds: rule.cooldownSeconds,
      enabled: rule.enabled,
      lastFiredAt: rule.lastFiredAt?.toISOString() ?? null,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString()
    }))
  );
};

const parseRuleType = (value: unknown): "consecutive_failures" | "queue_stall" | null => {
  if (value === "consecutive_failures" || value === "queue_stall") return value;
  return null;
};

export const createAlertRule = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) return notFound("Project not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const body = await parseJson<{
    destinationId?: unknown;
    ruleType?: unknown;
    threshold?: unknown;
    cooldownSeconds?: unknown;
    enabled?: unknown;
  }>(req);

  if (!body || typeof body.destinationId !== "string") {
    return badRequest("destinationId is required");
  }
  const ruleType = parseRuleType(body.ruleType);
  if (!ruleType) {
    return badRequest("ruleType must be consecutive_failures or queue_stall");
  }
  if (typeof body.threshold !== "number" || !Number.isInteger(body.threshold)) {
    return badRequest("threshold must be an integer");
  }
  const threshold = body.threshold;
  if (ruleType === "consecutive_failures") {
    if (threshold < 1 || threshold > 50) {
      return badRequest("consecutive_failures threshold must be 1–50");
    }
  } else if (threshold < 60 || threshold > 864_000) {
    return badRequest("queue_stall threshold must be 60–864000 seconds");
  }

  const [dest] = await db
    .select()
    .from(schema.projectAlertDestinations)
    .where(
      and(
        eq(schema.projectAlertDestinations.id, body.destinationId),
        eq(schema.projectAlertDestinations.projectId, projectId)
      )
    )
    .limit(1);

  if (!dest) return badRequest("destination not found for this project");

  const cooldownSeconds =
    typeof body.cooldownSeconds === "number" && Number.isInteger(body.cooldownSeconds)
      ? Math.min(86_400, Math.max(60, body.cooldownSeconds))
      : 3600;

  const enabled = body.enabled === false ? false : true;

  const [row] = await db
    .insert(schema.projectAlertRules)
    .values({
      projectId,
      destinationId: dest.id,
      ruleType,
      threshold,
      cooldownSeconds,
      enabled
    })
    .returning();

  if (!row) return json({ error: "Failed to create rule" }, { status: 500 });
  return json(
    {
      id: row.id,
      projectId: row.projectId,
      destinationId: row.destinationId,
      ruleType: row.ruleType,
      threshold: row.threshold,
      cooldownSeconds: row.cooldownSeconds,
      enabled: row.enabled,
      lastFiredAt: row.lastFiredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    },
    { status: 201 }
  );
};

export const patchAlertRule = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  const ruleId = req.params["ruleId"];
  if (!projectId || !ruleId) return notFound("Not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const [existing] = await db
    .select()
    .from(schema.projectAlertRules)
    .where(
      and(eq(schema.projectAlertRules.id, ruleId), eq(schema.projectAlertRules.projectId, projectId))
    )
    .limit(1);

  if (!existing) return notFound("Rule not found");

  const body = await parseJson<{
    threshold?: unknown;
    cooldownSeconds?: unknown;
    enabled?: unknown;
  }>(req);

  const updates: Partial<typeof schema.projectAlertRules.$inferInsert> = {
    updatedAt: new Date()
  };

  if (body && typeof body.threshold === "number" && Number.isInteger(body.threshold)) {
    const t = body.threshold;
    if (existing.ruleType === "consecutive_failures") {
      if (t < 1 || t > 50) return badRequest("consecutive_failures threshold must be 1–50");
    } else if (t < 60 || t > 864_000) {
      return badRequest("queue_stall threshold must be 60–864000 seconds");
    }
    updates.threshold = t;
  }

  if (body && typeof body.cooldownSeconds === "number" && Number.isInteger(body.cooldownSeconds)) {
    updates.cooldownSeconds = Math.min(86_400, Math.max(60, body.cooldownSeconds));
  }

  if (body && typeof body.enabled === "boolean") {
    updates.enabled = body.enabled;
  }

  const [row] = await db
    .update(schema.projectAlertRules)
    .set(updates)
    .where(eq(schema.projectAlertRules.id, ruleId))
    .returning();

  if (!row) return json({ error: "Update failed" }, { status: 500 });
  return json({
    id: row.id,
    projectId: row.projectId,
    destinationId: row.destinationId,
    ruleType: row.ruleType,
    threshold: row.threshold,
    cooldownSeconds: row.cooldownSeconds,
    enabled: row.enabled,
    lastFiredAt: row.lastFiredAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  });
};

export const deleteAlertRule = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  const ruleId = req.params["ruleId"];
  if (!projectId || !ruleId) return notFound("Not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const [existing] = await db
    .select()
    .from(schema.projectAlertRules)
    .where(
      and(eq(schema.projectAlertRules.id, ruleId), eq(schema.projectAlertRules.projectId, projectId))
    )
    .limit(1);

  if (!existing) return notFound("Rule not found");

  await db.delete(schema.projectAlertRules).where(eq(schema.projectAlertRules.id, ruleId));
  return json({ ok: true });
};

export const postObservabilityTestWebhook = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) return notFound("Project not found");
  const project = await getProjectForUser(projectId, req.session.user.id);
  if (!project) return notFound("Project not found");

  const body = await parseJson<{ webhookUrl?: unknown }>(req);
  if (!body || typeof body.webhookUrl !== "string" || !body.webhookUrl.trim()) {
    return badRequest("webhookUrl is required");
  }
  const webhookUrl = body.webhookUrl.trim();
  if (!isValidWebhookUrl(webhookUrl)) {
    return badRequest("webhookUrl must be http or https");
  }

  const base = appBaseUrl();
  const payload = {
    event: "deployher.alert" as const,
    version: 1 as const,
    ruleType: "consecutive_failures" as const,
    projectId,
    projectName: project.name,
    message: "Test webhook from Deployher observability settings",
    urls: {
      project: `${base}/projects/${projectId}`,
      observability: `${base}/projects/${projectId}/observability`
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000)
    });
    const text = await response.text();
    return json({
      ok: response.ok,
      status: response.status,
      bodyPreview: text.slice(0, 500)
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ ok: false, error: message }, { status: 502 });
  }
};
