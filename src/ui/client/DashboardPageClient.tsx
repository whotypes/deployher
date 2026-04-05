"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { WorkspaceDashboardCharts } from "@/lib/workspaceDashboardMetrics";

const formatAxisDate = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const deployChartConfig = {
  success: { label: "Success", color: "hsl(142, 76%, 36%)" },
  failed: { label: "Failed", color: "hsl(0, 84%, 60%)" }
} satisfies ChartConfig;

const trafficChartConfig = {
  count: { label: "Samples", color: "hsl(221, 83%, 53%)" }
} satisfies ChartConfig;

export const DashboardPageClient = ({ bootstrap }: { bootstrap: WorkspaceDashboardCharts }) => {
  const deployChartData = useMemo(
    () =>
      bootstrap.deployBuckets.map((b) => ({
        label: formatAxisDate(b.t),
        success: b.success,
        failed: b.failed,
        started: b.started
      })),
    [bootstrap.deployBuckets]
  );

  const trafficChartData = useMemo(
    () =>
      bootstrap.trafficBuckets.map((b) => ({
        label: formatAxisDate(b.t),
        count: b.count
      })),
    [bootstrap.trafficBuckets]
  );

  const hasDeployPoints = deployChartData.length > 0;
  const trafficTotal = bootstrap.trafficBuckets.reduce((a, b) => a + b.count, 0);
  const hasTraffic = trafficChartData.length > 0 && trafficTotal > 0;

  const successRateLabel =
    bootstrap.successRate != null ? `${Math.round(bootstrap.successRate * 100)}%` : "—";

  return (
    <div className="space-y-4">
      <div
        className="grid grid-cols-2 gap-3 rounded-lg border border-border/60 bg-card/30 p-3 sm:grid-cols-4"
        aria-label="Workspace activity summary"
      >
        <div>
          <p className="text-xs text-muted-foreground">7d success rate</p>
          <p className="text-lg font-semibold tabular-nums">{successRateLabel}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Terminal (7d)</p>
          <p className="text-lg font-semibold tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">{bootstrap.terminalInRange.success}</span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-destructive">{bootstrap.terminalInRange.failed}</span>
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Queued</p>
          <p className="text-lg font-semibold tabular-nums">{bootstrap.backlog.queued}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Building</p>
          <p className="text-lg font-semibold tabular-nums">{bootstrap.backlog.building}</p>
        </div>
      </div>

      <Card className="dashboard-surface border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Deployments</CardTitle>
          <CardDescription>Success and failed finishes per day · last {bootstrap.rangeDays} days</CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {hasDeployPoints ? (
            <ChartContainer
              config={deployChartConfig}
              className="h-[220px] w-full"
              aria-label="Deployments per day chart"
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
            <p className="px-6 text-sm text-muted-foreground">No deployments in this window.</p>
          )}
        </CardContent>
      </Card>

      <Card className="dashboard-surface border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Preview traffic</CardTitle>
          <CardDescription>Sampled requests per day · workspace total</CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {hasTraffic ? (
            <ChartContainer
              config={trafficChartConfig}
              className="h-[200px] w-full"
              aria-label="Preview traffic per day chart"
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
            <p className="px-6 text-sm text-muted-foreground">No preview samples in this window.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
