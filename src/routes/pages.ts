import { and, desc, eq } from "drizzle-orm";
import { getSession, type RequestWithParamsAndSession } from "../auth/session";
import { getStartedAt, getServer } from "../appContext";
import { config } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { renderHealthPage, type HealthData } from "../health/HealthPage";
import { json, notFound, type RequestWithParams } from "../http/helpers";
import { renderAdminExamplesPage, type AdminExamplesPageData } from "../ui/AdminExamplesPage";
import { renderDashboardPage, type DashboardData } from "../ui/DashboardPage";
import { renderLandingPage } from "../ui/LandingPage";
import { renderNotFoundPage } from "../ui/NotFoundPage";
import { renderDeploymentDetailPage, type DeploymentDetailData } from "../ui/DeploymentDetailPage";
import { renderProjectDetailPage, type ProjectDetailData } from "../ui/ProjectDetailPage";
import { renderProjectsPage, type ProjectsPageData } from "../ui/ProjectsPage";
import { getBuildContainerConfig } from "../admin/buildSettings";
import { buildExampleRowsForUser } from "../admin/exampleDeployments";
import { getDeployment } from "./deployments";
import { getProject } from "./projects";

export const wantsHtml = (req: Request) => {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("text/html");
};

export const notFoundPage = async () => {
  const stream = await renderNotFoundPage();
  return new Response(stream, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

const renderLoginPage = (redirectTo: string) => {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in - pdploy</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css" />
  <style>
    body { background: #000; color: #ededed; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .box { background: #111; border: 1px solid #333; }
    .button.is-primary { background: #fff; color: #000; }
  </style>
</head>
<body>
  <div class="box">
    <h1 class="title is-4" style="color:#ededed">Sign in</h1>
    <p class="mb-4" style="color:#888">Use your GitHub account to continue.</p>
    <button type="button" id="signin" class="button is-primary">Sign in with GitHub</button>
  </div>
  <script>
    document.getElementById("signin").addEventListener("click", async function() {
      this.disabled = true;
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "github", callbackURL: "${redirectTo.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}" })
      });
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      const loc = res.headers.get("Location");
      if (loc) {
        window.location.href = loc;
        return;
      }
      const data = await res.json().catch(function() { return {}; });
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      this.disabled = false;
      alert("Sign-in failed. Please try again.");
    });
  </script>
</body>
</html>`;
};

export const loginPage = async (req: RequestWithParams) => {
  const session = await getSession(req);
  if (session) {
    const url = new URL(req.url);
    const redirectTo = url.searchParams.get("redirect") ?? "/dashboard";
    return Response.redirect(new URL(redirectTo, url.origin).toString(), 302);
  }
  const url = new URL(req.url);
  const redirectTo = url.searchParams.get("redirect") ?? "/dashboard";
  const html = renderLoginPage(redirectTo);
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

export const landingPage = async (req: RequestWithParams) => {
  const session = await getSession(req);
  if (session) {
    const url = new URL(req.url);
    return Response.redirect(new URL("/dashboard", url.origin).toString(), 302);
  }
  const stream = await renderLandingPage();
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
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

export const dashboardPage = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;
  const healthData = buildHealthData();
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.createdAt));
  const deploymentsWithProjects = await db
    .select({
      deployment: schema.deployments,
      projectName: schema.projects.name
    })
    .from(schema.deployments)
    .leftJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.deployments.createdAt))
    .limit(10);

  const data: DashboardData = {
    health: healthData,
    user: { name: req.session.user.name ?? null, email: req.session.user.email, image: req.session.user.image ?? null },
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

export const projectsPage = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;
  const [githubAccount] = await db
    .select({ scope: schema.accounts.scope })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "github")))
    .limit(1);
  const githubScopes = githubAccount?.scope
    ? githubAccount.scope
        .split(",")
        .map((scope) => scope.trim())
        .filter(Boolean)
    : [];
  const hasRepoAccess = githubScopes.includes("repo") || githubScopes.includes("public_repo");
  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.userId, userId))
    .orderBy(desc(schema.projects.createdAt));
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
    user: { name: req.session.user.name ?? null, email: req.session.user.email, image: req.session.user.image ?? null },
    github: {
      linked: Boolean(githubAccount),
      hasRepoAccess
    },
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

export const projectDetailPage = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) {
    return wantsHtml(req) ? notFoundPage() : notFound("Project not found");
  }
  const userId = req.session.user.id;
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, id), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) {
    return wantsHtml(req) ? notFoundPage() : notFound("Project not found");
  }

  const deployments = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.projectId, project.id))
    .orderBy(desc(schema.deployments.createdAt));
  const currentDeployment = deployments.find((d) => d.id === project.currentDeploymentId);

  const data: ProjectDetailData = {
    user: { name: req.session.user.name ?? null, email: req.session.user.email, image: req.session.user.image ?? null },
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

export const deploymentDetailPage = async (req: RequestWithParamsAndSession) => {
  const id = req.params["id"];
  if (!id) {
    return wantsHtml(req) ? notFoundPage() : notFound("Deployment not found");
  }
  const userId = req.session.user.id;
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, id))
    .limit(1);

  if (!deployment) {
    return wantsHtml(req) ? notFoundPage() : notFound("Deployment not found");
  }

  const [project] = await db
    .select({ id: schema.projects.id, name: schema.projects.name })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, deployment.projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) {
    return wantsHtml(req) ? notFoundPage() : notFound("Deployment not found");
  }

  const previewUrl = buildPreviewUrl(deployment.shortId);
  const data: DeploymentDetailData = {
    user: { name: req.session.user.name ?? null, email: req.session.user.email, image: req.session.user.image ?? null },
    deployment: {
      ...deployment,
      createdAt: deployment.createdAt.toISOString(),
      finishedAt: deployment.finishedAt?.toISOString() ?? null,
      previewUrl
    },
    project: { id: project.id, name: project.name }
  };

  const stream = await renderDeploymentDetailPage(data);
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

export const adminExamplesPage = async (req: RequestWithParamsAndSession) => {
  const userId = req.session.user.id;
  const data: AdminExamplesPageData = {
    user: {
      name: req.session.user.name ?? null,
      email: req.session.user.email,
      image: req.session.user.image ?? null
    },
    examples: await buildExampleRowsForUser(userId),
    buildSettings: await getBuildContainerConfig()
  };

  const stream = await renderAdminExamplesPage(data);
  return new Response(stream, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
};

export const handleProjectRoute = async (req: RequestWithParamsAndSession) => {
  if (wantsHtml(req)) {
    return projectDetailPage(req);
  }
  return getProject(req);
};

export const handleDeploymentRoute = async (req: RequestWithParamsAndSession) => {
  if (wantsHtml(req)) {
    return deploymentDetailPage(req);
  }
  return getDeployment(req);
};

export const health = async (req: RequestWithParams) => {
  const healthData = buildHealthData();
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/html")) {
    const session = await getSession(req);
    const data: HealthData = {
      ...healthData,
      user: session ? { name: session.user.name ?? null, email: session.user.email, image: session.user.image ?? null } : null
    };
    const stream = await renderHealthPage(data);
    return new Response(stream, {
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }
  return json(healthData);
};
