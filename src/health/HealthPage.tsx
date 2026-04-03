import { renderToReadableStream } from "react-dom/server";
import { Activity, HardDrive, Package, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { LayoutUser, SidebarProjectSummary } from "../ui/Layout";
import { Layout } from "../ui/Layout";
import { formatBytes, formatDuration } from "../utils/format";

export type HealthData = {
  pathname?: string;
  status: "ok" | "degraded" | "down";
  environment: string;
  uptimeSeconds: number;
  startedAt: string;
  now: string;
  bunVersion: string;
  hostname: string;
  port: number;
  pid: number;
  pendingRequests: number;
  pendingWebSockets: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  domains: {
    dev: string;
    prod: string;
  };
  user?: LayoutUser | null;
  sidebarProjects?: SidebarProjectSummary[];
};

const statusBadgeVariant = (status: HealthData["status"]): "default" | "secondary" | "destructive" => {
  switch (status) {
    case "ok":
      return "default";
    case "degraded":
      return "secondary";
    case "down":
      return "destructive";
    default:
      return "secondary";
  }
};

const HealthPage = ({ data }: { data: HealthData }) => {
  const { memory } = data;

  return (
    <Layout
      title="Health · pdploy"
      pathname={data.pathname ?? "/health"}
      user={data.user ?? null}
      scriptSrc="/assets/health-page.js"
      breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Health" }]}
      sidebarProjects={data.sidebarProjects}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-semibold">System health</h1>
        <Badge id="health-status-badge" variant={statusBadgeVariant(data.status)}>
          {data.status.toUpperCase()}
        </Badge>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
              <Server className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Uptime
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p id="health-uptime" className="text-xl font-semibold tabular-nums">
                {formatDuration(data.uptimeSeconds)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
              <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Memory (RSS)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p id="health-rss" className="text-xl font-semibold tabular-nums">
                {formatBytes(memory.rss)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
              <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pending requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p id="health-pending-req" className="text-xl font-semibold tabular-nums">
                {data.pendingRequests}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2 space-y-0">
              <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Bun version
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p id="health-bun" className="text-xl font-semibold tabular-nums">
                {data.bunVersion}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Server</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium w-[140px]">Environment</TableCell>
                    <TableCell>{data.environment}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Hostname</TableCell>
                    <TableCell>
                      <code className="text-xs" id="health-listen">
                        {data.hostname}:{data.port}
                      </code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">PID</TableCell>
                    <TableCell>{data.pid}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Started</TableCell>
                    <TableCell>{new Date(data.startedAt).toLocaleString()}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Memory</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium w-[140px]">RSS</TableCell>
                    <TableCell id="health-mem-rss">{formatBytes(memory.rss)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Heap total</TableCell>
                    <TableCell id="health-mem-heap-total">{formatBytes(memory.heapTotal)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Heap used</TableCell>
                    <TableCell id="health-mem-heap-used">{formatBytes(memory.heapUsed)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">External</TableCell>
                    <TableCell id="health-mem-external">{formatBytes(memory.external)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export const renderHealthPage = (data: HealthData) =>
  renderToReadableStream(<HealthPage data={data} />);
