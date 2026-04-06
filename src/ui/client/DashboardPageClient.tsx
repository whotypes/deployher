"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { WorkspaceDashboardCharts } from "@/lib/workspaceDashboardMetrics";

export const DashboardPageClient = ({ bootstrap }: { bootstrap: WorkspaceDashboardCharts }) => {
  const { t, i18n } = useTranslation();

  const formatAxisDate = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(i18n.language, { month: "short", day: "numeric" });
  };

  const deployChartConfig = useMemo(
    () =>
      ({
        success: { label: t("dashboard.charts.success"), color: "hsl(142, 76%, 36%)" },
        failed: { label: t("dashboard.charts.failed"), color: "hsl(0, 84%, 60%)" }
      }) satisfies ChartConfig,
    [t]
  );

  const trafficChartConfig = useMemo(
    () =>
      ({
        count: { label: t("dashboard.charts.samples"), color: "hsl(221, 83%, 53%)" }
      }) satisfies ChartConfig,
    [t]
  );

  const deployChartData = useMemo(
    () =>
      bootstrap.deployBuckets.map((b) => ({
        label: formatAxisDate(b.t),
        success: b.success,
        failed: b.failed,
        started: b.started
      })),
    [bootstrap.deployBuckets, i18n.language]
  );

  const trafficChartData = useMemo(
    () =>
      bootstrap.trafficBuckets.map((b) => ({
        label: formatAxisDate(b.t),
        count: b.count
      })),
    [bootstrap.trafficBuckets, i18n.language]
  );

  const hasDeployPoints = deployChartData.length > 0;
  const trafficTotal = bootstrap.trafficBuckets.reduce((a, b) => a + b.count, 0);
  const hasTraffic = trafficChartData.length > 0 && trafficTotal > 0;

  const successRateLabel =
    bootstrap.successRate != null ? `${Math.round(bootstrap.successRate * 100)}%` : t("common.emDash");

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-card/30 p-3 sm:grid-cols-4"
        aria-label={t("dashboard.charts.summaryAria")}
      >
        <div>
          <p className="text-xs text-muted-foreground">{t("dashboard.charts.successRate7d")}</p>
          <p className="text-lg font-semibold tabular-nums">{successRateLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("dashboard.charts.terminal7d")}</p>
          <p className="text-lg font-semibold tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">{bootstrap.terminalInRange.success}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-destructive">{bootstrap.terminalInRange.failed}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("dashboard.charts.queued")}</p>
          <p className="text-lg font-semibold tabular-nums">{bootstrap.backlog.queued}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("dashboard.charts.building")}</p>
          <p className="text-lg font-semibold tabular-nums">{bootstrap.backlog.building}</p>
        </div>
      </div>

      <Card className="dashboard-surface border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dashboard.charts.deploymentsTitle")}</CardTitle>
          <CardDescription>
            {t("dashboard.charts.deploymentsDesc", { days: bootstrap.rangeDays })}
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {hasDeployPoints ? (
            <ChartContainer
              config={deployChartConfig}
              className="h-[220px] w-full"
              aria-label={t("dashboard.charts.deploymentsChartAria")}
            >
              <LineChart data={deployChartData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="success"
                  stroke="var(--color-success)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="failed"
                  stroke="var(--color-failed)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <p className="px-6 text-sm text-muted-foreground">{t("dashboard.charts.noDeploymentsWindow")}</p>
          )}
        </CardContent>
      </Card>

      <Card className="dashboard-surface border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dashboard.charts.previewTraffic")}</CardTitle>
          <CardDescription>{t("dashboard.charts.previewTrafficDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {hasTraffic ? (
            <ChartContainer
              config={trafficChartConfig}
              className="h-[200px] w-full"
              aria-label={t("dashboard.charts.previewTrafficAria")}
            >
              <BarChart data={trafficChartData} margin={{ left: 8, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--color-count)" radius={4} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="px-6 text-sm text-muted-foreground">{t("dashboard.charts.noPreviewSamples")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
