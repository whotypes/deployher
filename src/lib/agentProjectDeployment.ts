import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { publishDeploymentEvent } from "../deploymentEvents";
import {
  ensureAgentProjectDeployer,
  resolveAgentProjectDeployerPlan
} from "./agentProjectDeployer";
import {
  buildAgentProjectConfigJson,
  stringifyAgentProjectConfig,
  type AgentProjectConfigComponents
} from "./agentProjectConfig";
import { onDeploymentTerminalStatus } from "./projectAlerts";

const CONFIG_FILE_NAME = "config.json";

const appendLog = async (deploymentId: string, content: string): Promise<void> => {
  await publishDeploymentEvent(deploymentId, {
    type: "log",
    content: `[${new Date().toISOString()}] ${content}\n`
  });
};

const setDeploymentStatus = async (
  deploymentId: string,
  status: "building" | "success" | "failed",
  extra: Partial<typeof schema.deployments.$inferInsert> = {}
): Promise<void> => {
  await db
    .update(schema.deployments)
    .set({
      status,
      finishedAt: status === "success" || status === "failed" ? new Date() : null,
      ...extra
    })
    .where(eq(schema.deployments.id, deploymentId));
  await publishDeploymentEvent(deploymentId, { type: "status", status });
  if (status === "success" || status === "failed") {
    await publishDeploymentEvent(deploymentId, { type: "done", status });
  }
};

export const assertAgentDeploymentPreconditions = async (): Promise<void> => {
  await resolveAgentProjectDeployerPlan();
};

export const runAgentProjectDeployment = async (deploymentId: string): Promise<void> => {
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, deploymentId))
    .limit(1);

  if (!deployment) {
    throw new Error(`Deployment not found: ${deploymentId}`);
  }

  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, deployment.projectId))
    .limit(1);

  if (!project) {
    throw new Error(`Project not found for deployment ${deploymentId}`);
  }

  const configComponents = (deployment.agentConfigSnapshot ??
    project.agentConfig ??
    {}) as AgentProjectConfigComponents;

  try {
    await setDeploymentStatus(deploymentId, "building", {
      previewUrl: null,
      buildLogKey: null
    });
    await appendLog(deploymentId, `Starting Picoclaw deployment for project "${project.name}".`);

    const plan = await resolveAgentProjectDeployerPlan();
    const configPath = path.join(plan.dataDir, CONFIG_FILE_NAME);
    await mkdir(plan.dataDir, { recursive: true });
    await writeFile(configPath, stringifyAgentProjectConfig(configComponents), "utf8");
    await appendLog(deploymentId, `Wrote ${CONFIG_FILE_NAME} to ${configPath}.`);

    const renderedConfig = buildAgentProjectConfigJson(configComponents);
    await appendLog(
      deploymentId,
      `Prepared config with sections: ${Object.keys(renderedConfig).join(", ")}.`
    );

    const result = await ensureAgentProjectDeployer(undefined, { replace: true });
    if (result.stdout) {
      await appendLog(deploymentId, result.stdout);
    }
    if (result.stderr) {
      await appendLog(deploymentId, result.stderr);
    }
    await appendLog(
      deploymentId,
      `Picoclaw launcher ready at ${result.launcherUrl} using data dir ${result.dataDir}.`
    );

    await setDeploymentStatus(deploymentId, "success");
    await onDeploymentTerminalStatus(project.id, "success");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Agent deployment failed";
    console.error(`Agent deployment ${deploymentId} failed:`, error);
    await appendLog(deploymentId, message);
    await setDeploymentStatus(deploymentId, "failed");
    await onDeploymentTerminalStatus(project.id, "failed");
  }
};
