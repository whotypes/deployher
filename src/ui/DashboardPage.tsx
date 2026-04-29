import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@/spa/routerCompat";
import type { HealthData } from "../health/HealthPage";
import { getDateFnsLocale } from "@/lib/dateLocale";
import type { WorkspaceDashboardCharts } from "../lib/workspaceDashboardMetrics";
import { formatBytes, formatDuration } from "../utils/format";
import type { LayoutUser, SidebarProjectSummary } from "./layoutUser";
import { AppShell } from "./AppShell";
import { DashboardPageClient } from "./client/DashboardPageClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, ExternalLink, Globe } from "lucide-react";

type ProjectSummary = {
  id: string;
  name: string;
  repoUrl: string;
  currentDeploymentId: string | null;
};

type DeploymentSummary = {
  id: string;
  projectId: string;
  shortId: string;
  projectName: string;
  status: string;
  createdAt: string;
  previewUrl: string | null;
};

export type DashboardData = {
  pathname: string;
  health: HealthData;
  workspaceCharts: WorkspaceDashboardCharts;
  projects: ProjectSummary[];
  recentDeployments: DeploymentSummary[];
  user?: LayoutUser | null;
  sidebarProjects: SidebarProjectSummary[];
  stats: {
    projectCount: number;
    deploymentTotal: number;
    deploymentsByStatus: Record<string, number>;
  };
};

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "success":
      return "default";
    case "failed":
      return "destructive";
    default:
      return "secondary";
  }
};

const DashboardPage = ({ data }: { data: DashboardData }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { stats } = data;
  const lastActivity = data.recentDeployments[0]?.createdAt ?? null;
  const lastActivityFull = lastActivity ? new Date(lastActivity).toISOString() : undefined;
  const lastActivityRelative = lastActivity
    ? formatDistanceToNow(new Date(lastActivity), {
        addSuffix: true,
        locale: getDateFnsLocale(i18n.language)
      })
    : null;

  const pageTitle = t("meta.titleWithApp", {
    page: t("dashboard.pageTitle"),
    appName: t("common.appName")
  });

  const deploymentStatusLabel = (status: string): string => {
    const s = status.toLowerCase();
    if (s === "building") return t("projects.status.building");
    if (s === "queued") return t("projects.status.queued");
    if (s === "success") return t("projects.status.success");
    if (s === "failed") return t("projects.status.failed");
    return status;
  };

  return (
    <AppShell
      title={pageTitle}
      pathname={data.pathname}
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      breadcrumbs={[{ label: t("dashboard.pageTitle") }]}
    >
      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border/70 bg-card/20 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t("dashboard.pageTitle")}</h1>
          {lastActivityRelative ? (
            <p className="text-xs text-muted-foreground" title={lastActivityFull}>
              {t("dashboard.lastDeployment", { time: lastActivityRelative })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">{t("dashboard.noDeploymentsYet")}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <Link to="/projects/new">{t("dashboard.newProject")}</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/health">{t("dashboard.health")}</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/projects">{t("dashboard.projectsLink")}</Link>
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              {t("dashboard.statProjects")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <p className="text-2xl font-semibold tabular-nums">{stats.projectCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              {t("dashboard.statDeployments")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <p className="text-2xl font-semibold tabular-nums">{stats.deploymentTotal}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              {t("dashboard.statControlPlane")}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 pb-3 pt-0">
            <Badge variant={data.health.status === "ok" ? "default" : "destructive"} className="text-xs">
              {data.health.status}
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatDuration(data.health.uptimeSeconds)} · {formatBytes(data.health.memory.rss)}
            </span>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              {t("dashboard.statEnvironment")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <p className="text-lg font-semibold capitalize">{data.health.environment}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {data.health.hostname}:{data.health.port}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12 xl:items-start">
        <div className="space-y-4 xl:col-span-5">
          <div id="dashboard-charts-root" className="space-y-4">
            <DashboardPageClient bootstrap={data.workspaceCharts} />
          </div>
          <Card className="dashboard-surface border-border/80 shadow-none">
            <CardHeader className="space-y-1 pb-2">
              <div className="flex items-start gap-2">
                <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <CardTitle className="text-sm font-medium">{t("dashboard.deploymentUrlsTitle")}</CardTitle>
                  <p className="text-xs text-muted-foreground">{t("dashboard.deploymentUrlsDesc")}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("common.preview")}
                </p>
                <code className="break-all font-mono text-[0.75rem] leading-relaxed text-foreground">
                  {data.health.domains.dev}
                </code>
              </div>
              <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2">
                <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("dashboard.production")}
                </p>
                <code className="break-all font-mono text-[0.75rem] leading-relaxed text-foreground">
                  {data.health.domains.prod}
                </code>
              </div>
              <p className="text-[0.7rem] text-muted-foreground">
                {t("dashboard.diagnosticsHint")}{" "}
                <Link to="/health" className="font-medium text-foreground underline-offset-4 hover:underline">
                  {t("dashboard.health")}
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-7">
          <Card className="dashboard-surface overflow-hidden border-border/80 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{t("dashboard.recentDeployments")}</CardTitle>
              <Link
                to="/projects"
                className="text-xs text-muted-foreground no-underline hover:text-foreground"
              >
                {t("dashboard.projectsLink")}
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentDeployments.length === 0 ? (
                <p className="px-4 pb-4 pt-0 text-sm text-muted-foreground">{t("dashboard.noDeploymentsWindow")}</p>
              ) : (
                <ul className="divide-y divide-border/60" aria-label={t("dashboard.recentDeployments")}>
                  {data.recentDeployments.map((deployment) => (
                    <li key={deployment.id} className="flex min-h-[52px] items-stretch">
                      <Link
                        to={`/deployments/${deployment.id}`}
                        className="group flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 text-left no-underline outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-row sm:items-center sm:gap-3"
                        aria-label={t("dashboard.deploymentAria", {
                          shortId: deployment.shortId,
                          projectName: deployment.projectName,
                          status: deployment.status
                        })}
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate font-medium text-foreground">
                              {deployment.projectName}
                            </span>
                            <span className="font-mono text-xs text-muted-foreground">
                              {deployment.shortId}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {new Date(deployment.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
                          <Badge variant={statusVariant(deployment.status)} className="text-xs">
                            {deploymentStatusLabel(deployment.status)}
                          </Badge>
                          <ChevronRight
                            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </div>
                      </Link>
                      {deployment.previewUrl ? (
                        <div className="flex shrink-0 items-center border-l border-border/60 px-3">
                          <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
                            <a
                              href={deployment.previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={t("dashboard.openPreviewAria", { shortId: deployment.shortId })}
                            >
                              <ExternalLink className="size-3.5" aria-hidden />
                              {t("common.preview")}
                            </a>
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="dashboard-surface overflow-hidden border-border/80 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">{t("dashboard.statProjects")}</CardTitle>
              <Link
                to="/projects"
                className="text-xs text-muted-foreground no-underline hover:text-foreground"
              >
                {t("dashboard.viewAll")}
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {data.projects.length === 0 ? (
                <p className="px-4 pb-4 pt-0 text-sm text-muted-foreground">{t("projects.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t("dashboard.nameCol")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("dashboard.repositoryCol")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.projects.slice(0, 8).map((project) => (
                      <TableRow
                        key={project.id}
                        className="group cursor-pointer hover:bg-muted/50"
                        aria-label={t("projects.openProjectAria", { name: project.name })}
                        onClick={(e) => {
                          if (e.button !== 0) return;
                          const el = e.target as HTMLElement;
                          if (el.closest("a, button, input, textarea, select")) return;
                          navigate(`/projects/${project.id}`);
                        }}
                      >
                        <TableCell className="font-medium">
                          <span className="underline-offset-4 group-hover:underline">{project.name}</span>
                        </TableCell>
                        <TableCell className="hidden max-w-[200px] truncate font-mono text-xs text-muted-foreground sm:table-cell">
                          {project.repoUrl.replace(/^https:\/\/github\.com\//, "")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
            <Button variant="outline" size="sm" asChild>
              <Link to="/account#workspace-preferences">{t("dashboard.preferences")}</Link>
            </Button>
            {data.user?.role === "operator" ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/admin">{t("dashboard.admin")}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </AppShell>
  );
};

export { DashboardPage };
