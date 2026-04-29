"use client";

import type { ReactElement } from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export type DeploymentObservabilityPayload = {
  deploymentShortId: string;
  projectId: string;
  rangeDays: number;
  sampleRate: number;
  sampleCount: number;
  durationSampleCount: number;
  durationMs: { p50: number | null; p95: number | null };
  byStatus: { statusCode: number; count: number }[];
  byMethod: { method: string; count: number }[];
  byPathBucket: { pathBucket: string; count: number }[];
  byPath: { path: string; count: number }[];
  recent: {
    occurredAt: string;
    clientIp: string;
    method: string;
    statusCode: number;
    path: string;
    durationMs: number | null;
  }[];
};

const formatServeMs = (ms: number | null, emDash: string): string => {
  if (ms === null || !Number.isFinite(ms)) return emDash;
  if (ms < 1000) return `${Math.round(ms)}\u202fms`;
  return `${(ms / 1000).toFixed(2)}\u202fs`;
};

export const DeploymentObservabilityPanel = ({
  deploymentId,
  projectId
}: {
  deploymentId: string;
  projectId: string;
}): ReactElement => {
  const { t } = useTranslation();
  const emDash = t("common.emDash");
  const [rangeDays, setRangeDays] = useState<7 | 30>(7);
  const [data, setData] = useState<DeploymentObservabilityPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/deployments/${encodeURIComponent(deploymentId)}/observability?rangeDays=${rangeDays}`,
        { credentials: "same-origin" }
      );
      if (!res.ok) throw new Error(t("deployment.observabilityLoadFailed"));
      setData((await res.json()) as DeploymentObservabilityPayload);
    } catch (e) {
      setData(null);
      setLoadError(e instanceof Error ? e.message : t("common.fetchFailed"));
    }
  }, [deploymentId, rangeDays, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const topBuckets = data?.byPathBucket.slice(0, 12) ?? [];
  const topPaths = data?.byPath.slice(0, 12) ?? [];

  return (
    <Card id="deployment-request-activity" className="scroll-mt-28">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1.5">
          <CardTitle>{t("deployment.observabilityTitle")}</CardTitle>
          <CardDescription>{t("deployment.observabilityDescription")}</CardDescription>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor={`dep-obs-range-${deploymentId}`}>{t("projectObservability.range")}</Label>
            <Select
              value={String(rangeDays)}
              onValueChange={(v) => setRangeDays(v === "30" ? 30 : 7)}
            >
              <SelectTrigger id={`dep-obs-range-${deploymentId}`} className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">{t("projectObservability.last7Days")}</SelectItem>
                <SelectItem value="30">{t("projectObservability.last30Days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" onClick={() => void load()}>
            {t("common.refresh")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className="text-xs text-muted-foreground">
          {t("deployment.observabilitySampleExplanation", {
            ratePct: data != null ? (data.sampleRate * 100).toFixed(1) : emDash,
            deploymentIdShort: data?.deploymentShortId ?? emDash
          })}{" "}
          <Link
            className="font-medium text-foreground underline-offset-4 hover:underline"
            to={`/projects/${projectId}/observability?deploymentId=${encodeURIComponent(deploymentId)}`}
          >
            {t("deployment.observabilityProjectLink")}
          </Link>
        </p>

        {loadError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
        ) : null}

        {data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{t("deployment.observabilitySampleRows")}</p>
              <p className="text-lg font-semibold tabular-nums">{data.sampleCount}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{t("deployment.observabilityDurationSamples")}</p>
              <p className="text-lg font-semibold tabular-nums">{data.durationSampleCount}</p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{t("deployment.observabilityP50Serve")}</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatServeMs(data.durationMs.p50, emDash)}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{t("deployment.observabilityP95Serve")}</p>
              <p className="text-lg font-semibold tabular-nums">
                {formatServeMs(data.durationMs.p95, emDash)}
              </p>
            </div>
          </div>
        ) : null}

        {!loadError && data && data.sampleCount === 0 ? (
          <p className="text-sm text-muted-foreground">{t("deployment.observabilityNoSamples")}</p>
        ) : null}

        {data && data.byStatus.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("deployment.observabilityByStatus")}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("projectObservability.statusCol")}</TableHead>
                  <TableHead className="text-right">{t("projectObservability.samplesCol")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byStatus.slice(0, 24).map((row) => (
                  <TableRow key={`s-${row.statusCode}`}>
                    <TableCell className="font-mono text-xs">{row.statusCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {data && data.byMethod.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("deployment.observabilityByMethod")}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("deployment.observabilityMethodCol")}</TableHead>
                  <TableHead className="text-right">{t("projectObservability.samplesCol")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.byMethod.map((row) => (
                  <TableRow key={row.method}>
                    <TableCell className="font-mono text-xs">{row.method}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {topBuckets.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("deployment.observabilityByPathBucket")}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("deployment.observabilityPathKindCol")}</TableHead>
                  <TableHead className="text-right">{t("projectObservability.samplesCol")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topBuckets.map((row) => (
                  <TableRow key={row.pathBucket}>
                    <TableCell className="font-mono text-xs">{row.pathBucket}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {topPaths.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("deployment.observabilityByPath")}</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("deployment.observabilityPathCol")}</TableHead>
                  <TableHead className="text-right">{t("projectObservability.samplesCol")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topPaths.map((row) => (
                  <TableRow key={row.path}>
                    <TableCell className="max-w-[min(100%,28rem)] truncate font-mono text-xs" title={row.path}>
                      {row.path}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}

        {data && data.recent.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t("deployment.observabilityRecent")}</p>
            <div className="overflow-x-auto rounded-md border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">{t("deployment.observabilityColTime")}</TableHead>
                    <TableHead>{t("deployment.observabilityColPath")}</TableHead>
                    <TableHead className="w-20">{t("deployment.observabilityMethodCol")}</TableHead>
                    <TableHead className="w-16 text-right">{t("projectObservability.statusCol")}</TableHead>
                    <TableHead className="w-28 text-right">{t("deployment.observabilityColServe")}</TableHead>
                    <TableHead className="min-w-28 font-mono text-xs">{t("projectObservability.ipCol")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent.map((row) => (
                    <TableRow key={`${row.occurredAt}-${row.clientIp}-${row.path}-${row.statusCode}`}>
                      <TableCell className="whitespace-nowrap font-mono text-[0.65rem] text-muted-foreground">
                        {new Date(row.occurredAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="max-w-[min(100%,20rem)] truncate font-mono text-[0.65rem]" title={row.path}>
                        {row.path}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{row.method}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{row.statusCode}</TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {formatServeMs(row.durationMs, emDash)}
                      </TableCell>
                      <TableCell className="font-mono text-[0.65rem] text-muted-foreground">{row.clientIp}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
