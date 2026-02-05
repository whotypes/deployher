import { and, desc, eq } from "drizzle-orm";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { json, notFound, parseJson } from "../http/helpers";
import { enqueueDeployment } from "../queue";
import { getRedisSubscriber, isRedisConfigured } from "../redis";
import { getText, getTextFromOffset, isStorageConfigured, presign } from "../storage";
import { generateShortId } from "../utils/shortId";

const getProjectForUser = async (projectId: string, userId: string) => {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return project ?? null;
};

export const listDeployments = async (req: RequestWithParamsAndSession) => {
  const projectId = req.params["id"];
  if (!projectId) {
    return notFound("Project not found");
  }
  const userId = req.session.user.id;
  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return notFound("Project not found");
  }

  const rows = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.projectId, projectId))
    .orderBy(desc(schema.deployments.createdAt));

  return json(rows);
};

export const createDeployment = async (req: RequestWithParamsAndSession) => {
  if (!isRedisConfigured()) {
    return json({ error: "Redis is not configured" }, { status: 503 });
  }
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  const projectId = req.params["id"];
  if (!projectId) {
    return notFound("Project not found");
  }
  const userId = req.session.user.id;
  const project = await getProjectForUser(projectId, userId);
  if (!project) {
    return notFound("Project not found");
  }

  const body = await parseJson<{ artifactPrefix?: unknown }>(req);
  const artifactPrefix =
    body && typeof body.artifactPrefix === "string" && body.artifactPrefix.trim()
      ? body.artifactPrefix.trim()
      : `artifacts/${project.id}/${Date.now()}`;

  const shortId = generateShortId();

  const [deployment] = await db
    .insert(schema.deployments)
    .values({
      projectId: project.id,
      shortId,
      artifactPrefix,
      status: "queued"
    })
    .returning();

  if (!deployment) {
    return notFound("Deployment not found");
  }

  await db
    .update(schema.projects)
    .set({ currentDeploymentId: deployment.id, updatedAt: new Date() })
    .where(eq(schema.projects.id, project.id));

  try {
    await enqueueDeployment(deployment.id);
  } catch (err) {
    console.error("Failed to enqueue deployment:", err);
    await db
      .update(schema.deployments)
      .set({ status: "failed", finishedAt: new Date() })
      .where(eq(schema.deployments.id, deployment.id));
    return json({ error: "Failed to queue deployment" }, { status: 503 });
  }

  return json(deployment, { status: 201 });
};

export const getDeployment = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) {
    return notFound("Deployment not found");
  }
  const userId = req.session.user.id;
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, id))
    .limit(1);

  if (!deployment) {
    return notFound("Deployment not found");
  }

  const project = await getProjectForUser(deployment.projectId, userId);
  if (!project) {
    return notFound("Deployment not found");
  }

  return json(deployment);
};

export const getDeploymentLog = async (req: RequestWithParamsAndSession) => {
  if (!isStorageConfigured()) {
    return json({ error: "S3 storage is not configured" }, { status: 503 });
  }

  const id = req.params["id"];
  if (!id) {
    return notFound("Deployment not found");
  }
  const userId = req.session.user.id;
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, id))
    .limit(1);

  if (!deployment) {
    return notFound("Deployment not found");
  }

  const project = await getProjectForUser(deployment.projectId, userId);
  if (!project) {
    return notFound("Deployment not found");
  }

  if (!deployment.buildLogKey) {
    return notFound("Build log not available");
  }

  const logUrl = presign(deployment.buildLogKey, { method: "GET", expiresIn: 300 });
  return json({ logUrl });
};

const deploymentLogChannel = (deploymentId: string): string =>
  `deployment:${deploymentId}:logs`;

export const streamDeploymentLog = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) {
    return notFound("Deployment not found");
  }
  const userId = req.session.user.id;
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, id))
    .limit(1);

  if (!deployment) {
    return notFound("Deployment not found");
  }

  const project = await getProjectForUser(deployment.projectId, userId);
  if (!project) {
    return notFound("Deployment not found");
  }

  const encoder = new TextEncoder();

  const sendEvent = (data: {
    type: string;
    content?: string;
    status?: string;
    fullLog?: string;
  }) => {
    return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  };

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let subscriber: Awaited<ReturnType<typeof getRedisSubscriber>> = null;

  const stream = new ReadableStream({
    async start(controller) {
      const statusPollInterval = 1500;
      let lastByteOffset = 0;
      let isFinished = false;
      let streamClosed = false;

      const checkStatusAndMaybeStream = async (): Promise<boolean> => {
        try {
          const [currentDeployment] = await db
            .select()
            .from(schema.deployments)
            .where(eq(schema.deployments.id, deployment.id))
            .limit(1);

          if (!currentDeployment) {
            streamClosed = true;
            controller.enqueue(sendEvent({ type: "error", content: "Deployment not found" }));
            controller.close();
            return true;
          }

          controller.enqueue(sendEvent({ type: "status", status: currentDeployment.status }));

          if (!subscriber && currentDeployment.buildLogKey && isStorageConfigured()) {
            try {
              const { text: newContent, bytesRead } = await getTextFromOffset(
                currentDeployment.buildLogKey,
                lastByteOffset
              );
              if (bytesRead > 0) {
                lastByteOffset += bytesRead;
                if (newContent) {
                  controller.enqueue(sendEvent({ type: "log", content: newContent }));
                }
              }
            } catch {
              // log file may not exist yet
            }
          }

          if (currentDeployment.status === "success" || currentDeployment.status === "failed") {
            streamClosed = true;
            let fullLog: string | undefined;
            if (
              currentDeployment.buildLogKey &&
              isStorageConfigured()
            ) {
              try {
                fullLog = await getText(currentDeployment.buildLogKey);
              } catch {
                // log file may be unavailable
              }
            }
            controller.enqueue(
              sendEvent({
                type: "done",
                status: currentDeployment.status,
                ...(fullLog !== undefined && fullLog !== "" ? { fullLog } : {})
              })
            );
            controller.close();
            return true;
          }

          return false;
        } catch (err) {
          console.error("SSE stream error:", err);
          streamClosed = true;
          controller.enqueue(sendEvent({ type: "error", content: "Stream error" }));
          controller.close();
          return true;
        }
      };

      const cleanup = () => {
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
        if (subscriber !== null) {
          subscriber.unsubscribe().catch(() => {});
          subscriber.close();
          subscriber = null;
        }
      };

      isFinished = await checkStatusAndMaybeStream();
      if (isFinished) {
        cleanup();
        return;
      }

      const redisSub = await getRedisSubscriber();
      if (redisSub) {
        subscriber = redisSub;
        const channel = deploymentLogChannel(deployment.id);
        await subscriber.subscribe(channel, (message: string) => {
          if (!streamClosed && message) {
            controller.enqueue(sendEvent({ type: "log", content: message }));
          }
        });
      }

      intervalId = setInterval(async () => {
        const done = await checkStatusAndMaybeStream();
        if (done) {
          cleanup();
        }
      }, statusPollInterval);
    },
    cancel() {
      if (intervalId !== null) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (subscriber !== null) {
        subscriber.unsubscribe().catch(() => {});
        subscriber.close();
        subscriber = null;
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
};
