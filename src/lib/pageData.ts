import { and, count, desc, eq, inArray } from "drizzle-orm";
import { getStartedAt, getServer } from "../appContext";
import { buildDevSubdomainUrl, config, getDevProjectUrlPattern, getProdProjectUrlPattern } from "../config";
import { db } from "../db/db";
import * as schema from "../db/schema";
import { getBuildContainerConfig } from "../admin/buildSettings";
import { buildExampleRowsForUser } from "../admin/exampleDeployments";
import type { HealthData } from "../health/HealthPage";
import { effectiveDeploymentPreviewUrl } from "../lib/previewDeploymentUrl";
import { parseSidebarProjectDeploymentStatus } from "../lib/sidebarProjectDeploymentStatus";
import { getWorkspaceDashboardMetrics } from "../lib/workspaceDashboardMetrics";
import type { AdminExamplesPageData } from "../ui/AdminExamplesPage";
import type { DashboardData } from "../ui/DashboardPage";
import type { DeploymentDetailData } from "../ui/DeploymentDetailPage";
import type { NewProjectPageData } from "../ui/NewProjectPage";
import type { ProjectDetailData } from "../ui/ProjectDetailPage";
import type { ProjectObservabilityData } from "../ui/ProjectObservabilityPage";
import type { ProjectSettingsData } from "../ui/ProjectSettingsPage";
import type { ProjectsPageData } from "../ui/ProjectsPage";
import type { LayoutUser } from "../ui/layoutUser";
import {
  getSidebarFeaturedDeploymentForProject,
  listSidebarProjectSummariesForUser
} from "../routes/projects";

export type SessionUserForPage = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: typeof schema.users.$inferSelect.role;
};

export const toLayoutUser = (user: SessionUserForPage): LayoutUser => ({
  name: user.name ?? null,
  email: user.email,
  image: user.image ?? null,
  role: user.role
});

export const buildHealthCore = (): Omit<HealthData, "pathname" | "user" | "sidebarProjects"> => {
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
      dev: getDevProjectUrlPattern(),
      prod: getProdProjectUrlPattern()
    }
  };
};

const buildPreviewUrl = (shortId: string) => buildDevSubdomainUrl(shortId);

export const buildDashboardData = async (
  user: SessionUserForPage,
  pathname: string
): Promise<DashboardData> => {
  const userId = user.id;
  const healthData = buildHealthCore();
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
    .limit(15);

  const deploymentStatsRows = await db
    .select({
      status: schema.deployments.status,
      n: count()
    })
    .from(schema.deployments)
    .innerJoin(schema.projects, eq(schema.deployments.projectId, schema.projects.id))
    .where(eq(schema.projects.userId, userId))
    .groupBy(schema.deployments.status);

  const deploymentsByStatus: Record<string, number> = {};
  for (const row of deploymentStatsRows) {
    deploymentsByStatus[row.status] = Number(row.n);
  }
  const deploymentTotal = Object.values(deploymentsByStatus).reduce((a, b) => a + b, 0);

  const sidebarProjects = await listSidebarProjectSummariesForUser(userId);
  const workspaceCharts = await getWorkspaceDashboardMetrics(userId);

  return {
    pathname,
    health: healthData,
    user: toLayoutUser(user),
    sidebarProjects,
    workspaceCharts,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      repoUrl: p.repoUrl,
      currentDeploymentId: p.currentDeploymentId
    })),
    recentDeployments: deploymentsWithProjects.map((d) => ({
      id: d.deployment.id,
      projectId: d.deployment.projectId,
      shortId: d.deployment.shortId,
      projectName: d.projectName ?? "Unknown",
      status: d.deployment.status,
      createdAt: d.deployment.createdAt.toISOString(),
      previewUrl: effectiveDeploymentPreviewUrl(
        d.deployment.status,
        d.deployment.previewUrl,
        d.deployment.shortId
      )
    })),
    stats: {
      projectCount: projects.length,
      deploymentTotal,
      deploymentsByStatus
    }
  };
};

export const buildProjectsPageData = async (
  user: SessionUserForPage,
  pathname: string,
  csrfToken: string
): Promise<ProjectsPageData> => {
  const userId = user.id;
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
  const deploymentIds = projects
    .map((p) => p.currentDeploymentId)
    .filter((id): id is NonNullable<typeof id> => id != null);
  const currentDeployments =
    deploymentIds.length > 0
      ? await db.select().from(schema.deployments).where(inArray(schema.deployments.id, deploymentIds))
      : [];
  const deploymentById = new Map(currentDeployments.map((d) => [d.id, d]));

  const sidebarProjects = projects.map((p) => {
    const dep = p.currentDeploymentId ? deploymentById.get(p.currentDeploymentId) : undefined;
    return {
      id: p.id,
      name: p.name,
      deploymentStatus: parseSidebarProjectDeploymentStatus(dep?.status),
      siteIconUrl: p.siteIconUrl ?? null,
      siteOgImageUrl: p.siteOgImageUrl ?? null,
      previewUrl: effectiveDeploymentPreviewUrl(dep?.status, dep?.previewUrl, dep?.shortId)
    };
  });

  return {
    pathname,
    user: toLayoutUser(user),
    csrfToken,
    sidebarProjects,
    github: {
      linked: Boolean(githubAccount),
      hasRepoAccess
    },
    projects: projects.map((p) => {
      const dep = p.currentDeploymentId ? deploymentById.get(p.currentDeploymentId) : undefined;
      return {
        id: p.id,
        name: p.name,
        repoUrl: p.repoUrl,
        branch: p.branch,
        workspaceRootDir: p.workspaceRootDir,
        projectRootDir: p.projectRootDir,
        frameworkHint: p.frameworkHint,
        previewMode: p.previewMode,
        serverPreviewTarget: p.serverPreviewTarget,
        runtimeImageMode: p.runtimeImageMode,
        dockerfilePath: p.dockerfilePath,
        dockerBuildTarget: p.dockerBuildTarget,
        skipHostStrategyBuild: p.skipHostStrategyBuild,
        runtimeContainerPort: p.runtimeContainerPort,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        currentDeploymentId: p.currentDeploymentId,
        siteIconUrl: p.siteIconUrl ?? null,
        currentDeployment: dep
          ? {
              id: dep.id,
              shortId: dep.shortId,
              status: dep.status,
              previewUrl: effectiveDeploymentPreviewUrl(dep.status, dep.previewUrl, dep.shortId),
              buildStrategy: dep.buildStrategy,
              serveStrategy: dep.serveStrategy,
              previewResolution: dep.previewResolution,
              buildPreviewMode: dep.buildPreviewMode,
              buildServerPreviewTarget: dep.buildServerPreviewTarget,
              createdAt: dep.createdAt.toISOString(),
              finishedAt: dep.finishedAt?.toISOString() ?? null
            }
          : null
      };
    })
  };
};

export const buildNewProjectPageData = async (
  user: SessionUserForPage,
  pathname: string,
  csrfToken: string
): Promise<NewProjectPageData> => {
  const userId = user.id;
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
  const deploymentIds = projects
    .map((p) => p.currentDeploymentId)
    .filter((id): id is NonNullable<typeof id> => id != null);
  const currentDeployments =
    deploymentIds.length > 0
      ? await db.select().from(schema.deployments).where(inArray(schema.deployments.id, deploymentIds))
      : [];
  const deploymentById = new Map(currentDeployments.map((d) => [d.id, d]));

  const sidebarProjects = projects.map((p) => {
    const dep = p.currentDeploymentId ? deploymentById.get(p.currentDeploymentId) : undefined;
    return {
      id: p.id,
      name: p.name,
      deploymentStatus: parseSidebarProjectDeploymentStatus(dep?.status),
      siteIconUrl: p.siteIconUrl ?? null,
      siteOgImageUrl: p.siteOgImageUrl ?? null,
      previewUrl: effectiveDeploymentPreviewUrl(dep?.status, dep?.previewUrl, dep?.shortId)
    };
  });

  return {
    pathname,
    user: toLayoutUser(user),
    csrfToken,
    sidebarProjects,
    github: {
      linked: Boolean(githubAccount),
      hasRepoAccess
    }
  };
};

export const buildProjectObservabilityData = async (
  user: SessionUserForPage,
  pathname: string,
  csrfToken: string,
  projectId: string
): Promise<ProjectObservabilityData | null> => {
  const userId = user.id;
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) return null;

  const sidebarProjects = await listSidebarProjectSummariesForUser(userId);
  const sidebarFeaturedDeployment = await getSidebarFeaturedDeploymentForProject(project.id);

  const runtimeLogsAvailable = config.runner.previewEnabled && Boolean(config.runner.url?.trim());
  let currentDep: (typeof schema.deployments.$inferSelect) | null = null;
  if (project.currentDeploymentId) {
    const [row] = await db
      .select()
      .from(schema.deployments)
      .where(eq(schema.deployments.id, project.currentDeploymentId))
      .limit(1);
    currentDep = row ?? null;
  }

  return {
    pathname,
    user: toLayoutUser(user),
    csrfToken,
    sidebarProjects,
    sidebarFeaturedDeployment,
    project: {
      id: project.id,
      name: project.name
    },
    runtimeLogs: {
      available: runtimeLogsAvailable,
      deploymentId: currentDep?.id ?? null,
      deploymentShortId: currentDep?.shortId ?? null,
      eligible:
        runtimeLogsAvailable &&
        currentDep !== null &&
        currentDep.serveStrategy === "server" &&
        currentDep.status === "success"
    }
  };
};

export const buildProjectDetailData = async (
  user: SessionUserForPage,
  pathname: string,
  csrfToken: string,
  projectId: string
): Promise<ProjectDetailData | null> => {
  const userId = user.id;
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) return null;

  const deployments = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.projectId, project.id))
    .orderBy(desc(schema.deployments.createdAt));
  const currentDeployment = deployments.find((d) => d.id === project.currentDeploymentId);

  const sidebarProjects = await listSidebarProjectSummariesForUser(userId);

  return {
    pathname,
    user: toLayoutUser(user),
    csrfToken,
    sidebarProjects,
    project: {
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      siteIconUrl: project.siteIconUrl ?? null,
      siteOgImageUrl: project.siteOgImageUrl ?? null,
      siteMetaFetchedAt: project.siteMetaFetchedAt ? project.siteMetaFetchedAt.toISOString() : null,
      siteMetaError: project.siteMetaError ?? null
    },
    deployments: deployments.map((d) => ({
      id: d.id,
      shortId: d.shortId,
      projectId: d.projectId,
      artifactPrefix: d.artifactPrefix,
      status: d.status,
      serveStrategy: d.serveStrategy,
      buildPreviewMode: d.buildPreviewMode,
      buildLogKey: d.buildLogKey,
      previewUrl: buildPreviewUrl(d.shortId),
      createdAt: d.createdAt.toISOString(),
      finishedAt: d.finishedAt?.toISOString() ?? null
    })),
    currentPreviewUrl:
      currentDeployment && currentDeployment.status === "success"
        ? buildPreviewUrl(currentDeployment.shortId)
        : null,
    runtimeLogsAvailable: config.runner.previewEnabled && Boolean(config.runner.url?.trim())
  };
};

export const buildDeploymentDetailData = async (
  user: SessionUserForPage,
  pathname: string,
  csrfToken: string,
  deploymentId: string
): Promise<DeploymentDetailData | null> => {
  const userId = user.id;
  const [deployment] = await db
    .select()
    .from(schema.deployments)
    .where(eq(schema.deployments.id, deploymentId))
    .limit(1);

  if (!deployment) return null;

  const [project] = await db
    .select({
      id: schema.projects.id,
      name: schema.projects.name,
      currentDeploymentId: schema.projects.currentDeploymentId
    })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, deployment.projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) return null;

  const previewUrl = buildPreviewUrl(deployment.shortId);
  const sidebarProjects = await listSidebarProjectSummariesForUser(userId);
  const sidebarFeaturedDeployment = await getSidebarFeaturedDeploymentForProject(project.id);
  const runnerConfigured = config.runner.previewEnabled && Boolean(config.runner.url?.trim());
  const hasRuntimeImage =
    Boolean(deployment.runtimeImagePullRef?.trim()) ||
    Boolean(deployment.runtimeImageArtifactKey?.trim());
  const previewEnsureAvailable =
    runnerConfigured &&
    deployment.status === "success" &&
    deployment.serveStrategy === "server" &&
    hasRuntimeImage;
  return {
    pathname,
    user: toLayoutUser(user),
    csrfToken,
    sidebarProjects,
    sidebarFeaturedDeployment,
    deployment: {
      ...deployment,
      createdAt: deployment.createdAt.toISOString(),
      finishedAt: deployment.finishedAt?.toISOString() ?? null,
      previewUrl
    },
    project: {
      id: project.id,
      name: project.name,
      currentDeploymentId: project.currentDeploymentId
    },
    runtimeLogsAvailable: runnerConfigured,
    previewEnsureAvailable
  };
};

export const buildAdminExamplesData = async (
  user: SessionUserForPage,
  pathname: string,
  csrfToken: string
): Promise<AdminExamplesPageData> => {
  const userId = user.id;
  const sidebarProjects = await listSidebarProjectSummariesForUser(userId);
  return {
    pathname,
    user: toLayoutUser(user),
    csrfToken,
    sidebarProjects,
    examples: await buildExampleRowsForUser(userId),
    buildSettings: await getBuildContainerConfig()
  };
};

export const buildProjectSettingsData = async (
  user: SessionUserForPage,
  pathname: string,
  csrfToken: string,
  projectId: string,
  activeSection: ProjectSettingsData["activeSection"]
): Promise<ProjectSettingsData | null> => {
  const userId = user.id;
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);

  if (!project) return null;

  const sidebarProjects = await listSidebarProjectSummariesForUser(userId);
  const sidebarFeaturedDeployment = await getSidebarFeaturedDeploymentForProject(project.id);

  return {
    pathname,
    user: toLayoutUser(user),
    csrfToken,
    sidebarProjects,
    sidebarFeaturedDeployment,
    project: {
      ...project,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      siteIconUrl: project.siteIconUrl ?? null,
      siteOgImageUrl: project.siteOgImageUrl ?? null,
      siteMetaFetchedAt: project.siteMetaFetchedAt ? project.siteMetaFetchedAt.toISOString() : null,
      siteMetaError: project.siteMetaError ?? null
    },
    activeSection
  };
};

export const buildAccountPageData = async (
  user: SessionUserForPage,
  pathname: string,
  csrfToken: string
) => {
  const userId = user.id;
  const rows = await db
    .select({ providerId: schema.accounts.providerId })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId));
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
  const sidebarProjects = await listSidebarProjectSummariesForUser(userId);

  return {
    pathname,
    sidebarProjects,
    user: {
      name: user.name ?? null,
      email: user.email,
      image: user.image ?? null,
      role: user.role
    },
    linkedAccounts: rows.map((r) => ({ providerId: r.providerId })),
    hasRepoAccess,
    csrfToken
  };
};
