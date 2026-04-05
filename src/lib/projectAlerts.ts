import { and, desc, eq, inArray, min } from "drizzle-orm";
import { config, getDevBaseUrl, getProdBaseUrl } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";

const appBaseUrl = () => (config.env === "development" ? getDevBaseUrl() : getProdBaseUrl());

type AlertPayload = {
  event: "deployher.alert";
  version: 1;
  ruleType: "consecutive_failures" | "queue_stall";
  projectId: string;
  projectName: string;
  message: string;
  deploymentId?: string;
  urls: {
    project: string;
    observability: string;
  };
};

const postWebhook = async (url: string, body: AlertPayload): Promise<{ ok: boolean; status: number | null; error: string | null }> => {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000)
    });
    return { ok: response.ok, status: response.status, error: response.ok ? null : await response.text().catch(() => "non-ok") };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: null, error: message };
  }
};

const canFireRule = (lastFiredAt: Date | null, cooldownSeconds: number): boolean => {
  if (!lastFiredAt) return true;
  const elapsed = (Date.now() - lastFiredAt.getTime()) / 1000;
  return elapsed >= cooldownSeconds;
};

const loadRuleContext = async (ruleId: string) => {
  const [row] = await db
    .select({
      rule: schema.projectAlertRules,
      destination: schema.projectAlertDestinations,
      project: schema.projects
    })
    .from(schema.projectAlertRules)
    .innerJoin(
      schema.projectAlertDestinations,
      eq(schema.projectAlertRules.destinationId, schema.projectAlertDestinations.id)
    )
    .innerJoin(schema.projects, eq(schema.projectAlertRules.projectId, schema.projects.id))
    .where(eq(schema.projectAlertRules.id, ruleId))
    .limit(1);
  return row ?? null;
};

const recordDelivery = async (
  ruleId: string,
  httpStatus: number | null,
  errorMessage: string | null
): Promise<void> => {
  await db.insert(schema.projectAlertDeliveries).values({
    ruleId,
    httpStatus: httpStatus ?? undefined,
    errorMessage: errorMessage ?? undefined
  });
};

const fireRule = async (
  ruleId: string,
  payload: Omit<AlertPayload, "event" | "version" | "urls"> & { projectName: string }
): Promise<void> => {
  const ctx = await loadRuleContext(ruleId);
  if (!ctx || !ctx.rule.enabled) return;
  if (!canFireRule(ctx.rule.lastFiredAt, ctx.rule.cooldownSeconds)) return;

  const base = appBaseUrl();
  const fullPayload: AlertPayload = {
    event: "deployher.alert",
    version: 1,
    ruleType: payload.ruleType,
    projectId: payload.projectId,
    projectName: payload.projectName,
    message: payload.message,
    deploymentId: payload.deploymentId,
    urls: {
      project: `${base}/projects/${payload.projectId}`,
      observability: `${base}/projects/${payload.projectId}/observability`
    }
  };

  const result = await postWebhook(ctx.destination.webhookUrl, fullPayload);
  await recordDelivery(ruleId, result.status, result.error);

  if (result.ok) {
    await db
      .update(schema.projectAlertRules)
      .set({ lastFiredAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.projectAlertRules.id, ruleId));
  }
};

export const countTrailingFailures = (
  deployments: { status: "queued" | "building" | "success" | "failed" }[]
): number => {
  const terminal = deployments.filter((d) => d.status === "success" || d.status === "failed");
  let count = 0;
  for (const d of terminal) {
    if (d.status === "failed") count += 1;
    else break;
  }
  return count;
};

export const evaluateConsecutiveFailureAlertsForProject = async (projectId: string): Promise<void> => {
  const rules = await db
    .select()
    .from(schema.projectAlertRules)
    .where(
      and(
        eq(schema.projectAlertRules.projectId, projectId),
        eq(schema.projectAlertRules.enabled, true),
        eq(schema.projectAlertRules.ruleType, "consecutive_failures")
      )
    );

  if (rules.length === 0) return;

  const recent = await db
    .select({ status: schema.deployments.status })
    .from(schema.deployments)
    .where(eq(schema.deployments.projectId, projectId))
    .orderBy(desc(schema.deployments.createdAt))
    .limit(80);

  const trailing = countTrailingFailures(recent);

  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, projectId)).limit(1);
  const projectName = project?.name ?? projectId;

  for (const rule of rules) {
    if (trailing < rule.threshold) continue;
    await fireRule(rule.id, {
      ruleType: "consecutive_failures",
      projectId,
      projectName,
      message: `${trailing} consecutive failed deployment(s) (threshold ${rule.threshold})`
    });
  }
};

export const evaluateQueueStallAlertsForAllProjects = async (): Promise<void> => {
  const rules = await db
    .select()
    .from(schema.projectAlertRules)
    .where(
      and(eq(schema.projectAlertRules.enabled, true), eq(schema.projectAlertRules.ruleType, "queue_stall"))
    );

  if (rules.length === 0) return;

  const projectIds = [...new Set(rules.map((r) => r.projectId))];
  const oldestByProject = await db
    .select({
      projectId: schema.deployments.projectId,
      oldest: min(schema.deployments.createdAt)
    })
    .from(schema.deployments)
    .where(
      and(inArray(schema.deployments.projectId, projectIds), eq(schema.deployments.status, "queued"))
    )
    .groupBy(schema.deployments.projectId);

  const oldestMap = new Map<string, Date>();
  for (const row of oldestByProject) {
    if (row.oldest) {
      oldestMap.set(row.projectId, row.oldest);
    }
  }

  const projects = await db
    .select()
    .from(schema.projects)
    .where(inArray(schema.projects.id, projectIds));
  const nameById = new Map(projects.map((p) => [p.id, p.name]));

  const now = Date.now();
  for (const rule of rules) {
    const oldest = oldestMap.get(rule.projectId);
    if (!oldest) continue;
    const ageSec = (now - oldest.getTime()) / 1000;
    if (ageSec < rule.threshold) continue;
    await fireRule(rule.id, {
      ruleType: "queue_stall",
      projectId: rule.projectId,
      projectName: nameById.get(rule.projectId) ?? rule.projectId,
      message: `Oldest queued deployment waited ${Math.floor(ageSec)}s (threshold ${rule.threshold}s)`
    });
  }
};

export const onDeploymentTerminalStatus = async (
  projectId: string,
  status: "success" | "failed"
): Promise<void> => {
  if (status !== "failed") return;
  try {
    await evaluateConsecutiveFailureAlertsForProject(projectId);
  } catch (err) {
    console.error("consecutive failure alert evaluation failed:", err);
  }
};

let stallInterval: ReturnType<typeof setInterval> | null = null;

export const startQueueStallAlertScheduler = (): void => {
  if (stallInterval) return;
  const ms = config.observability.queueStallCheckIntervalMs;
  stallInterval = setInterval(() => {
    evaluateQueueStallAlertsForAllProjects().catch((err) => {
      console.error("queue stall alert sweep failed:", err);
    });
  }, ms);
};
