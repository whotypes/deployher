import { desc, eq } from "drizzle-orm";
import { getStartedAt, getServer } from "../appContext";
import { config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { renderHealthPage, type HealthData } from "../health/HealthPage";
import { json, notFound, type RequestWithParams } from "../http/helpers";
import { renderDashboardPage, type DashboardData } from "../ui/DashboardPage";
import { renderDeploymentDetailPage, type DeploymentDetailData } from "../ui/DeploymentDetailPage";
import { renderProjectDetailPage, type ProjectDetailData } from "../ui/ProjectDetailPage";
import { renderProjectsPage, type ProjectsPageData } from "../ui/ProjectsPage";
import { getDeployment } from "./deployments";
import { getProject } from "./projects";

export const wantsHtml = (req: Request) => {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html");
};

const buildHealthData = (): HealthData => {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  const server = getServer();
  const startedAt = getStartedAt();
  return {
    status: "ok",
    environment: config.env,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    startedAt: new Date(startedAt).toISOString(),
    now: new Date().toISOString(),
    bunVersion: Bun.version,
    hostname: server?.hostname ?? config.hostname,
    port: server?.port ?? config.port,
    pid: process.pid,
    pendingRequests: server?.pendingRequests ?? 0,
    pendingWebSockets: server?.pendingWebSockets ?? 0,
    memory: {
      rss: memory.rss,
      heapTotal: memory.heapTotal,
      heapUsed: memory.heapUsed,
      external: memory.external
    },
    cpu: {
      user: cpu.user,
      system: cpu.system
    },
    domains: {
      dev: `${config.devProtocol}://{project}.${config.devDomain}`,
      prod: `${config.prodProtocol}://{project}.${config.prodDomain}`
    }
  };
};

const buildPreviewUrl = (shortId: string) =>
  `${config.devProtocol}://${shortId}.${config.devDomain}:${config.port}`;

export const dashboardPage = async (req: RequestWithParams) => {
  const healthData = buildHealthData();
  const projects = await db.select().from(schema.projects).orderBy(desc(schema.projects.createdAt));
  const deploymentsWithProjects = await db
    .select({
      deployment: schema.deployments,
      projectName: schema.projects.name
    })
    .from(schema.deployments)
    .leftJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .orderBy(desc(schema.deployments.createdAt))
    .limit(10);

  const data: DashboardData = {
    health: healthData,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      repoUrl: p.repoUrl,
      currentDeploymentId: p.currentDeploymentId
    })),
    recentDeployments: deploymentsWithProjects.map((d) => ({
      id: d.deployment.id,
      projectId: d.deployment.projectId,
      projectName: d.projectName ?? "Unknown",
      status: d.deployment.status,
      createdAt: d.deployment.createdAt.toISOString(),
      previewUrl: d.deployment.previewUrl
    }))
  };

  const stream = await renderDashboardPage(data);
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

export const projectsPage = async (req: RequestWithParams) => {
  const projects = await db.select().from(schema.projects).orderBy(desc(schema.projects.createdAt));
  const projectIds = projects.map((p) => p.id);
  const currentDeployments =
    projectIds.length > 0
      ? await db
          .select()
          .from(schema.deployments)
          .where(
            eq(
              schema.deployments.id,
              db
                .select({ id: schema.projects.currentDeploymentId })
                .from(schema.projects)
                .where(eq(schema.projects.id, schema.deployments.projectId))
            )
          )
      : [];

  const deploymentStatusMap = new Map(currentDeployments.map((d) => [d.id, d.status]));
  const data: ProjectsPageData = {
    projects: projects.map((p) => ({
      ...p,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      currentDeploymentStatus: p.currentDeploymentId
        ? deploymentStatusMap.get(p.currentDeploymentId)
        : undefined
    }))
  };

  const stream = await renderProjectsPage(data);
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

export const projectDetailPage = async (req: RequestWithParams<{ id: string }>) => {
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, req.params.id))
    .limit(1);

  if (!project) {
    return notFound("Project not found");
  }

  const deployments = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.projectId, project.id))
    .orderBy(desc(schema.deployments.createdAt));
  const currentDeployment = deployments.find((d) => d.id === project.currentDeploymentId);

  const data: ProjectDetailData = {
    project: {
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString()
    },
    deployments: deployments.map((d) => ({
      ...d,
      createdAt: d.createdAt.toISOString(),
      finishedAt: d.finishedAt?.toISOString() ?? null,
      previewUrl: buildPreviewUrl(d.shortId)
    })),
    currentPreviewUrl:
      currentDeployment && currentDeployment.status === "success"
        ? buildPreviewUrl(currentDeployment.shortId)
        : null
  };

  const stream = await renderProjectDetailPage(data);
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

export const deploymentDetailPage = async (req: RequestWithParams<{ id: string }>) => {
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, req.params.id))
    .limit(1);

  if (!deployment) {
    return notFound("Deployment not found");
  }

  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(eq(schema.projects.id, deployment.projectId))
    .limit(1);

  const previewUrl = buildPreviewUrl(deployment.shortId);
  const data: DeploymentDetailData = {
    deployment: {
      ...deployment,
      createdAt: deployment.createdAt.toISOString(),
      finishedAt: deployment.finishedAt?.toISOString() ?? null,
      previewUrl
    },
    project: project ?? { id: deployment.projectId, name: "Unknown" }
  };

  const stream = await renderDeploymentDetailPage(data);
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

export const handleProjectRoute = async (req: RequestWithParams<{ id: string }>) => {
  if (wantsHtml(req)) {
    return projectDetailPage(req);
  }
  return getProject(req);
};

export const handleDeploymentRoute = async (req: RequestWithParams<{ id: string }>) => {
  if (wantsHtml(req)) {
    return deploymentDetailPage(req);
  }
  return getDeployment(req);
};

export const health = async (req: RequestWithParams) => {
  const data = buildHealthData();
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const stream = await renderHealthPage(data);
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  return json(data);
};
