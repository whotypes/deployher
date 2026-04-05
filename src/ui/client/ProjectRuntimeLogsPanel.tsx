"use client";

import * as React from "react";
import { Pause, Play, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PLACEHOLDER_CONNECT = "Connecting to runtime log stream...\n";
const PLACEHOLDER_RECONNECT = "Reconnecting to runtime log stream...\n";

const isPlaceholder = (t: string): boolean =>
  t === PLACEHOLDER_CONNECT || t === PLACEHOLDER_RECONNECT;

const dockerTsLine = /^(\d{4}-\d{2}-\d{2}T\S+)\s+(.*)$/;

const formatLogRowTime = (d: Date): string => {
  const mon = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  const ms = String(d.getUTCMilliseconds()).padStart(3, "0").slice(0, 2);
  return `${mon} ${day} ${h}:${min}:${s}.${ms}`;
};

type LogLevel = "error" | "warning" | "info";

const inferLevel = (message: string): LogLevel => {
  if (/\[ERROR\]|ERROR:|FATAL|Exception|Traceback|Error:/i.test(message)) return "error";
  if (/\[WARN\]|WARNING:|warn:/i.test(message)) return "warning";
  return "info";
};

type ParsedLine = {
  key: string;
  raw: string;
  displayTime: string;
  message: string;
  ts: number | null;
  level: LogLevel;
};

const parseLogText = (text: string): ParsedLine[] => {
  const lines = text.split("\n");
  const out: ParsedLine[] = [];
  let i = 0;
  for (const line of lines) {
    if (line.length === 0 && out.length > 0) continue;
    const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
    const m = trimmed.match(dockerTsLine);
    let displayTime = "—";
    let message = trimmed;
    let ts: number | null = null;
    if (m) {
      const tsRaw = m[1];
      if (tsRaw !== undefined) {
        const d = new Date(tsRaw);
        if (!Number.isNaN(d.getTime())) {
          ts = d.getTime();
          displayTime = formatLogRowTime(d);
        } else {
          displayTime = tsRaw.slice(0, 19);
        }
      }
      message = m[2] ?? "";
    }
    const level = inferLevel(message);
    out.push({
      key: `${i++}-${displayTime}-${message.slice(0, 24)}`,
      raw: trimmed,
      displayTime,
      message,
      ts,
      level
    });
  }
  return out;
};

const levelBadge = (level: LogLevel): React.ReactElement => {
  if (level === "error") {
    return (
      <Badge className="rounded px-1.5 py-0 font-mono text-[0.65rem] tabular-nums border-0 bg-red-500/15 text-red-200 ring-1 ring-red-500/30">
        ERR
      </Badge>
    );
  }
  if (level === "warning") {
    return (
      <Badge className="rounded px-1.5 py-0 font-mono text-[0.65rem] tabular-nums border-0 bg-amber-500/15 text-amber-100 ring-1 ring-amber-500/25">
        WRN
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="rounded px-1.5 py-0 font-mono text-[0.65rem] tabular-nums">
      LOG
    </Badge>
  );
};

export type ProjectRuntimeLogsBootstrap = {
  available: boolean;
  deploymentId: string | null;
  deploymentShortId: string | null;
  eligible: boolean;
};

export const ProjectRuntimeLogsPanel = ({
  projectId,
  runtime
}: {
  projectId: string;
  runtime: ProjectRuntimeLogsBootstrap;
}): React.ReactElement => {
  const { available, deploymentId, deploymentShortId, eligible } = runtime;

  const [rawLog, setRawLog] = React.useState("");
  const [live, setLive] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [showError, setShowError] = React.useState(true);
  const [showWarning, setShowWarning] = React.useState(true);
  const [showInfo, setShowInfo] = React.useState(true);
  const [selected, setSelected] = React.useState<ParsedLine | null>(null);
  const [refreshBusy, setRefreshBusy] = React.useState(false);

  const parsed = React.useMemo(() => parseLogText(rawLog), [rawLog]);
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return parsed.filter((row) => {
      if (row.level === "error" && !showError) return false;
      if (row.level === "warning" && !showWarning) return false;
      if (row.level === "info" && !showInfo) return false;
      if (!q) return true;
      return row.message.toLowerCase().includes(q) || row.raw.toLowerCase().includes(q);
    });
  }, [parsed, search, showError, showWarning, showInfo]);

  const loadSnapshot = React.useCallback(async (): Promise<void> => {
    if (!deploymentId) return;
    setRefreshBusy(true);
    try {
      const r = await fetch(`/deployments/${deploymentId}/runtime-log?tail=3000`, {
        credentials: "same-origin"
      });
      const t = await r.text();
      setRawLog(t.trim() ? (t.endsWith("\n") ? t : `${t}\n`) : "");
    } catch {
      setRawLog("Could not load runtime log snapshot.\n");
    } finally {
      setRefreshBusy(false);
    }
  }, [deploymentId]);

  React.useEffect(() => {
    if (!eligible || !deploymentId) return;
    void loadSnapshot();
  }, [eligible, deploymentId, loadSnapshot]);

  React.useEffect(() => {
    if (!eligible || !deploymentId || !live) return;

    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const clearTimer = (): void => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const append = (content: string): void => {
      if (!content) return;
      setRawLog((prev) => {
        if (prev.trim().length === 0 || isPlaceholder(prev)) return content;
        return prev + content;
      });
    };

    const connect = (): void => {
      if (cancelled) return;
      clearTimer();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      setRawLog((prev) =>
        prev.trim().length === 0 || isPlaceholder(prev) ? PLACEHOLDER_CONNECT : prev
      );
      const es = new EventSource(`/deployments/${deploymentId}/runtime-log/stream`);
      eventSource = es;
      es.onmessage = (event: MessageEvent) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data) as { type?: string; content?: string };
          if (payload.type === "log" && payload.content !== undefined) {
            append(payload.content);
          } else if (payload.type === "error" && payload.content !== undefined) {
            append(`\n[ERROR] ${payload.content}\n`);
          }
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        if (cancelled) return;
        es.close();
        eventSource = null;
        setRawLog((prev) => (isPlaceholder(prev) ? PLACEHOLDER_RECONNECT : prev));
        reconnectTimer = setTimeout(connect, 2500);
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimer();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };
  }, [eligible, deploymentId, live]);

  if (!available) {
    return (
      <Card id="runtime-logs">
        <CardHeader>
          <CardTitle>Runtime logs</CardTitle>
          <CardDescription>
            Preview runner is not configured. Runtime logs require a reachable runner (
            <span className="font-mono text-xs">RUNNER_URL</span>).
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!deploymentId || !deploymentShortId) {
    return (
      <Card id="runtime-logs">
        <CardHeader>
          <CardTitle>Runtime logs</CardTitle>
          <CardDescription>
            Set a <strong>current deployment</strong> on the project to attach logs to a preview container.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (!eligible) {
    return (
      <Card id="runtime-logs">
        <CardHeader>
          <CardTitle>Runtime logs</CardTitle>
          <CardDescription>
            Runtime logs apply to the <strong>current</strong> deployment when it is a{" "}
            <strong>successful server</strong> preview.{" "}
            <a href={`/projects/${projectId}`} className="text-foreground underline underline-offset-2">
              Project overview
            </a>{" "}
            ·{" "}
            <a
              href={`/deployments/${deploymentId}`}
              className="text-foreground underline underline-offset-2"
            >
              Deployment {deploymentShortId}
            </a>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <>
      <Card id="runtime-logs" className="scroll-mt-24">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Runtime logs</CardTitle>
              <CardDescription>
                Container stdout/stderr from the isolated runner (deployment{" "}
                <a
                  href={`/deployments/${deploymentId}`}
                  className="font-mono text-xs text-foreground underline-offset-2 hover:underline"
                >
                  {deploymentShortId}
                </a>
                ). Open the preview if the stream is idle (cold start or TTL).
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={live ? "default" : "outline"}
                size="sm"
                className="gap-1.5"
                onClick={() => setLive((v) => !v)}
                aria-pressed={live}
              >
                {live ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
                {live ? "Live" : "Paused"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={refreshBusy}
                onClick={() => void loadSnapshot()}
              >
                <RefreshCw className={cn("size-3.5", refreshBusy && "animate-spin")} aria-hidden />
                Refresh
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                className="h-9 pl-9 font-mono text-xs"
                placeholder="Search logs…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search log messages"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={showError} onCheckedChange={(v) => setShowError(v === true)} />
                <span>Error</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={showWarning} onCheckedChange={(v) => setShowWarning(v === true)} />
                <span>Warning</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox checked={showInfo} onCheckedChange={(v) => setShowInfo(v === true)} />
                <span>Info</span>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="overflow-hidden rounded-md border border-border/80">
            <div className="max-h-[min(28rem,55vh)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-card shadow-[0_1px_0_0_hsl(var(--border))]">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-36 font-mono text-xs">Time</TableHead>
                    <TableHead className="w-16 text-center text-xs">Level</TableHead>
                    <TableHead className="text-xs">Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-sm text-muted-foreground">
                        {parsed.length === 0
                          ? live
                            ? "Waiting for log lines…"
                            : "No snapshot yet. Turn on Live or click Refresh."
                          : "No lines match filters."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((row) => (
                      <TableRow
                        key={row.key}
                        className={cn(
                          "cursor-pointer font-mono text-[0.7rem] leading-snug",
                          selected?.key === row.key && "bg-muted/60"
                        )}
                        data-state={selected?.key === row.key ? "selected" : undefined}
                        onClick={() => setSelected(row)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(row);
                          }
                        }}
                        tabIndex={0}
                        aria-label={`Log line ${row.displayTime}`}
                      >
                        <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                          {row.displayTime}
                        </TableCell>
                        <TableCell className="text-center">{levelBadge(row.level)}</TableCell>
                        <TableCell className="max-w-[min(48rem,55vw)] truncate text-zinc-200">
                          {row.message || " "}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="font-mono text-sm">Log line</SheetTitle>
            <SheetDescription>
              Deployment {deploymentShortId} · {selected?.displayTime ?? ""}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-2">{selected ? levelBadge(selected.level) : null}</div>
            <pre className="max-h-[min(32rem,60vh)] overflow-auto whitespace-pre-wrap break-all rounded-md border border-border/60 bg-zinc-950/50 p-3 font-mono text-[0.7rem] leading-relaxed text-zinc-200">
              {selected?.raw ?? ""}
            </pre>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};
