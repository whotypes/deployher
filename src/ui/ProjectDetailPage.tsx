import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { AppShell } from "./AppShell";
import type { ProjectDetailBootstrap } from "./client/ProjectDetailPageClient";
import { ProjectDetailInteractiveMount } from "./client/ProjectDetailInteractiveMount";
import { ProjectDeploymentsPanel } from "./client/ProjectDeploymentsPanel";
import { ProjectSiteGlyph } from "@/ui/client/ProjectSiteGlyph";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ScrollText, Settings } from "lucide-react";
import { pickFeaturedDeploymentFromSortedDesc } from "@/lib/sidebarFeaturedDeployment";
import type { AgentProjectConfigComponents, AgentProjectSourceType } from "@/lib/agentProjectConfig";

type Deployment = {
  id: string;
  shortId: string;
  projectId: string;
  artifactPrefix: string;
  status: string;
  serveStrategy: "static" | "server";
  buildPreviewMode: "auto" | "static" | "server" | null;
  buildLogKey: string | null;
  previewUrl: string | null;
  agentConfigSnapshot: AgentProjectConfigComponents | null;
  createdAt: string;
  finishedAt: string | null;
};

type Project = {
  id: string;
  sourceType: AgentProjectSourceType;
  name: string;
  repoUrl: string;
  branch: string;
  workspaceRootDir: string;
  projectRootDir: string;
  frameworkHint: "auto" | "nextjs" | "node" | "python" | "static";
  previewMode: "auto" | "static" | "server";
  serverPreviewTarget: "isolated-runner";
  runtimeImageMode: "auto" | "platform" | "dockerfile";
  dockerfilePath: string | null;
  dockerBuildTarget: string | null;
  skipHostStrategyBuild: boolean;
  runtimeContainerPort: number;
  installCommand: string | null;
  buildCommand: string | null;
  agentConfig: AgentProjectConfigComponents | null;
  createdAt: string;
  updatedAt: string;
  currentDeploymentId: string | null;
  siteIconUrl: string | null;
  siteOgImageUrl: string | null;
  siteMetaFetchedAt: string | null;
  siteMetaError: string | null;
};

export type ProjectDetailData = {
  pathname: string;
  project: Project;
  deployments: Deployment[];
  currentPreviewUrl: string | null;
  runtimeLogsAvailable: boolean;
  user?: LayoutUser | null;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
};

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "success": return "default";
    case "failed": return "destructive";
    case "building": return "outline";
    case "queued": return "secondary";
    default: return "secondary";
  }
};

export const ProjectDetailPage = ({ data }: { data: ProjectDetailData }) => {
  const { t } = useTranslation();
  const deploymentPreviewLabel = (deployment: Deployment): string => {
    if (deployment.buildPreviewMode === "server") return t("deployment.previewMode.server");
    if (deployment.buildPreviewMode === "static") return t("deployment.previewMode.static");
    return deployment.serveStrategy === "server"
      ? t("deployment.previewMode.server")
      : t("deployment.previewMode.static");
  };

  const deploymentStatusLabel = (s: string): string => {
    const k = s.toLowerCase();
    if (k === "building") return t("deployment.status.building");
    if (k === "queued") return t("deployment.status.queued");
    if (k === "success") return t("deployment.status.success");
    if (k === "failed") return t("deployment.status.failed");
    return s;
  };

  const deployments = data.deployments ?? [];

  const currentDeployment =
    data.project.currentDeploymentId !== null
      ? deployments.find((d) => d.id === data.project.currentDeploymentId) ?? null
      : null;

  const deploymentStatusesKey = useMemo(
    () => data.deployments.map((d) => `${d.id}:${d.status}`).join("|"),
    [data.deployments]
  );

  const interactiveBootstrap = useMemo((): ProjectDetailBootstrap => {
    const rows = data.deployments ?? [];
    return {
      projectId: data.project.id,
      projectName: data.project.name,
      sourceType: data.project.sourceType,
      repoUrl: data.project.repoUrl,
      branch: data.project.branch,
      projectRootDir: data.project.projectRootDir,
      currentPreviewUrl: data.currentPreviewUrl,
      hasSuccessfulDeployment: rows.some((d) => d.status === "success"),
      agentConfig: data.project.agentConfig ?? null,
      siteMeta:
        data.currentPreviewUrl !== null
          ? {
              siteIconUrl: data.project.siteIconUrl,
              siteOgImageUrl: data.project.siteOgImageUrl,
              siteMetaFetchedAt: data.project.siteMetaFetchedAt,
              siteMetaError: data.project.siteMetaError
            }
          : null,
      currentDeploymentId: data.project.currentDeploymentId
    };
  }, [
    data.project.id,
    data.project.name,
    data.project.sourceType,
    data.project.repoUrl,
    data.project.branch,
    data.project.projectRootDir,
    data.currentPreviewUrl,
    data.project.agentConfig,
    data.project.siteIconUrl,
    data.project.siteOgImageUrl,
    data.project.siteMetaFetchedAt,
    data.project.siteMetaError,
    data.project.currentDeploymentId,
    deploymentStatusesKey
  ]);

  return (
  <AppShell
    title={t("meta.projectTitle", { name: data.project.name, appName: t("common.appName") })}
    pathname={data.pathname}
    user={data.user ?? null}
    sidebarProjects={data.sidebarProjects}
    sidebarContext={{
      project: {
        id: data.project.id,
        name: data.project.name
      },
      deployment: pickFeaturedDeploymentFromSortedDesc(
        deployments.map((d) => ({
          id: d.id,
          shortId: d.shortId,
          status: d.status
        }))
      )
    }}
    breadcrumbs={[
      { label: t("common.projects"), href: "/projects" },
      { label: data.project.name }
    ]}
  >
    <div
      id="notification"
      aria-live="polite"
      className="hidden fixed top-17 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg"
    />
    <div className="relative mb-8 overflow-hidden rounded-lg border border-border/80 border-l-4 border-l-primary/70 bg-card/30 shadow-sm ring-1 ring-black/5 dark:ring-white/5">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/40 via-transparent to-transparent"
        aria-hidden
      />
      <div className="dashboard-surface relative flex flex-col gap-6 overflow-hidden rounded-none border-0 shadow-none p-5 lg:flex-row lg:items-stretch lg:gap-8 md:p-6">
        {data.currentPreviewUrl ? (
          <div className="w-full shrink-0 lg:max-w-[min(100%,440px)] xl:max-w-[min(100%,480px)]">
            <div className="aspect-16/10 w-full">
              <div id="project-detail-hero-preview-root" className="size-full min-w-0" />
            </div>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-5">
          <div className="min-w-0 space-y-4">
            <div>
              <p className="eyebrow-label mb-2">
                {currentDeployment ? t("projectDetail.currentDeployment") : t("projectDetail.projectEyebrow")}
              </p>
              <div className="flex min-w-0 items-center gap-3">
                <ProjectSiteGlyph
                  name={data.project.name}
                  siteIconUrl={data.project.siteIconUrl}
                  previewUrl={data.currentPreviewUrl}
                  className="size-6 shrink-0 ring-0"
                  imgClassName="size-6 shrink-0 rounded-md object-cover"
                  letterClassName="flex size-6 items-center justify-center rounded-md bg-primary/20 text-xs font-semibold text-primary"
                />
                <h1 className="font-serif min-w-0 flex-1 truncate text-3xl font-semibold tracking-tight md:text-4xl">
                  {data.project.name}
                </h1>
              </div>
              <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                {data.project.sourceType === "agent"
                  ? t("projectDetail.agentSourceLabel")
                  : data.project.repoUrl.replace(/^https:\/\/github\.com\//, "")}
              </p>
            </div>
            <dl className="grid gap-3 text-sm">
              {data.currentPreviewUrl ? (
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">{t("projectDetail.previewLabel")}</dt>
                  <dd className="min-w-0 truncate font-mono text-xs">
                    <a
                      href={data.currentPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground font-medium no-underline hover:underline"
                    >
                      {data.currentPreviewUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">{t("projectDetail.branch")}</dt>
                <dd className="min-w-0 truncate font-mono text-xs">
                  <code>{data.project.branch}</code>
                </dd>
              </div>
              {currentDeployment ? (
                <>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">{t("common.deployment")}</dt>
                    <dd className="min-w-0">
                      <Link
                        to={`/deployments/${currentDeployment.id}`}
                        className="font-mono text-xs font-medium no-underline hover:underline"
                      >
                        {currentDeployment.shortId}
                      </Link>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">{t("projectDetail.status")}</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(currentDeployment.status)}>
                        {deploymentStatusLabel(currentDeployment.status)}
                      </Badge>
                      <Badge variant="outline" className="font-normal">
                        {deploymentPreviewLabel(currentDeployment)}
                      </Badge>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">{t("projectDetail.created")}</dt>
                    <dd className="text-xs text-muted-foreground tabular-nums">
                      {new Date(currentDeployment.createdAt).toLocaleString()}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/projects/${data.project.id}/settings`} aria-label={t("projectDetail.settingsAria")}>
                <Settings className="mr-1.5 size-4" aria-hidden />
                {t("projectDetail.settings")}
              </Link>
            </Button>
            {data.runtimeLogsAvailable &&
            currentDeployment?.serveStrategy === "server" &&
            currentDeployment.status === "success" ? (
              <Button variant="outline" size="sm" asChild>
                <Link
                  to={`/projects/${data.project.id}/observability#runtime-logs`}
                  aria-label={t("projectDetail.runtimeLogsAria")}
                >
                  <ScrollText className="mr-1.5 size-4" aria-hidden />
                  {t("projectDetail.runtimeLogs")}
                </Link>
              </Button>
            ) : null}
            {data.currentPreviewUrl ? (
              <Button variant="outline" asChild>
                <a href={data.currentPreviewUrl} target="_blank" rel="noopener noreferrer">
                  {t("projectDetail.visit")}
                </a>
              </Button>
            ) : null}
            {data.project.sourceType === "github" ? <div className="contents" id="project-detail-deploy-main-root" /> : null}
            <div id="project-detail-set-current-root" />
          </div>
        </div>
      </div>

      <Accordion type="single" collapsible className="border-t border-border/60 bg-muted/20 px-5 md:px-6">
        <AccordionItem value="project-details" className="border-0">
          <AccordionTrigger className="py-3.5 text-sm font-medium hover:no-underline">
            {t("projectDetail.accordionTitle")}
          </AccordionTrigger>
          <AccordionContent className="space-y-5 pb-5">
            <p className="text-xs text-muted-foreground">{t("projectDetail.accordionHint")}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="default" size="sm" className="justify-center gap-2 sm:justify-start" asChild>
                <Link to={`/projects/${data.project.id}/settings`}>
                  <Settings className="size-4" aria-hidden />
                  {t("projectDetail.editGeneral")}
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="justify-center sm:justify-start" asChild>
                <Link to={`/projects/${data.project.id}/settings/env`}>{t("projectDetail.editEnv")}</Link>
              </Button>
            </div>
            <div className="overflow-hidden rounded-md border border-border/80">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-36 text-muted-foreground font-medium">{t("projectDetail.tableRepo")}</TableCell>
                    <TableCell>
                      {data.project.sourceType === "agent" ? (
                        <span>{t("projectDetail.agentSourceLabel")}</span>
                      ) : (
                        <a
                          href={data.project.repoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="no-underline hover:underline"
                        >
                          {data.project.repoUrl.replace("https://github.com/", "")}
                        </a>
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.branch")}</TableCell>
                    <TableCell>{data.project.branch}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.workspaceRoot")}</TableCell>
                    <TableCell>
                      <code>{data.project.workspaceRootDir}</code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.projectRoot")}</TableCell>
                    <TableCell>
                      <code>{data.project.projectRootDir}</code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.framework")}</TableCell>
                    <TableCell>
                      {data.project.frameworkHint === "auto" ? t("projectDetail.autoDetect") : data.project.frameworkHint}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.previewType")}</TableCell>
                    <TableCell className="capitalize">
                      {data.project.previewMode === "auto" ? t("projectDetail.autoDetect") : data.project.previewMode}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.serverTarget")}</TableCell>
                    <TableCell>{t("projectDetail.isolatedRunner")}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.runtimeImage")}</TableCell>
                    <TableCell className="capitalize">{data.project.runtimeImageMode}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.dockerfile")}</TableCell>
                    <TableCell>
                      <code>{data.project.dockerfilePath ?? "Dockerfile"}</code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.dockerTarget")}</TableCell>
                    <TableCell>{data.project.dockerBuildTarget ?? t("common.emDash")}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.hostBuild")}</TableCell>
                    <TableCell>
                      {data.project.skipHostStrategyBuild
                        ? t("projectDetail.skippedDockerfile")
                        : t("projectDetail.runStrategyBuild")}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.previewPort")}</TableCell>
                    <TableCell>{data.project.runtimeContainerPort}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.created")}</TableCell>
                    <TableCell>{new Date(data.project.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">{t("projectDetail.updated")}</TableCell>
                    <TableCell>{new Date(data.project.updatedAt).toLocaleString()}</TableCell>
                  </TableRow>
                  {data.currentPreviewUrl ? (
                    <TableRow>
                      <TableCell className="text-muted-foreground font-medium">{t("projectDetail.previewUrl")}</TableCell>
                      <TableCell>
                        <a
                          href={data.currentPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="no-underline hover:underline"
                        >
                          {data.currentPreviewUrl}
                        </a>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>

    <div className="min-w-0 space-y-6">
      {data.project.sourceType === "agent" ? (
        <div id="project-detail-agent-panel-root" className="min-w-0" />
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("projectDetail.deploymentCardTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {deployments.length === 0 ? (
            <p className="text-muted-foreground text-sm px-6 pb-4">{t("projectDetail.noDeployments")}</p>
          ) : (
            <div className="min-w-0">
              <ProjectDeploymentsPanel
                deployments={deployments.map((d) => ({
                  id: d.id,
                  shortId: d.shortId,
                  status: d.status,
                  serveStrategy: d.serveStrategy,
                  buildPreviewMode: d.buildPreviewMode,
                  previewUrl: d.previewUrl,
                  createdAt: d.createdAt
                }))}
                currentDeploymentId={data.project.currentDeploymentId}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <div id="project-detail-repo-explorer-root" className="min-w-0" />
    </div>
    <ProjectDetailInteractiveMount bootstrap={interactiveBootstrap} />
  </AppShell>
  );
};
