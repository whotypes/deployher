import * as React from "react";
import { Activity, HardDrive, Package, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const [live, setLive] = React.useState(initialData);

  const locale = i18n.language.startsWith("fr") ? "fr" : "en";

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

  const overallStatusLabel = t(`health.overallStatus.${live.status}`);

  return (
    <>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">{t("health.pageTitle")}</h1>
        <Badge variant={statusBadgeVariant(live.status)}>{overallStatusLabel}</Badge>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <Server className="h-4 w-4 text-muted-foreground" aria-hidden />
              <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("health.uptime")}
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
                {t("health.memoryRss")}
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
                {t("health.pendingRequests")}
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
                {t("health.bunVersion")}
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
              <CardTitle className="text-base">{t("health.server")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-[140px] font-medium">{t("health.environment")}</TableCell>
                    <TableCell>{live.environment}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">{t("health.hostname")}</TableCell>
                    <TableCell>
                      <code className="text-xs">
                        {live.hostname}:{live.port}
                      </code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">{t("health.pid")}</TableCell>
                    <TableCell>{live.pid}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">{t("health.started")}</TableCell>
                    <TableCell>{new Date(live.startedAt).toLocaleString(locale)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("health.memory")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-[140px] font-medium">{t("health.rss")}</TableCell>
                    <TableCell>{formatBytes(memory.rss)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">{t("health.heapTotal")}</TableCell>
                    <TableCell>{formatBytes(memory.heapTotal)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">{t("health.heapUsed")}</TableCell>
                    <TableCell>{formatBytes(memory.heapUsed)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">{t("health.external")}</TableCell>
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
