"use client";

import { useCallback, useEffect, useState } from "react";
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
  byDay: { t: string; count: number }[];
  byStatus: { statusCode: number; count: number }[];
  topIps: { clientIp: string; count: number }[];
  byPathBucket: { pathBucket: string; count: number }[];
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

const formatDuration = (sec: number | null): string => {
  if (sec === null || !Number.isFinite(sec)) return "—";
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

const deployChartConfig = {
  success: { label: "Success", color: "hsl(142, 76%, 36%)" },
  failed: { label: "Failed", color: "hsl(0, 84%, 60%)" }
} satisfies ChartConfig;

const trafficChartConfig = {
  count: { label: "Samples", color: "hsl(221, 83%, 53%)" }
} satisfies ChartConfig;

export const ProjectObservabilityPageClient = ({ bootstrap }: { bootstrap: ProjectObservabilityBootstrap }) => {
  const { projectId, projectName, runtimeLogs } = bootstrap;
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
    if (!res.ok) throw new Error("Failed to load metrics");
    setMetrics((await res.json()) as MetricsPayload);
  }, [projectId, rangeDays, metricsBucket]);

  const loadTraffic = useCallback(async () => {
    const res = await fetch(
      `/api/projects/${projectId}/observability/traffic?rangeDays=${rangeDays}`,
      { credentials: "same-origin" }
    );
    if (!res.ok) throw new Error("Failed to load traffic");
    setTraffic((await res.json()) as TrafficPayload);
  }, [projectId, rangeDays]);

  const loadAlerts = useCallback(async () => {
    const [dRes, rRes] = await Promise.all([
      fetch(`/api/projects/${projectId}/observability/alerts/destinations`, { credentials: "same-origin" }),
      fetch(`/api/projects/${projectId}/observability/alerts/rules`, { credentials: "same-origin" })
    ]);
    if (!dRes.ok || !rRes.ok) throw new Error("Failed to load alerts");
    setDestinations((await dRes.json()) as DestinationRow[]);
    setRules((await rRes.json()) as RuleRow[]);
  }, [projectId]);

  const refreshAll = useCallback(async () => {
    setLoadError(null);
    try {
      await Promise.all([loadMetrics(), loadTraffic(), loadAlerts()]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load");
    }
  }, [loadAlerts, loadMetrics, loadTraffic]);

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
      setLoadError(j.error ?? "Failed to add destination");
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
      setLoadError("Failed to delete destination");
      return;
    }
    await loadAlerts();
  };

  const handleAddRule = async () => {
    if (!ruleDestinationId || ruleDestinationId === "__none__") {
      setLoadError("Pick a webhook destination");
      return;
    }
    const threshold = Number.parseInt(ruleThreshold, 10);
    if (!Number.isFinite(threshold)) {
      setLoadError("Invalid threshold");
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
      setLoadError(j.error ?? "Failed to create rule");
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
      setLoadError("Failed to delete rule");
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
      setLoadError("Failed to update rule");
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
      setTestResult(`OK HTTP ${j.status ?? "?"}`);
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
          <Label htmlFor="obs-range">Range</Label>
          <Select
            value={String(rangeDays)}
            onValueChange={(v) => setRangeDays(v === "30" ? 30 : 7)}
          >
            <SelectTrigger id="obs-range" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="obs-bucket">Deploy chart bucket</Label>
          <Select
            value={metricsBucket}
            onValueChange={(v) => setMetricsBucket(v === "hour" ? "hour" : "day")}
          >
            <SelectTrigger id="obs-bucket" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="hour">Hourly</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" onClick={() => void refreshAll()}>
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Success rate</CardTitle>
            <CardDescription>Finished builds in range</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {metrics?.successRate != null ? `${(metrics.successRate * 100).toFixed(1)}%` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {metrics ? `${metrics.terminalInRange.success} ok · ${metrics.terminalInRange.failed} failed` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Build duration</CardTitle>
            <CardDescription>p50 / p95 (finished)</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatDuration(metrics?.buildDurationSeconds.p50 ?? null)} /{" "}
              {formatDuration(metrics?.buildDurationSeconds.p95 ?? null)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Backlog</CardTitle>
            <CardDescription>Queued / building</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {metrics ? `${metrics.backlog.queued} / ${metrics.backlog.building}` : "—"}
            </p>
            {metrics?.backlog.oldestQueuedAt ? (
              <p className="text-xs text-muted-foreground">
                Oldest queued: {new Date(metrics.backlog.oldestQueuedAt).toLocaleString()}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Preview samples</CardTitle>
            <CardDescription>Traffic logging rate</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {traffic != null ? `${(traffic.sampleRate * 100).toFixed(1)}%` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deployments over time</CardTitle>
          <CardDescription>Counts by {metrics?.bucket ?? "bucket"} in the selected range</CardDescription>
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
            <p className="text-sm text-muted-foreground">No deployment data in this range.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Preview traffic (sampled)</CardTitle>
            <CardDescription>Requests per day (sampled rows only)</CardDescription>
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
              <p className="text-sm text-muted-foreground">No preview samples in this range.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top client IPs</CardTitle>
            <CardDescription>From sampled preview requests</CardDescription>
          </CardHeader>
          <CardContent>
            {traffic && traffic.topIps.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-right">Samples</TableHead>
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
              <p className="text-sm text-muted-foreground">No IP data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {traffic && traffic.byStatus.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Response status (preview)</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
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
          <CardTitle>Webhook alerts</CardTitle>
          <CardDescription>
            We POST JSON to your URL when rules fire ({projectName}). Same payload shape as the test
            below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="space-y-3">
            <Label htmlFor="test-webhook">Test webhook URL</Label>
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
                Send test
              </Button>
            </div>
            {testResult ? <p className="text-sm text-muted-foreground">{testResult}</p> : null}
          </div>

          <div className="space-y-3">
            <Label htmlFor="new-dest">Add webhook destination</Label>
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
                Add
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
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No destinations yet.</p>
            )}
          </div>

          <div className="space-y-3 border-t border-border/60 pt-6">
            <h3 className="text-sm font-medium">Rules</h3>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4 md:items-end">
              <div className="space-y-2">
                <Label>Destination</Label>
                <Select value={ruleDestinationId} onValueChange={setRuleDestinationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    {destinations.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        Add a destination first
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
                <Label>Type</Label>
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
                    <SelectItem value="consecutive_failures">Consecutive failures</SelectItem>
                    <SelectItem value="queue_stall">Queue stall (seconds)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rule-threshold">
                  {ruleType === "consecutive_failures" ? "Failure count" : "Max queue age (sec)"}
                </Label>
                <Input
                  id="rule-threshold"
                  inputMode="numeric"
                  value={ruleThreshold}
                  onChange={(e) => setRuleThreshold(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void handleAddRule()}>
                Add rule
              </Button>
            </div>

            {rules.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Threshold</TableHead>
                    <TableHead>Webhook</TableHead>
                    <TableHead>Enabled</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.ruleType}</TableCell>
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
                          {r.enabled ? "On" : "Off"}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDeleteRule(r.id)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">No rules yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
