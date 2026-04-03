import { and, desc, eq } from "drizzle-orm";
import Docker from "dockerode";
import { type RequestWithParamsAndSession } from "../auth/session";
import { db } from "../db/db";
import {
  deploymentEventChannel,
  loadDeploymentEventHistory,
  publishDeploymentEvent,
  type DeploymentStreamEvent
} from "../deploymentEvents";
import * as schema from "../db/schema";
import { badRequest, json, notFound, parseJson } from "../http/helpers";
import { getGitHubAccessToken } from "../lib/githubAccess";
import { enqueueDeployment } from "../queue";
import { getRedisSubscriber, isRedisConfigured } from "../redis";
import { storeRepoCredential } from "../repoCredentials";
import { getText, getTextFromOffset, isStorageConfigured } from "../storage";
import { generateShortId } from "../utils/shortId";

const DOCKER_SOCKET_PATH =
  (process.env.DOCKER_SOCKET_PATH ?? "/var/run/docker.sock").trim() || "/var/run/docker.sock";
const dockerClient = new Docker({ socketPath: DOCKER_SOCKET_PATH });
const DOCKER_DEPLOYMENT_LABEL_KEY = "io.pdploy.deployment";

const getProjectForUser = async (projectId: string, userId: string) => {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  return project ?? null;
};

const MAX_DEPLOYMENT_ENV_FILE_BYTES = 64 * 1024;

const sanitizeDockerLabelValue = (value: string): string => value.replace(/[^A-Za-z0-9_.-]/g, "_");

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

  const body = await parseJson<{ artifactPrefix?: unknown; envFile?: unknown }>(req);
  const artifactPrefix =
    body && typeof body.artifactPrefix === "string" && body.artifactPrefix.trim()
      ? body.artifactPrefix.trim()
      : `artifacts/${project.id}/${Date.now()}`;
  if (body && body.envFile !== undefined && typeof body.envFile !== "string") {
    return badRequest("envFile must be a string");
  }

  const normalizedEnvFile =
    body && typeof body.envFile === "string" ? body.envFile.replace(/\r\n?/g, "\n") : "";
  const envFile = normalizedEnvFile.trim() ? normalizedEnvFile : undefined;
  if (envFile && Buffer.byteLength(envFile, "utf8") > MAX_DEPLOYMENT_ENV_FILE_BYTES) {
    return badRequest(
      `envFile exceeds ${MAX_DEPLOYMENT_ENV_FILE_BYTES} bytes (${Buffer.byteLength(envFile, "utf8")} bytes provided)`
    );
  }

  const shortId = generateShortId();

  const [deployment] = await db
    .insert(schema.deployments)
    .values({
      projectId: project.id,
      shortId,
      artifactPrefix,
      status: "queued",
      buildPreviewMode: project.previewMode,
      buildServerPreviewTarget: project.serverPreviewTarget
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
    let repoCredentialId: string | undefined;
    if (project.repoUrl.includes("github.com/")) {
      const githubAuth = await getGitHubAccessToken(req);
      if (githubAuth.requiresReauth) {
        await db
          .update(schema.deployments)
          .set({ status: "failed", finishedAt: new Date() })
          .where(eq(schema.deployments.id, deployment.id));
        return json(
          { error: "GitHub authentication expired. Please re-link GitHub before deploying." },
          { status: 401 }
        );
      }
      if (githubAuth.accessToken) {
        repoCredentialId = await storeRepoCredential(deployment.id, githubAuth.accessToken);
      }
    }

    await enqueueDeployment(deployment.id, { envFile, userId, repoCredentialId });
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

export const cancelDeployment = async (req: RequestWithParamsAndSession) => {
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

  if (deployment.status !== "queued" && deployment.status !== "building") {
    return badRequest("Only queued or building deployments can be cancelled");
  }

  const now = new Date();
  await db
    .update(schema.deployments)
    .set({
      status: "failed",
      finishedAt: now
    })
    .where(eq(schema.deployments.id, deployment.id));

  await publishDeploymentEvent(deployment.id, {
    type: "log",
    content: `[${now.toISOString()}] Build cancelled by user.\n`
  });
  await publishDeploymentEvent(deployment.id, { type: "status", status: "failed" });
  await publishDeploymentEvent(deployment.id, { type: "done", status: "failed" });

  try {
    const containers = await dockerClient.listContainers({
      all: true,
      filters: {
        label: [`${DOCKER_DEPLOYMENT_LABEL_KEY}=${sanitizeDockerLabelValue(deployment.id)}`]
      }
    });
    await Promise.all(
      containers.map(async (containerInfo) => {
        if (!containerInfo.Id) return;
        try {
          await dockerClient.getContainer(containerInfo.Id).remove({ force: true });
        } catch (error) {
          console.error("Failed to remove build container during cancellation:", error);
        }
      })
    );
  } catch (error) {
    console.error("Failed to list build containers during cancellation:", error);
  }

  return json({ ok: true, status: "failed", cancelled: true });
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

  try {
    const logText = await getText(deployment.buildLogKey);
    return new Response(logText, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch (error) {
    console.error("Failed to load deployment log from storage:", error);
    return notFound("Build log not available");
  }
};

const isTerminalDeploymentStatus = (status: string): status is "success" | "failed" =>
  status === "success" || status === "failed";

const utf8ByteLength = (text: string): number => Buffer.byteLength(text, "utf8");

const bootstrapDeploymentLogReplay = async (opts: {
  deploymentId: string;
  buildLogKey: string | null;
  requestedOffset: number;
  sendLog: (content: string) => void;
}): Promise<void> => {
  const { deploymentId, buildLogKey, requestedOffset, sendLog } = opts;

  if (requestedOffset > 0) {
    if (!buildLogKey || !isStorageConfigured()) return;
    try {
      const persistedLog = (await getTextFromOffset(buildLogKey, requestedOffset)).text;
      if (persistedLog) sendLog(persistedLog);
    } catch {
      /* object may not exist yet */
    }
    return;
  }

  const history = await loadDeploymentEventHistory(deploymentId);
  let dbLogText = "";
  for (const historicalEvent of history) {
    if (historicalEvent.type !== "log") continue;
    dbLogText += historicalEvent.content;
  }
  if (dbLogText) {
    sendLog(dbLogText);
  }

  const dbBytes = dbLogText ? utf8ByteLength(dbLogText) : 0;
  if (!buildLogKey || !isStorageConfigured()) return;

  try {
    const fullS3 = await getText(buildLogKey);
    if (!fullS3) return;
    const fullBuf = Buffer.from(fullS3, "utf8");
    if (fullBuf.length <= dbBytes) return;
    if (dbBytes > 0 && !fullS3.startsWith(dbLogText)) return;
    const tail = fullBuf.subarray(dbBytes).toString("utf8");
    if (tail) sendLog(tail);
  } catch {
    /* object may not exist yet */
  }
};

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

  const sendEvent = (data: DeploymentStreamEvent) =>
    encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
  const sendKeepalive = () => encoder.encode(`: keepalive\n\n`);
  const requestedOffset = (() => {
    const raw = new URL(req.url).searchParams.get("offset");
    if (!raw) return 0;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  })();

  let reconciliationInterval: ReturnType<typeof setInterval> | null = null;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let subscriber: Awaited<ReturnType<typeof getRedisSubscriber>> = null;

  const stream = new ReadableStream({
    async start(controller) {
      let streamClosed = false;

      const closeStream = () => {
        if (streamClosed) return;
        streamClosed = true;
        controller.close();
      };

      const sendStatusSnapshot = async (): Promise<boolean> => {
        try {
          const [currentDeployment] = await db
            .select()
            .from(schema.deployments)
            .where(eq(schema.deployments.id, deployment.id))
            .limit(1);

          if (!currentDeployment) {
            controller.enqueue(sendEvent({ type: "error", content: "Deployment not found" }));
            closeStream();
            return true;
          }

          controller.enqueue(sendEvent({ type: "status", status: currentDeployment.status }));
          if (isTerminalDeploymentStatus(currentDeployment.status)) {
            controller.enqueue(sendEvent({ type: "done", status: currentDeployment.status }));
            closeStream();
            return true;
          }

          return false;
        } catch (err) {
          console.error("SSE stream error:", err);
          controller.enqueue(sendEvent({ type: "error", content: "Stream error" }));
          closeStream();
          return true;
        }
      };

      const cleanup = () => {
        if (reconciliationInterval !== null) {
          clearInterval(reconciliationInterval);
          reconciliationInterval = null;
        }
        if (heartbeatInterval !== null) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        if (subscriber !== null) {
          subscriber.unsubscribe().catch(() => {});
          subscriber.close();
          subscriber = null;
        }
      };

      await bootstrapDeploymentLogReplay({
        deploymentId: deployment.id,
        buildLogKey: deployment.buildLogKey,
        requestedOffset,
        sendLog: (content) => {
          controller.enqueue(sendEvent({ type: "log", content }));
        }
      });

      heartbeatInterval = setInterval(() => {
        if (streamClosed) return;
        try {
          controller.enqueue(sendKeepalive());
        } catch {
          cleanup();
          closeStream();
        }
      }, 10000);

      const isFinished = await sendStatusSnapshot();
      if (isFinished) {
        cleanup();
        return;
      }

      const redisSub = await getRedisSubscriber();
      if (redisSub) {
        subscriber = redisSub;
        const channel = deploymentEventChannel(deployment.id);
        await subscriber.subscribe(channel, (message: string) => {
          if (streamClosed || !message) return;
          try {
            const event = JSON.parse(message) as DeploymentStreamEvent;
            controller.enqueue(sendEvent(event));
            if (event.type === "done") {
              cleanup();
              closeStream();
            }
          } catch {
            controller.enqueue(sendEvent({ type: "log", content: message }));
          }
        });
      } else {
        reconciliationInterval = setInterval(async () => {
          const done = await sendStatusSnapshot();
          if (done) {
            cleanup();
          }
        }, 5000);
      }
    },
    cancel() {
      if (reconciliationInterval !== null) {
        clearInterval(reconciliationInterval);
        reconciliationInterval = null;
      }
      if (heartbeatInterval !== null) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
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
