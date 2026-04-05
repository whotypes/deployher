import * as React from "react";
import { Activity, HardDrive, Package, Server } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { HealthData } from "../../health/HealthPage";
import { formatBytes, formatDuration } from "../../utils/format";

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

export const HealthPageClient = ({ initialData }: { initialData: HealthData }): React.ReactElement => {
  const [live, setLive] = React.useState(initialData);

  React.useEffect(() => {
    const poll = (): void => {
      void fetch("/health", { headers: { Accept: "application/json" }, credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => {
          if (body && typeof body === "object" && "memory" in body) {
            setLive((prev) => ({ ...prev, ...(body as HealthData) }));
          }
        })
        .catch(() => {});
    };
    poll();
    const id = window.setInterval(poll, 5000);
    return () => window.clearInterval(id);
  }, []);

  const { memory } = live;

  return (
    <>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">System health</h1>
        <Badge variant={statusBadgeVariant(live.status)}>{live.status.toUpperCase()}</Badge>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <Server className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Uptime
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">{formatDuration(live.uptimeSeconds)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Memory (RSS)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">{formatBytes(memory.rss)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pending requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">{live.pendingRequests}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <Package className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Bun version
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-semibold tabular-nums">{live.bunVersion}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Server</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-[140px] font-medium">Environment</TableCell>
                    <TableCell>{live.environment}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Hostname</TableCell>
                    <TableCell>
                      <code className="text-xs">
                        {live.hostname}:{live.port}
                      </code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">PID</TableCell>
                    <TableCell>{live.pid}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Started</TableCell>
                    <TableCell>{new Date(live.startedAt).toLocaleString()}</TableCell>
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
                    <TableCell className="w-[140px] font-medium">RSS</TableCell>
                    <TableCell>{formatBytes(memory.rss)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Heap total</TableCell>
                    <TableCell>{formatBytes(memory.heapTotal)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Heap used</TableCell>
                    <TableCell>{formatBytes(memory.heapUsed)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">External</TableCell>
                    <TableCell>{formatBytes(memory.external)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
};
