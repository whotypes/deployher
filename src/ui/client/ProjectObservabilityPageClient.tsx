"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "@/spa/routerCompat";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { fetchWithCsrf } from "./fetchWithCsrf";
import { ProjectRuntimeLogsPanel, type ProjectRuntimeLogsBootstrap } from "./ProjectRuntimeLogsPanel";

export type ProjectObservabilityBootstrap = {
  projectId: string;
  projectName: string;
  runtimeLogs: ProjectRuntimeLogsBootstrap;
};

type MetricsPayload = {
  rangeDays: number;
  bucket: string;
  successRate: number | null;
  terminalInRange: { success: number; failed: number };
  buildDurationSeconds: { p50: number | null; p95: number | null };
  backlog: { queued: number; building: number; oldestQueuedAt: string | null };
  buckets: { t: string; success: number; failed: number; started: number }[];
};

type TrafficPayload = {
  rangeDays: number;
  sampleRate: number;
  deploymentFilter: string | null;
  byDay: { t: string; count: number }[];
  byStatus: { statusCode: number; count: number }[];
  topIps: { clientIp: string; count: number }[];
  byPathBucket: { pathBucket: string; count: number }[];
  byDeployment: { deploymentId: string; shortId: string; count: number }[];
};

type DestinationRow = {
  id: string;
  projectId: string;
  webhookUrl: string;
  createdAt: string;
};

type RuleRow = {
  id: string;
  projectId: string;
  destinationId: string;
  destinationWebhookUrl: string;
  ruleType: "consecutive_failures" | "queue_stall";
  threshold: number;
  cooldownSeconds: number;
  enabled: boolean;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const formatDuration = (sec: number | null, emDash: string): string => {
  if (sec === null || !Number.isFinite(sec)) return emDash;
  if (sec < 60) return `${Math.round(sec)}s`;
  if (sec < 3600) return `${(sec / 60).toFixed(1)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
};

const formatAxisDate = (iso: string, bucket: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (bucket === "hour") {
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

export const ProjectObservabilityPageClient = ({ bootstrap }: { bootstrap: ProjectObservabilityBootstrap }) => {
  const { t } = useTranslation();
  const { projectId, projectName, runtimeLogs } = bootstrap;
  const [searchParams, setSearchParams] = useSearchParams();
  const trafficDeploymentFilter = searchParams.get("deploymentId");

  const deployChartConfig = useMemo(
    () =>
      ({
        success: { label: t("projectObservability.chartLegendSuccess"), color: "hsl(142, 76%, 36%)" },
        failed: { label: t("projectObservability.chartLegendFailed"), color: "hsl(0, 84%, 60%)" }
      }) satisfies ChartConfig,
    [t]
  );

  const trafficChartConfig = useMemo(
    () =>
      ({
        count: { label: t("projectObservability.chartLegendSamples"), color: "hsl(221, 83%, 53%)" }
      }) satisfies ChartConfig,
    [t]
  );
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const [metricsBucket, setMetricsBucket] = useState<"hour" | "day">("day");
  const [metrics, setMetrics] = useState<MetricsPayload | null>(null);
  const [traffic, setTraffic] = useState<TrafficPayload | null>(null);
  const [destinations, setDestinations] = useState<DestinationRow[]>([]);
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [ruleDestinationId, setRuleDestinationId] = useState("");
  const [ruleType, setRuleType] = useState<"consecutive_failures" | "queue_stall">(
    "consecutive_failures"
  );
  const [ruleThreshold, setRuleThreshold] = useState("3");
  const [testWebhookUrl, setTestWebhookUrl] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/observability/metrics?rangeDays=${rangeDays}&bucket=${metricsBucket}`,
      { credentials: "same-origin" }
    );
    if (!res.ok) throw new Error(t("projectObservability.loadMetricsFailed"));
    setMetrics((await res.json()) as MetricsPayload);
  }, [projectId, rangeDays, metricsBucket, t]);

  const loadTraffic = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set("rangeDays", String(rangeDays));
    const depFilter = trafficDeploymentFilter?.trim();
    if (depFilter) qs.set("deploymentId", depFilter);
    const res = await fetch(
      `/api/projects/${projectId}/observability/traffic?${qs.toString()}`,
      { credentials: "same-origin" }
    );
    if (!res.ok) throw new Error(t("projectObservability.loadTrafficFailed"));
    setTraffic((await res.json()) as TrafficPayload);
  }, [projectId, rangeDays, trafficDeploymentFilter, t]);

  const loadAlerts = useCallback(async () => {
    const [dRes, rRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/observability/alerts/destinations`, { credentials: "same-origin" }),
      fetch(`/api/projects/${projectId}/observability/alerts/rules`, { credentials: "same-origin" })
    ]);
    if (!dRes.ok || !rRes.ok) throw new Error(t("projectObservability.loadAlertsFailed"));
    setDestinations((await dRes.json()) as DestinationRow[]);
    setRules((await rRes.json()) as RuleRow[]);
  }, [projectId, t]);

  const refreshAll = useCallback(async () => {
    setLoadError(null);
    try {
      await Promise.all([loadMetrics(), loadTraffic(), loadAlerts()]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t("common.fetchFailed"));
    }
  }, [loadAlerts, loadMetrics, loadTraffic, t]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleAddDestination = async () => {
    setLoadError(null);
    const res = await fetchWithCsrf(`/api/projects/${projectId}/observability/alerts/destinations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: newWebhookUrl.trim() })
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setLoadError(j.error ?? t("projectObservability.addDestinationFailed"));
      return;
    }
    setNewWebhookUrl("");
    await loadAlerts();
  };

  const handleDeleteDestination = async (id: string) => {
    const res = await fetchWithCsrf(
      `/api/projects/${projectId}/observability/alerts/destinations/${id}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      setLoadError(t("projectObservability.deleteDestinationFailed"));
      return;
    }
    await loadAlerts();
  };

  const handleAddRule = async () => {
    if (!ruleDestinationId || ruleDestinationId === "__none__") {
      setLoadError(t("projectObservability.pickWebhook"));
      return;
    }
    const threshold = Number.parseInt(ruleThreshold, 10);
    if (!Number.isFinite(threshold)) {
      setLoadError(t("projectObservability.invalidThreshold"));
      return;
    }
    const res = await fetchWithCsrf(`/api/projects/${projectId}/observability/alerts/rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        destinationId: ruleDestinationId,
        ruleType,
        threshold
      })
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setLoadError(j.error ?? t("projectObservability.createRuleFailed"));
      return;
    }
    setLoadError(null);
    await loadAlerts();
  };

  const handleDeleteRule = async (id: string) => {
    const res = await fetchWithCsrf(`/api/projects/${projectId}/observability/alerts/rules/${id}`, {
      method: "DELETE"
    });
    if (!res.ok) {
      setLoadError(t("projectObservability.deleteRuleFailed"));
      return;
    }
    await loadAlerts();
  };

  const handleToggleRule = async (rule: RuleRow) => {
    const res = await fetchWithCsrf(`/api/projects/${projectId}/observability/alerts/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !rule.enabled })
    });
    if (!res.ok) {
      setLoadError(t("projectObservability.updateRuleFailed"));
      return;
    }
    await loadAlerts();
  };

  const handleTestWebhook = async () => {
    setTestResult(null);
    const res = await fetchWithCsrf(`/api/projects/${projectId}/observability/alerts/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ webhookUrl: testWebhookUrl.trim() })
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      status?: number;
      error?: string;
      bodyPreview?: string;
    };
    if (res.ok && j.ok) {
      setTestResult(t("projectObservability.testWebhookOk", { status: String(j.status ?? "?") }));
    } else {
      setTestResult(j.error ?? `HTTP ${j.status ?? res.status} ${j.bodyPreview ?? ""}`);
    }
  };

  const bucketChartData =
    metrics?.buckets.map((b) => ({
      ...b,
      label: formatAxisDate(b.t, metrics.bucket)
    })) ?? [];

  const trafficChartData =
    traffic?.byDay.map((b) => ({
      ...b,
      label: formatAxisDate(b.t, "day")
    })) ?? [];

  return (
    <div className="space-y-8">
      <ProjectRuntimeLogsPanel projectId={projectId} runtime={runtimeLogs} />

      {loadError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="obs-range">{t("projectObservability.range")}</Label>
          <Select
            value={String(rangeDays)}
            onValueChange={(v) => setRangeDays(v === "30" ? 30 : 7)}
          >
            <SelectTrigger id="obs-range" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">{t("projectObservability.last7Days")}</SelectItem>
              <SelectItem value="30">{t("projectObservability.last30Days")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-bucket">{t("projectObservability.deployChartBucket")}</Label>
          <Select
            value={metricsBucket}
            onValueChange={(v) => setMetricsBucket(v === "hour" ? "hour" : "day")}
          >
            <SelectTrigger id="obs-bucket" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">{t("projectObservability.bucketDaily")}</SelectItem>
              <SelectItem value="hour">{t("projectObservability.bucketHourly")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={() => void refreshAll()}>
          {t("common.refresh")}
        </Button>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-2">
            <Label htmlFor={`obs-dep-filter-${projectId}`}>{t("projectObservability.filterByDeployment")}</Label>
            <Select
              value={trafficDeploymentFilter?.trim() ? trafficDeploymentFilter.trim() : "__all__"}
              onValueChange={(v) => {
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    if (!v || v === "__all__") next.delete("deploymentId");
                    else next.set("deploymentId", v);
                    return next;
                  },
                  { replace: true }
                );
              }}
            >
              <SelectTrigger id={`obs-dep-filter-${projectId}`} className="w-[240px]">
                <SelectValue placeholder={t("projectObservability.allDeployments")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">{t("projectObservability.allDeployments")}</SelectItem>
                {trafficDeploymentFilter?.trim() &&
                traffic &&
                !traffic.byDeployment.some((r) => r.deploymentId === trafficDeploymentFilter.trim()) ? (
                  <SelectItem value={trafficDeploymentFilter.trim()}>
                    {trafficDeploymentFilter.trim().slice(0, 8)}…
                  </SelectItem>
                ) : null}
                {(traffic?.byDeployment ?? []).map((row) => (
                  <SelectItem key={row.deploymentId} value={row.deploymentId}>
                    {row.shortId} ({row.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {trafficDeploymentFilter?.trim() ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    next.delete("deploymentId");
                    return next;
                  },
                  { replace: true }
                )
              }
            >
              {t("projectObservability.clearDeploymentFilter")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("projectObservability.successRate")}</CardTitle>
            <CardDescription>{t("projectObservability.finishedBuildsInRange")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {metrics?.successRate != null ? `${(metrics.successRate * 100).toFixed(1)}%` : t("common.emDash")}
            </p>
            <p className="text-xs text-muted-foreground">
              {metrics
                ? t("projectObservability.okFailedCounts", {
                    ok: metrics.terminalInRange.success,
                    failed: metrics.terminalInRange.failed
                  })
                : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("projectObservability.buildDuration")}</CardTitle>
            <CardDescription>{t("projectObservability.p50p95")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatDuration(metrics?.buildDurationSeconds.p50 ?? null, t("common.emDash"))} /{" "}
              {formatDuration(metrics?.buildDurationSeconds.p95 ?? null, t("common.emDash"))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("projectObservability.backlog")}</CardTitle>
            <CardDescription>{t("projectObservability.queuedBuilding")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {metrics ? `${metrics.backlog.queued} / ${metrics.backlog.building}` : t("common.emDash")}
            </p>
            {metrics?.backlog.oldestQueuedAt ? (
              <p className="text-xs text-muted-foreground">
                {t("projectObservability.oldestQueued")}{" "}
                {new Date(metrics.backlog.oldestQueuedAt).toLocaleString()}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">{t("projectObservability.previewSamples")}</CardTitle>
            <CardDescription>{t("projectObservability.trafficLoggingRate")}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {traffic != null ? `${(traffic.sampleRate * 100).toFixed(1)}%` : t("common.emDash")}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("projectObservability.deploymentsOverTime")}</CardTitle>
          <CardDescription>
            {t("projectObservability.countsByBucket", {
              bucket: metrics?.bucket ?? t("projectObservability.bucket")
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="pl-0">
          {bucketChartData.length > 0 ? (
            <ChartContainer config={deployChartConfig} className="h-[280px] w-full">
              <LineChart data={bucketChartData} margin={{ left: 8, right: 8 }}>
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
            <p className="text-sm text-muted-foreground">{t("projectObservability.noDeployData")}</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("projectObservability.previewTrafficSampled")}</CardTitle>
            <CardDescription>{t("projectObservability.requestsPerDay")}</CardDescription>
          </CardHeader>
          <CardContent className="pl-0">
            {trafficChartData.length > 0 ? (
              <ChartContainer config={trafficChartConfig} className="h-[240px] w-full">
                <BarChart data={trafficChartData} margin={{ left: 8, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis width={32} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={4} />
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-sm text-muted-foreground">{t("projectObservability.noPreviewSamples")}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("projectObservability.topClientIps")}</CardTitle>
            <CardDescription>{t("projectObservability.fromSampledPreview")}</CardDescription>
          </CardHeader>
          <CardContent>
            {traffic && traffic.topIps.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("projectObservability.ipCol")}</TableHead>
                    <TableHead className="text-right">{t("projectObservability.samplesCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {traffic.topIps.map((row) => (
                    <TableRow key={row.clientIp}>
                      <TableCell className="font-mono text-xs">{row.clientIp}</TableCell>
                      <TableCell className="text-right">{row.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{t("projectObservability.noIpData")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {traffic && traffic.byDeployment.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("projectObservability.deploymentsTrafficTitle")}</CardTitle>
            <CardDescription>{t("projectObservability.deploymentsTrafficDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("deployment.deploymentLabel")}</TableHead>
                  <TableHead className="text-right">{t("projectObservability.samplesCol")}</TableHead>
                  <TableHead className="w-[1%] text-right">{t("projectObservability.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traffic.byDeployment.map((row) => (
                  <TableRow key={row.deploymentId}>
                    <TableCell className="font-mono text-xs">{row.shortId}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearchParams(
                              (prev) => {
                                const next = new URLSearchParams(prev);
                                next.set("deploymentId", row.deploymentId);
                                return next;
                              },
                              { replace: true }
                            );
                          }}
                        >
                          {t("projectObservability.filter")}
                        </Button>
                        <Button type="button" variant="ghost" size="sm" asChild>
                          <Link
                            to={`/deployments/${row.deploymentId}`}
                            aria-label={t("projectObservability.openDeploymentAria", {
                              shortId: row.shortId
                            })}
                          >
                            {t("projectObservability.openDeployment")}
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      {traffic && traffic.byStatus.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("projectObservability.responseStatusPreview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("projectObservability.statusCol")}</TableHead>
                  <TableHead className="text-right">{t("projectObservability.samplesCol")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {traffic.byStatus.map((row) => (
                  <TableRow key={row.statusCode}>
                    <TableCell>{row.statusCode}</TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("projectObservability.webhookAlerts")}</CardTitle>
          <CardDescription>{t("projectObservability.webhookAlertsDesc", { projectName })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <Label htmlFor="test-webhook">{t("projectObservability.testWebhookUrl")}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="test-webhook"
                className="max-w-md"
                placeholder="https://example.com/hooks/deployher"
                value={testWebhookUrl}
                onChange={(e) => setTestWebhookUrl(e.target.value)}
                autoComplete="off"
              />
              <Button type="button" variant="secondary" onClick={() => void handleTestWebhook()}>
                {t("projectObservability.sendTest")}
              </Button>
            </div>
            {testResult ? <p className="text-sm text-muted-foreground">{testResult}</p> : null}
          </div>

          <div className="space-y-3">
            <Label htmlFor="new-dest">{t("projectObservability.addWebhookDestination")}</Label>
            <div className="flex flex-wrap gap-2">
              <Input
                id="new-dest"
                className="max-w-md"
                placeholder="https://…"
                value={newWebhookUrl}
                onChange={(e) => setNewWebhookUrl(e.target.value)}
                autoComplete="off"
              />
              <Button type="button" onClick={() => void handleAddDestination()}>
                {t("projectObservability.add")}
              </Button>
            </div>
            {destinations.length > 0 ? (
              <ul className="space-y-2 text-sm">
                {destinations.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 px-3 py-2"
                  >
                    <span className="min-w-0 truncate font-mono text-xs">{d.webhookUrl}</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleDeleteDestination(d.id)}
                    >
                      {t("projectObservability.remove")}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{t("projectObservability.noDestinationsYet")}</p>
            )}
          </div>

          <div className="space-y-3 border-t border-border/60 pt-6">
            <h3 className="text-sm font-medium">{t("projectObservability.rulesHeading")}</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
              <div className="space-y-2">
                <Label>{t("projectObservability.destination")}</Label>
                <Select value={ruleDestinationId} onValueChange={setRuleDestinationId}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("projectObservability.selectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        {t("projectObservability.addDestinationFirst")}
                      </SelectItem>
                    ) : (
                      destinations.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.webhookUrl.slice(0, 48)}
                          {d.webhookUrl.length > 48 ? "…" : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("projectObservability.type")}</Label>
                <Select
                  value={ruleType}
                  onValueChange={(v) =>
                    setRuleType(v === "queue_stall" ? "queue_stall" : "consecutive_failures")
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consecutive_failures">
                      {t("projectObservability.ruleConsecutiveFailures")}
                    </SelectItem>
                    <SelectItem value="queue_stall">{t("projectObservability.ruleQueueStall")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-threshold">
                  {ruleType === "consecutive_failures"
                    ? t("projectObservability.failureCount")
                    : t("projectObservability.maxQueueAge")}
                </Label>
                <Input
                  id="rule-threshold"
                  inputMode="numeric"
                  value={ruleThreshold}
                  onChange={(e) => setRuleThreshold(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void handleAddRule()}>
                {t("projectObservability.addRule")}
              </Button>
            </div>

            {rules.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("projectObservability.type")}</TableHead>
                    <TableHead>{t("projectObservability.threshold")}</TableHead>
                    <TableHead>{t("projectObservability.webhookCol")}</TableHead>
                    <TableHead>{t("projectObservability.enabled")}</TableHead>
                    <TableHead className="text-right">{t("projectObservability.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.ruleType === "consecutive_failures"
                          ? t("projectObservability.ruleConsecutiveFailures")
                          : t("projectObservability.ruleQueueStall")}
                      </TableCell>
                      <TableCell>{r.threshold}</TableCell>
                      <TableCell className="max-w-[200px] truncate font-mono text-xs">
                        {r.destinationWebhookUrl}
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void handleToggleRule(r)}
                        >
                          {r.enabled ? t("projectObservability.on") : t("projectObservability.off")}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDeleteRule(r.id)}
                        >
                          {t("projectObservability.delete")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">{t("projectObservability.noRulesYet")}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
