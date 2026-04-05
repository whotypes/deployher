import { formatDistanceToNow } from "date-fns";
import { renderToReadableStream } from "react-dom/server";
import type { HealthData } from "../health/HealthPage";
import type { WorkspaceDashboardCharts } from "../lib/workspaceDashboardMetrics";
import { formatBytes, formatDuration } from "../utils/format";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronRight, ExternalLink } from "lucide-react";

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

const deploymentStatusOrder = ["building", "queued", "success", "failed"] as const;

const DashboardPage = ({ data }: { data: DashboardData }) => {
  const { stats } = data;
  const statusRows = deploymentStatusOrder
    .filter((s) => (stats.deploymentsByStatus[s] ?? 0) > 0)
    .map((s) => ({ status: s, count: stats.deploymentsByStatus[s] ?? 0 }));
  const otherStatuses = Object.entries(stats.deploymentsByStatus).filter(
    ([s]) => !deploymentStatusOrder.includes(s as (typeof deploymentStatusOrder)[number])
  );
  const lastActivity = data.recentDeployments[0]?.createdAt ?? null;
  const lastActivityFull = lastActivity ? new Date(lastActivity).toISOString() : undefined;
  const lastActivityRelative = lastActivity
    ? formatDistanceToNow(new Date(lastActivity), { addSuffix: true })
    : null;

  return (
    <Layout
      title="Dashboard · Deployher"
      pathname={data.pathname}
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      breadcrumbs={[{ label: "Dashboard" }]}
      scriptSrc="/assets/dashboard-page.js"
    >
      <script
        type="application/json"
        id="dashboard-charts-bootstrap"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(data.workspaceCharts).replace(/</g, "\\u003c")
        }}
      />

      <div className="mb-6 flex flex-col gap-4 rounded-lg border border-border/70 bg-card/20 p-4 md:flex-row md:items-center md:justify-between md:p-5">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Dashboard</h1>
          {lastActivityRelative ? (
            <p className="text-xs text-muted-foreground" title={lastActivityFull}>
              Last deployment {lastActivityRelative}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No deployments yet</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild>
            <a href="/projects/new">New project</a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/health">Health</a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href="/projects">Projects</a>
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              Projects
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <p className="text-2xl font-semibold tabular-nums">{stats.projectCount}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              Deployments
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-3 pt-0">
            <p className="text-2xl font-semibold tabular-nums">{stats.deploymentTotal}</p>
          </CardContent>
        </Card>
        <Card className="border-border/70 shadow-none">
          <CardHeader className="pb-1 pt-3">
            <CardTitle className="text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
              Control plane
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
              Environment
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
          <div id="dashboard-charts-root" className="space-y-4" />
          <Card className="dashboard-surface border-border/80 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">All-time by status</CardTitle>
            </CardHeader>
            <CardContent>
              {stats.deploymentTotal === 0 ? (
                <p className="text-sm text-muted-foreground">No deployments yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {statusRows.map(({ status, count }) => (
                    <Badge key={status} variant={statusVariant(status)} className="gap-1.5 px-2 py-0.5 text-xs">
                      <span className="capitalize">{status}</span>
                      <span className="tabular-nums opacity-90">{count}</span>
                    </Badge>
                  ))}
                  {otherStatuses.map(([status, count]) => (
                    <Badge key={status} variant="outline" className="gap-1.5 px-2 py-0.5 text-xs capitalize">
                      {status}
                      <span className="tabular-nums">{count}</span>
                    </Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="dashboard-surface border-border/80 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Runtime</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="flex justify-between gap-2 border-b border-border/40 pb-2 sm:border-0 sm:pb-0">
                <span className="text-muted-foreground">Bun</span>
                <span className="font-mono">{data.health.bunVersion}</span>
              </div>
              <div className="flex justify-between gap-2 border-b border-border/40 pb-2 sm:border-0 sm:pb-0">
                <span className="text-muted-foreground">Pending HTTP</span>
                <span className="font-mono tabular-nums">{data.health.pendingRequests}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Heap</span>
                <span className="font-mono">{formatBytes(data.health.memory.heapUsed)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">PID</span>
                <span className="font-mono tabular-nums">{data.health.pid}</span>
              </div>
            </CardContent>
          </Card>
          <Card className="dashboard-surface border-border/80 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">URL patterns</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div>
                <p className="mb-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                  Preview
                </p>
                <code className="break-all text-[0.7rem] leading-relaxed">{data.health.domains.dev}</code>
              </div>
              <div>
                <p className="mb-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-muted-foreground">
                  Production
                </p>
                <code className="break-all text-[0.7rem] leading-relaxed">{data.health.domains.prod}</code>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 xl:col-span-7">
          <Card className="dashboard-surface overflow-hidden border-border/80 shadow-none">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base">Recent deployments</CardTitle>
              <a
                href="/projects"
                className="text-xs text-muted-foreground no-underline hover:text-foreground"
              >
                Projects
              </a>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentDeployments.length === 0 ? (
                <p className="px-4 pb-4 pt-0 text-sm text-muted-foreground">No deployments yet.</p>
              ) : (
                <ul className="divide-y divide-border/60" aria-label="Recent deployments">
                  {data.recentDeployments.map((deployment) => (
                    <li key={deployment.id} className="flex min-h-[52px] items-stretch">
                      <a
                        href={`/deployments/${deployment.id}`}
                        className="group flex min-w-0 flex-1 flex-col gap-2 px-4 py-3 text-left no-underline outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:flex-row sm:items-center sm:gap-3"
                        aria-label={`Deployment ${deployment.shortId}: ${deployment.projectName}, ${deployment.status}`}
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
                            {deployment.status}
                          </Badge>
                          <ChevronRight
                            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                            aria-hidden
                          />
                        </div>
                      </a>
                      {deployment.previewUrl ? (
                        <div className="flex shrink-0 items-center border-l border-border/60 px-3">
                          <Button variant="outline" size="sm" className="h-8 gap-1" asChild>
                            <a
                              href={deployment.previewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Open preview for ${deployment.shortId}`}
                            >
                              <ExternalLink className="size-3.5" aria-hidden />
                              Preview
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
              <CardTitle className="text-base">Projects</CardTitle>
              <a
                href="/projects"
                className="text-xs text-muted-foreground no-underline hover:text-foreground"
              >
                View all
              </a>
            </CardHeader>
            <CardContent className="p-0">
              {data.projects.length === 0 ? (
                <p className="px-4 pb-4 pt-0 text-sm text-muted-foreground">No projects yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Repository</TableHead>
                      <TableHead className="w-[72px] text-right"> </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.projects.slice(0, 8).map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="font-medium">
                          <a href={`/projects/${project.id}`} className="no-underline hover:underline">
                            {project.name}
                          </a>
                        </TableCell>
                        <TableCell className="hidden max-w-[200px] truncate font-mono text-xs text-muted-foreground sm:table-cell">
                          {project.repoUrl.replace(/^https:\/\/github\.com\//, "")}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" asChild>
                            <a href={`/projects/${project.id}`}>Open</a>
                          </Button>
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
              <a href="/account#workspace-preferences">Preferences</a>
            </Button>
            {data.user?.role === "operator" ? (
              <Button variant="outline" size="sm" asChild>
                <a href="/admin">Admin</a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export const renderDashboardPage = (data: DashboardData) =>
  renderToReadableStream(<DashboardPage data={data} />);
