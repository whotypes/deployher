import { asc, eq } from "drizzle-orm";
import { db } from "./db/db";
import * as schema from "./db/schema";
import { getRedisClient } from "./redis";

const DEPLOYMENT_EVENT_CHANNEL_PREFIX = "deployment:";
const DEPLOYMENT_EVENT_CHANNEL_SUFFIX = ":events";

export type DeploymentTerminalStatus = "success" | "failed";

export type DeploymentStreamEvent =
  | { type: "status"; status: string }
  | { type: "log"; content: string }
  | { type: "done"; status: DeploymentTerminalStatus }
  | { type: "error"; content: string };

export const deploymentEventChannel = (deploymentId: string): string =>
  `${DEPLOYMENT_EVENT_CHANNEL_PREFIX}${deploymentId}${DEPLOYMENT_EVENT_CHANNEL_SUFFIX}`;

export const publishDeploymentEvent = async (
  deploymentId: string,
  event: DeploymentStreamEvent
): Promise<void> => {
  const values = {
    deploymentId,
    type: event.type,
    status: "status" in event ? event.status ?? null : null,
    content: "content" in event ? event.content ?? null : null
  };
  const serialized = JSON.stringify(event);

  await Promise.all([
    db.insert(schema.deploymentEvents).values(values),
    (async (): Promise<void> => {
      const client = await getRedisClient();
      if (!client) return;
      await client.publish(deploymentEventChannel(deploymentId), serialized);
    })()
  ]);
};

export const loadDeploymentEventHistory = async (
  deploymentId: string
): Promise<DeploymentStreamEvent[]> => {
  const rows = await db
    .select({
      type: schema.deploymentEvents.type,
      status: schema.deploymentEvents.status,
      content: schema.deploymentEvents.content,
      createdAt: schema.deploymentEvents.createdAt
    })
    .from(schema.deploymentEvents)
    .where(eq(schema.deploymentEvents.deploymentId, deploymentId))
    .orderBy(asc(schema.deploymentEvents.createdAt));

  const events: DeploymentStreamEvent[] = [];
  for (const row of rows) {
    if (row.type === "status" && row.status) {
      events.push({ type: "status", status: row.status });
    } else if (row.type === "log" && row.content) {
      events.push({ type: "log", content: row.content });
    } else if (row.type === "done" && row.status && (row.status === "success" || row.status === "failed")) {
      events.push({ type: "done", status: row.status });
    } else if (row.type === "error" && row.content) {
      events.push({ type: "error", content: row.content });
    }
  }

  return events;
};
