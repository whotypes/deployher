import { formatDistanceToNow } from "date-fns";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@/spa/routerCompat";
import { useWorkspaceChrome } from "@/spa/workspaceChromeContext";
import type { HealthData } from "../health/HealthPage";
import { getDateFnsLocale } from "@/lib/dateLocale";
import type { WorkspaceDashboardCharts } from "../lib/workspaceDashboardMetrics";
import { formatBytes, formatDuration } from "../utils/format";
import type { LayoutUser, SidebarProjectSummary } from "./layoutUser";
import { DashboardPageClient } from "./client/DashboardPageClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  ArrowUpRight,
  ChevronRight,
  ExternalLink,
  Globe,
  Server,
} from "lucide-react";

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

const statusVariant = (
  status: string,
): "default" | "secondary" | "destructive" | "outline" => {
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
  const lastActivityFull = lastActivity
    ? new Date(lastActivity).toISOString()
    : undefined;
  const lastActivityRelative = lastActivity
    ? formatDistanceToNow(new Date(lastActivity), {
        addSuffix: true,
        locale: getDateFnsLocale(i18n.language),
      })
    : null;

  const pageTitle = t("meta.titleWithApp", {
    page: t("dashboard.pageTitle"),
    appName: t("common.appName"),
  });

  const chrome = useMemo(
    () => ({
      title: pageTitle,
      breadcrumbs: [{ label: t("dashboard.pageTitle") }],
    }),
    [pageTitle, t],
  );
  useWorkspaceChrome(chrome);

  const deploymentStatusLabel = (status: string): string => {
    const s = status.toLowerCase();
    if (s === "building") return t("projects.status.building");
    if (s === "queued") return t("projects.status.queued");
    if (s === "success") return t("projects.status.success");
    if (s === "failed") return t("projects.status.failed");
    return status;
  };

  return (
    <>
      <section className="dashboard-hero mb-5">
        <div className="min-w-0 space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">
            {t("dashboard.pageTitle")}
          </h1>
          {lastActivityRelative ? (
            <p
              className="text-sm text-muted-foreground md:text-base"
              title={lastActivityFull}
            >
              {t("dashboard.lastDeployment", { time: lastActivityRelative })}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground md:text-base">
              {t("dashboard.noDeploymentsYet")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          <Button className="h-10 px-4" asChild>
            <Link to="/projects/new">{t("dashboard.newProject")}</Link>
          </Button>
          <Button className="h-10 px-4" variant="outline" asChild>
            <Link to="/health">{t("dashboard.health")}</Link>
          </Button>
          <Button className="h-10 px-4" variant="outline" asChild>
            <Link to="/projects">{t("dashboard.projectsLink")}</Link>
          </Button>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border/60 pt-5 sm:grid-cols-4 md:col-span-2">
          <div className="dashboard-hero-stat">
            <span>{t("dashboard.statProjects")}</span>
            <strong>{stats.projectCount}</strong>
          </div>
          <div className="dashboard-hero-stat">
            <span>{t("dashboard.statDeployments")}</span>
            <strong>{stats.deploymentTotal}</strong>
          </div>
          <div className="dashboard-hero-stat col-span-2">
            <span>{t("dashboard.statControlPlane")}</span>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="mb-1 size-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.7)]" />
              <strong>{data.health.status}</strong>
              <small className="font-mono text-xs font-medium text-muted-foreground">
                {formatDuration(data.health.uptimeSeconds)} ·{" "}
                {formatBytes(data.health.memory.rss)}
              </small>
            </div>
          </div>
        </div>
      </section>

      <div id="dashboard-charts-root" className="mb-5">
        <DashboardPageClient bootstrap={data.workspaceCharts} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <section className="dashboard-surface overflow-hidden border-border/80 shadow-none">
          <div className="flex flex-row items-center justify-between border-b border-border/60 px-5 py-4">
            <div className="flex items-center gap-3">
              <Activity className="size-5 text-amber-300" aria-hidden />
              <h2 className="text-xl font-semibold">
                {t("dashboard.recentDeployments")}
              </h2>
            </div>
            <Link
              to="/projects"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground"
            >
              {t("dashboard.projectsLink")}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          <div>
            {data.recentDeployments.length === 0 ? (
              <p className="px-5 py-8 text-base text-muted-foreground">
                {t("dashboard.noDeploymentsWindow")}
              </p>
            ) : (
              <ul
                className="divide-y divide-border/60"
                aria-label={t("dashboard.recentDeployments")}
              >
                {data.recentDeployments.map((deployment) => (
                  <li
                    key={deployment.id}
                    className="flex min-h-[86px] items-stretch"
                  >
                    <Link
                      to={`/deployments/${deployment.id}`}
                      className="group flex min-w-0 flex-1 gap-4 px-5 py-4 text-left no-underline outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/35 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      aria-label={t("dashboard.deploymentAria", {
                        shortId: deployment.shortId,
                        projectName: deployment.projectName,
                        status: deployment.status,
                      })}
                    >
                      <span className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-400/10">
                        <span className="size-2 rounded-full bg-emerald-300" />
                      </span>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="truncate text-lg font-semibold text-foreground">
                            {deployment.projectName}
                          </span>
                          <span className="font-mono text-sm text-muted-foreground">
                            {deployment.shortId}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(deployment.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center justify-end gap-3">
                        <Badge
                          variant={statusVariant(deployment.status)}
                          className="text-xs"
                        >
                          {deploymentStatusLabel(deployment.status)}
                        </Badge>
                        <ChevronRight
                          className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                          aria-hidden
                        />
                      </div>
                    </Link>
                    {deployment.previewUrl ? (
                      <div className="hidden shrink-0 items-center border-l border-border/60 px-4 sm:flex">
                        <Button
                          variant="outline"
                          className="h-9 gap-2 px-3"
                          asChild
                        >
                          <a
                            href={deployment.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={t("dashboard.openPreviewAria", {
                              shortId: deployment.shortId,
                            })}
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
          </div>
        </section>

        <aside className="space-y-5">
          <section className="dashboard-surface border-border/80 p-5 shadow-none">
            <div className="mb-5 flex items-center gap-3">
              <Globe className="size-5 text-amber-300" aria-hidden />
              <h2 className="text-xl font-semibold">
                {t("dashboard.deploymentUrlsTitle")}
              </h2>
            </div>
            <div className="space-y-3">
              <div className="dashboard-url-block">
                <p>{t("common.preview")}</p>
                <code>{data.health.domains.dev}</code>
              </div>
              <div className="dashboard-url-block">
                <p>{t("dashboard.production")}</p>
                <code>{data.health.domains.prod}</code>
              </div>
            </div>
            <Link
              to="/health"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground no-underline hover:text-foreground"
            >
              {t("dashboard.health")}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </section>

          <section className="dashboard-surface border-border/80 p-5 shadow-none">
            <div className="mb-5 flex items-center gap-3">
              <Server className="size-5 text-amber-300" aria-hidden />
              <h2 className="text-xl font-semibold">
                {t("dashboard.statEnvironment")}
              </h2>
            </div>
            <div className="space-y-3">
              <p className="text-3xl font-semibold capitalize">
                {data.health.environment}
              </p>
              <code className="font-mono text-sm text-muted-foreground">
                {data.health.hostname}:{data.health.port}
              </code>
            </div>
          </section>
        </aside>
      </div>

      <section className="dashboard-surface mt-5 overflow-hidden border-border/80 shadow-none">
        <div className="flex flex-row items-center justify-between border-b border-border/60 px-5 py-4">
          <h2 className="text-xl font-semibold">
            {t("dashboard.statProjects")}
          </h2>
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground"
          >
            {t("dashboard.viewAll")}
            <ArrowUpRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        <div>
          {data.projects.length === 0 ? (
            <p className="px-5 py-8 text-base text-muted-foreground">
              {t("projects.empty")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("dashboard.nameCol")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("dashboard.repositoryCol")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.projects.slice(0, 8).map((project) => (
                  <TableRow
                    key={project.id}
                    className="group cursor-pointer hover:bg-muted/50"
                    aria-label={t("projects.openProjectAria", {
                      name: project.name,
                    })}
                    onClick={(e) => {
                      if (e.button !== 0) return;
                      const el = e.target as HTMLElement;
                      if (el.closest("a, button, input, textarea, select"))
                        return;
                      navigate(`/projects/${project.id}`);
                    }}
                  >
                    <TableCell className="font-medium">
                      <span className="underline-offset-4 group-hover:underline">
                        {project.name}
                      </span>
                    </TableCell>
                    <TableCell className="hidden max-w-[200px] truncate font-mono text-xs text-muted-foreground sm:table-cell">
                      {project.repoUrl.replace(/^https:\/\/github\.com\//, "")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-border/50 pt-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/account#workspace-preferences">
            {t("dashboard.preferences")}
          </Link>
        </Button>
        {data.user?.role === "operator" ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin">{t("dashboard.admin")}</Link>
          </Button>
        ) : null}
      </div>
    </>
  );
};

export { DashboardPage };
