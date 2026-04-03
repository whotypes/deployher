import { renderToReadableStream } from "react-dom/server";
import type { HealthData } from "../health/HealthPage";
import { formatBytes, formatDuration } from "../utils/format";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

  return (
    <Layout
      title="Dashboard · pdploy"
      pathname={data.pathname}
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      breadcrumbs={[{ label: "Dashboard" }]}
    >
      <div className="dashboard-surface mb-6 flex flex-col gap-4 overflow-hidden p-5 md:p-6">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-2">
            <p className="eyebrow-label">Operations Overview</p>
            <h1 className="text-pretty text-3xl font-semibold tracking-tight md:text-4xl">Deploy, observe, and recover from one control surface.</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <a href="/projects#new">New Project</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/health">Inspect Health</a>
            </Button>
          </div>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Workspace snapshot: projects, deployments, and control plane health in one place.
          {lastActivity ? ` Last deployment activity ${new Date(lastActivity).toLocaleString()}.` : ""}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="dashboard-metric">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.projectCount}</p>
            <p className="text-xs text-muted-foreground mt-1">Repositories you deploy</p>
          </CardContent>
        </Card>
        <Card className="dashboard-metric">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Deployments</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{stats.deploymentTotal}</p>
            <p className="text-xs text-muted-foreground mt-1">All-time runs in your workspace</p>
          </CardContent>
        </Card>
        <Card className="dashboard-metric">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Control plane</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant={data.health.status === "ok" ? "default" : "destructive"} className="text-sm">
              {data.health.status.toUpperCase()}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2">
              Uptime {formatDuration(data.health.uptimeSeconds)} · RSS {formatBytes(data.health.memory.rss)}
            </p>
          </CardContent>
        </Card>
        <Card className="dashboard-metric">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Environment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-semibold capitalize">{data.health.environment}</p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              {data.health.hostname}:{data.health.port}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="dashboard-surface lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Deployments by status</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.deploymentTotal === 0 ? (
              <p className="text-sm text-muted-foreground">No deployments yet. Create a project and run a build.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {statusRows.map(({ status, count }) => (
                  <Badge key={status} variant={statusVariant(status)} className="gap-1.5 px-2.5 py-1 text-sm">
                    <span className="capitalize">{status}</span>
                    <span className="tabular-nums opacity-90">{count}</span>
                  </Badge>
                ))}
                {otherStatuses.map(([status, count]) => (
                  <Badge key={status} variant="outline" className="gap-1.5 px-2.5 py-1 text-sm capitalize">
                    {status}
                    <span className="tabular-nums">{count}</span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="dashboard-surface">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Runtime</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Bun</span>
              <span className="font-mono text-xs">{data.health.bunVersion}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">PID</span>
              <span className="font-mono text-xs tabular-nums">{data.health.pid}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Pending HTTP</span>
              <span className="font-mono text-xs tabular-nums">{data.health.pendingRequests}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Heap used</span>
              <span className="font-mono text-xs">{formatBytes(data.health.memory.heapUsed)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="dashboard-surface">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">URL patterns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Preview / dev</p>
              <code className="break-all text-xs leading-relaxed">{data.health.domains.dev}</code>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">Production</p>
              <code className="break-all text-xs leading-relaxed">{data.health.domains.prod}</code>
            </div>
          </CardContent>
        </Card>
        <Card className="dashboard-surface">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href="/projects">All projects</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/health">System health</a>
            </Button>
            <Button variant="outline" asChild>
              <a href="/account#workspace-preferences">Workspace preferences</a>
            </Button>
            {data.user?.role === "operator" ? (
              <Button variant="outline" asChild>
                <a href="/admin">Admin tools</a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="dashboard-surface">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Projects</CardTitle>
            <a
              href="/projects"
              className="text-sm text-muted-foreground no-underline hover:no-underline hover:text-foreground"
            >
              View all
            </a>
          </CardHeader>
          <CardContent className="p-0">
            {data.projects.length === 0 ? (
              <p className="text-muted-foreground text-sm px-6 pb-6 pt-0">No projects yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Repository</TableHead>
                    <TableHead className="w-[100px]">Current</TableHead>
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
                      <TableCell className="hidden sm:table-cell max-w-[220px] truncate font-mono text-xs text-muted-foreground">
                        {project.repoUrl.replace(/^https:\/\/github\.com\//, "")}
                      </TableCell>
                      <TableCell>
                        {project.currentDeploymentId ? (
                          <span className="text-xs text-muted-foreground font-mono">set</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="dashboard-surface">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent deployments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.recentDeployments.length === 0 ? (
              <p className="text-muted-foreground text-sm px-6 pb-6 pt-0">No deployments yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="hidden lg:table-cell font-mono">ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">When</TableHead>
                    <TableHead className="w-[70px] text-right">Link</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentDeployments.map((deployment) => (
                    <TableRow key={deployment.id}>
                      <TableCell>
                        <a href={`/projects/${deployment.projectId}`} className="no-underline hover:underline font-medium">
                          {deployment.projectName}
                        </a>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <a
                          href={`/deployments/${deployment.id}`}
                          className="font-mono text-xs text-muted-foreground no-underline hover:underline"
                        >
                          {deployment.shortId}
                        </a>
                      </TableCell>
                      <TableCell>
                        <a href={`/deployments/${deployment.id}`} className="no-underline">
                          <Badge variant={statusVariant(deployment.status)}>{deployment.status}</Badge>
                        </a>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                        {new Date(deployment.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {deployment.previewUrl ? (
                          <a
                            href={deployment.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary no-underline hover:underline"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export const renderDashboardPage = (data: DashboardData) =>
  renderToReadableStream(<DashboardPage data={data} />);
