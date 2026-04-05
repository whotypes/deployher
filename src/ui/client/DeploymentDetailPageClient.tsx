import * as React from "react";
import type { ReactNode } from "react";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BuildLogTerminal } from "@/components/ui/build-log-terminal";
import { Separator } from "@/components/ui/separator";
import { buildDeploymentPipelineHtml } from "@/lib/deploymentPipeline";
import { cn } from "@/lib/utils";
import type { DeploymentDetailData } from "../DeploymentDetailPage";
import { fetchWithCsrf } from "./fetchWithCsrf";

type Deployment = DeploymentDetailData["deployment"];

const PLACEHOLDERS = [
  "Loading logs...\n",
  "Connecting to build log stream...\n",
  "Connecting...\n",
  "Build queued. Logs will appear when a worker picks up the job.\n",
  "Streaming build logs...\n"
];

const isPlaceholder = (text: string): boolean =>
  PLACEHOLDERS.some((p) => text === p || text.startsWith(p.trim()));

const initialLogText = (d: Deployment): string => {
  if (d.status === "queued") return "Build queued. Logs will appear when a worker picks up the job.\n";
  if (d.status === "building") return "Streaming build logs...\n";
  const active = d.status === "queued" || d.status === "building";
  if (!active && d.buildLogKey) return "Loading logs...\n";
  if (!active) return "No logs available yet.\n";
  return "Connecting...\n";
};

const previewModeLabel = (mode: Deployment["buildPreviewMode"]): string => {
  if (mode === "auto") return "Auto-detect";
  return mode ?? "—";
};

const serverTargetLabel = (target: Deployment["buildServerPreviewTarget"]): string => {
  if (target === "isolated-runner") return "Isolated runner";
  return "—";
};

const formatDuration = (startIso: string, endIso: string | null): string => {
  if (!endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m > 0) return `${m}m ${rs}s`;
  return `${rs}s`;
};

const formatDetailTimestamp = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const statusBadgeLabel = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "building") return "Building";
  if (s === "queued") return "Queued";
  if (s === "success") return "Live";
  if (s === "failed") return "Build failed";
  return status;
};

const statusBadgePresentation = (
  status: string
): { variant: "default" | "secondary" | "destructive" | "outline"; className?: string } => {
  const s = status.toLowerCase();
  if (s === "success") {
    return {
      variant: "default",
      className:
        "rounded border-0 bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25"
    };
  }
  if (s === "failed") {
    return {
      variant: "destructive",
      className:
        "rounded border-0 bg-destructive/15 text-[color-mix(in_oklab,var(--destructive)_88%,white)] ring-1 ring-destructive/30"
    };
  }
  if (s === "building") {
    return {
      variant: "outline",
      className:
        "rounded border-amber-500/35 bg-amber-500/10 text-amber-100 ring-1 ring-amber-500/20"
    };
  }
  if (s === "queued") {
    return {
      variant: "secondary",
      className: "rounded border-border/60 bg-secondary/80 text-secondary-foreground"
    };
  }
  return { variant: "secondary" };
};

const MetaRow = ({
  k,
  children,
  mono
}: {
  k: string;
  children: ReactNode;
  mono?: boolean;
}): React.ReactElement => (
  <div className="flex items-start justify-between gap-3 border-b border-border/50 py-2.5 last:border-b-0">
    <span className="text-xs text-muted-foreground">{k}</span>
    <span
      className={cn(
        "max-w-[58%] text-right text-xs font-medium text-foreground",
        mono && "font-mono text-[0.65rem] leading-snug"
      )}
    >
      {children}
    </span>
  </div>
);

const DeploymentPipeline = ({ status }: { status: string }): React.ReactElement => (
  <div
    id="deployment-pipeline"
    className="flex w-full min-w-0 items-start"
    role="list"
    aria-label="Build pipeline"
    dangerouslySetInnerHTML={{ __html: buildDeploymentPipelineHtml(status) }}
  />
);

const StreamIndicator = ({
  streamState
}: {
  streamState: "live" | "reconnecting" | "saved";
}): React.ReactElement => {
  const label =
    streamState === "live" ? "Live stream" : streamState === "reconnecting" ? "Reconnecting" : "Saved log";
  const dotClass =
    streamState === "live"
      ? "bg-emerald-500"
      : streamState === "reconnecting"
        ? "bg-amber-500"
        : "bg-slate-500";
  return (
    <>
      <span className={cn("inline-block h-2 w-2 rounded-full", dotClass)} aria-hidden />
      <span>{label}</span>
    </>
  );
};

export const DeploymentDetailPageClient = ({
  initialData
}: {
  initialData: DeploymentDetailData;
}): React.ReactElement => {
  const data = initialData;
  const deploymentId = data.deployment.id;
  const previewUrlFallback = data.deployment.previewUrl ?? "";
  const deploymentAtMountRef = React.useRef(initialData.deployment);

  const [status, setStatus] = React.useState(data.deployment.status);
  const [logText, setLogText] = React.useState(() => initialLogText(data.deployment));
  const [streamState, setStreamState] = React.useState<"live" | "reconnecting" | "saved">("live");
  const [previewHref, setPreviewHref] = React.useState<string | null>(
    data.deployment.status === "success" && data.deployment.previewUrl ? data.deployment.previewUrl : null
  );
  const [finishedAtIso, setFinishedAtIso] = React.useState<string | null>(data.deployment.finishedAt);
  const [finishedAtLabel, setFinishedAtLabel] = React.useState<string>(() =>
    data.deployment.finishedAt ? formatDetailTimestamp(data.deployment.finishedAt) : ""
  );
  const [showFinishedRow, setShowFinishedRow] = React.useState(Boolean(data.deployment.finishedAt));
  const [cancelBusy, setCancelBusy] = React.useState(false);
  const [promoteBusy, setPromoteBusy] = React.useState(false);

  const logPreRef = React.useRef<HTMLPreElement>(null);
  const logPendingRef = React.useRef("");
  const logFlushRafRef = React.useRef(0);
  const currentStatusRef = React.useRef(status);

  React.useEffect(() => {
    currentStatusRef.current = status;
  }, [status]);

  const isActive = status === "queued" || status === "building";
  const isSuccess = status === "success";
  const isFailed = status === "failed";
  const badgePres = statusBadgePresentation(status);
  const showResolvedDetails =
    data.deployment.buildPreviewMode === "auto" || data.deployment.buildPreviewMode === null;

  const failureSummary = isFailed
    ? (data.deployment.previewResolution?.detail ??
        data.deployment.previewResolution?.code ??
        null)
    : null;

  React.useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const clearReconnectTimer = (): void => {
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const flushLogPending = (): void => {
      if (logFlushRafRef.current !== 0) {
        cancelAnimationFrame(logFlushRafRef.current);
        logFlushRafRef.current = 0;
      }
      const pending = logPendingRef.current;
      if (pending.length === 0) return;
      logPendingRef.current = "";
      const pre = logPreRef.current;
      const scrolledToBottom =
        pre !== null && pre.scrollHeight - pre.scrollTop <= pre.clientHeight + 50;
      setLogText((prev) => {
        if (isPlaceholder(prev)) return pending;
        return prev + pending;
      });
      if (scrolledToBottom && pre) {
        requestAnimationFrame(() => {
          pre.scrollTop = pre.scrollHeight;
        });
      }
    };

    const scheduleLogFlush = (): void => {
      if (logFlushRafRef.current !== 0) return;
      logFlushRafRef.current = requestAnimationFrame(() => {
        logFlushRafRef.current = 0;
        if (logPendingRef.current.length === 0) return;
        const batch = logPendingRef.current;
        logPendingRef.current = "";
        const pre = logPreRef.current;
        const scrolledToBottom =
          pre !== null && pre.scrollHeight - pre.scrollTop <= pre.clientHeight + 50;
        setLogText((prev) => {
          if (isPlaceholder(prev)) return batch;
          return prev + batch;
        });
        if (scrolledToBottom && pre) {
          pre.scrollTop = pre.scrollHeight;
        }
      });
    };

    const getCurrentLogByteLength = (): number => {
      flushLogPending();
      const text = logPreRef.current?.textContent ?? "";
      if (isPlaceholder(text)) return 0;
      return new TextEncoder().encode(text).length;
    };

    const appendLog = (content: string): void => {
      if (!content) return;
      logPendingRef.current += content;
      scheduleLogFlush();
    };

    const updateStatus = (next: string): void => {
      setStatus(next);
      currentStatusRef.current = next;
      if (next === "success" || next === "failed") {
        clearReconnectTimer();
      }
    };

    const setWaitingMessage = (s: string): void => {
      setLogText((prev) => {
        if (!isPlaceholder(prev)) return prev;
        if (s === "queued") return "Build queued. Logs will appear when a worker picks up the job.\n";
        if (s === "building") return "Streaming build logs...\n";
        return prev;
      });
    };

    const updateFinishedTime = (): void => {
      const iso = new Date().toISOString();
      setFinishedAtIso(iso);
      setFinishedAtLabel(new Date().toLocaleString());
      setShowFinishedRow(true);
    };

    const showPreviewButton = (url?: string): void => {
      setPreviewHref(url ?? previewUrlFallback);
    };

    const loadFinalLog = async (): Promise<void> => {
      flushLogPending();
      try {
        const response = await fetch(`/deployments/${deploymentId}/log`, {
          credentials: "same-origin"
        });
        if (!response.ok) {
          setLogText((prev) => (isPlaceholder(prev) ? "No log output.\n" : prev));
          return;
        }
        const fullLog = await response.text();
        if (!fullLog.trim()) {
          setLogText((prev) => (isPlaceholder(prev) ? "No log output.\n" : prev));
          return;
        }
        const normalized = fullLog.endsWith("\n") ? fullLog : `${fullLog}\n`;
        setLogText((current) => {
          if (isPlaceholder(current) || normalized.length >= current.length) return normalized;
          return current;
        });
        setStreamState("saved");
      } catch {
        setLogText((prev) => (isPlaceholder(prev) ? "No log output.\n" : prev));
      }
    };

    const scheduleReconnect = (connectSSE: () => void): void => {
      if (reconnectTimer !== null) return;
      const cs = currentStatusRef.current;
      if (cs !== "queued" && cs !== "building") return;
      setStreamState("reconnecting");
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (currentStatusRef.current === "queued" || currentStatusRef.current === "building") {
          connectSSE();
        }
      }, 1500);
    };

    const connectSSE = (): void => {
      clearReconnectTimer();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      const offset = getCurrentLogByteLength();
      const streamUrl =
        offset > 0
          ? `/deployments/${deploymentId}/log/stream?offset=${offset}`
          : `/deployments/${deploymentId}/log/stream`;
      setStreamState("live");
      const es = new EventSource(streamUrl);
      eventSource = es;
      es.onmessage = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as {
            type: string;
            status?: string;
            content?: string;
          };
          if (payload.type === "status" && payload.status !== undefined) {
            updateStatus(payload.status);
            setWaitingMessage(payload.status);
          } else if (payload.type === "log" && payload.content !== undefined) {
            appendLog(payload.content);
          } else if (payload.type === "done") {
            flushLogPending();
            if (payload.status !== undefined) updateStatus(payload.status);
            es.close();
            eventSource = null;
            clearReconnectTimer();
            if (payload.status === "success") showPreviewButton();
            updateFinishedTime();
            void loadFinalLog();
          } else if (payload.type === "error" && payload.content !== undefined) {
            flushLogPending();
            appendLog("\n[ERROR] " + payload.content + "\n");
            flushLogPending();
            es.close();
            eventSource = null;
            scheduleReconnect(connectSSE);
          }
        } catch (err) {
          console.error("Failed to parse SSE data:", err);
        }
      };
      es.onerror = () => {
        console.error("SSE connection error");
        es.close();
        eventSource = null;
        void fetch(`/api/deployments/${deploymentId}`, { credentials: "same-origin" })
          .then((res) => (res.ok ? res.json() : null))
          .then((d: { status?: string; previewUrl?: string | null } | null) => {
            if (d?.status && (d.status === "success" || d.status === "failed")) {
              updateStatus(d.status);
              if (d.status === "success" && (d.previewUrl ?? previewUrlFallback)) {
                showPreviewButton(d.previewUrl ?? previewUrlFallback ?? undefined);
              }
              updateFinishedTime();
              void loadFinalLog();
            } else if (d?.status && (d.status === "queued" || d.status === "building")) {
              updateStatus(d.status);
              setWaitingMessage(d.status);
              scheduleReconnect(connectSSE);
            } else {
              scheduleReconnect(connectSSE);
            }
          })
          .catch(() => {
            scheduleReconnect(connectSSE);
          });
      };
    };

    const dep = deploymentAtMountRef.current;
    const initial = dep.status;
    const active = initial === "queued" || initial === "building";
    const terminal = initial === "success" || initial === "failed";
    const startLog = initialLogText(dep);

    if (active) {
      connectSSE();
    } else if (terminal || startLog.startsWith("Loading logs")) {
      void loadFinalLog();
    }

    return () => {
      clearReconnectTimer();
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (logFlushRafRef.current !== 0) {
        cancelAnimationFrame(logFlushRafRef.current);
        logFlushRafRef.current = 0;
      }
    };
  }, [deploymentId, previewUrlFallback]);

  const flushForCancel = (): void => {
    if (logFlushRafRef.current !== 0) {
      cancelAnimationFrame(logFlushRafRef.current);
      logFlushRafRef.current = 0;
    }
    const pending = logPendingRef.current;
    if (pending.length === 0) return;
    logPendingRef.current = "";
    setLogText((prev) => (isPlaceholder(prev) ? pending : prev + pending));
  };

  const handleSetAsProjectCurrent = async (): Promise<void> => {
    if (promoteBusy) return;
    setPromoteBusy(true);
    try {
      const response = await fetchWithCsrf(`/api/projects/${data.project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentDeploymentId: data.deployment.id })
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to set current deployment");
      }
      window.location.reload();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Failed to set current deployment");
    } finally {
      setPromoteBusy(false);
    }
  };

  const handleCancel = async (): Promise<void> => {
    if (!window.confirm("Cancel this build?")) return;
    setCancelBusy(true);
    try {
      const response = await fetchWithCsrf(`/deployments/${deploymentId}/cancel`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to cancel deployment");
      }
      const line = `\n[${new Date().toISOString()}] Cancellation requested.\n`;
      logPendingRef.current += line;
      flushForCancel();
      setStatus("failed");
      currentStatusRef.current = "failed";
      const iso = new Date().toISOString();
      setFinishedAtIso(iso);
      setFinishedAtLabel(new Date().toLocaleString());
      setShowFinishedRow(true);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : "Failed to cancel deployment");
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Badge
              data-deployment-status={status}
              variant={badgePres.variant}
              className={cn(
                "gap-1.5 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]",
                badgePres.className
              )}
            >
              <span
                className={cn(
                  "inline-block size-1.5 rounded-full",
                  isSuccess && "bg-emerald-400",
                  isFailed && "bg-[color-mix(in_oklab,var(--destructive)_80%,white)]",
                  status === "building" && "bg-amber-300",
                  status === "queued" && "bg-chart-3"
                )}
                aria-hidden
              />
              <span>{statusBadgeLabel(status)}</span>
            </Badge>
            {isActive ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin text-amber-200/90" aria-hidden />
                <span>Streaming logs…</span>
              </div>
            ) : null}
          </div>
          <h1 className="font-serif truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {data.project.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Deployment{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {data.deployment.shortId}
            </code>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/projects/${data.project.id}`}>View project</a>
          </Button>
          <Button variant="secondary" size="sm" className="gap-1.5" asChild>
            <a href={`/projects/${data.project.id}`}>
              <RotateCcw className="size-3.5" aria-hidden />
              Redeploy
            </a>
          </Button>
          {isActive ? (
            <Button
              variant="destructive"
              size="sm"
              type="button"
              disabled={cancelBusy}
              onClick={() => void handleCancel()}
            >
              Cancel build
            </Button>
          ) : null}
          {previewHref ? (
            <Button size="sm" asChild>
              <a href={previewHref} target="_blank" rel="noopener noreferrer">
                Visit preview
              </a>
            </Button>
          ) : null}
          {isSuccess && data.deployment.id !== data.project.currentDeploymentId ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={promoteBusy}
              onClick={() => void handleSetAsProjectCurrent()}
            >
              Set as project current
            </Button>
          ) : null}
          {isSuccess && data.deployment.id === data.project.currentDeploymentId ? (
            <span className="text-xs text-muted-foreground self-center">Project current</span>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          "grid gap-0 border-t border-border/70 pt-6",
          "md:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)]"
        )}
      >
        <aside className="border-border/70 pb-6 md:border-r md:pr-6 md:pb-0">
          <p
            id="deployment-settings"
            className="mb-3 scroll-mt-24 text-xs leading-relaxed text-muted-foreground"
          >
            This page is for this run only.{" "}
            <a
              href={`/projects/${data.project.id}/settings`}
              className="font-medium text-primary no-underline hover:underline"
            >
              Project settings
            </a>{" "}
            cover repo, branch, and environment for new deployments.
          </p>
          <p className="mb-3 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Build pipeline
          </p>
          <DeploymentPipeline status={status} />
          <Separator className="my-5 bg-border/60" />
          <p className="mb-1 text-[0.65rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            Details
          </p>
          <div className="flex flex-col">
            <MetaRow k="Deployment ID" mono>
              {data.deployment.shortId}
            </MetaRow>
            <MetaRow k="Project">
              <a
                href={`/projects/${data.project.id}`}
                className="font-medium text-primary no-underline hover:underline"
              >
                {data.project.name}
              </a>
            </MetaRow>
            <MetaRow k="Preview type">{previewModeLabel(data.deployment.buildPreviewMode)}</MetaRow>
            {showResolvedDetails ? (
              <MetaRow k="Resolved">
                {isActive ? "Resolving…" : data.deployment.serveStrategy}
              </MetaRow>
            ) : null}
            <MetaRow k="Runner">{serverTargetLabel(data.deployment.buildServerPreviewTarget)}</MetaRow>
            {showResolvedDetails ? (
              <MetaRow k="Resolution">
                {data.deployment.previewResolution?.detail ??
                  data.deployment.previewResolution?.code ??
                  "—"}
              </MetaRow>
            ) : null}
            <MetaRow k="Duration">
              {formatDuration(data.deployment.createdAt, finishedAtIso)}
            </MetaRow>
            <MetaRow k="Created" mono>
              {formatDetailTimestamp(data.deployment.createdAt)}
            </MetaRow>
            <div className={cn(!showFinishedRow && "hidden")}>
              <MetaRow k="Finished" mono>
                <span>{finishedAtLabel}</span>
              </MetaRow>
            </div>
            {isSuccess && previewHref ? (
              <MetaRow k="URL" mono>
                <a
                  href={previewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-primary no-underline hover:underline"
                >
                  {previewHref}
                </a>
              </MetaRow>
            ) : null}
          </div>
        </aside>

        <section
          id="build-logs"
          className="flex scroll-mt-28 flex-col gap-4 pt-6 md:pl-6 md:pt-0"
        >
          {isFailed ? (
            <Alert
              variant="destructive"
              className="rounded-xl border-destructive/40 bg-destructive/10 [&>svg]:top-4"
            >
              <AlertCircle className="size-4" />
              <AlertTitle className="text-[0.8125rem] font-semibold tracking-wide">
                {failureSummary || "Build failed"}
              </AlertTitle>
              {!failureSummary ? (
                <AlertDescription className="text-destructive/90">
                  See the build output below for the full log.
                </AlertDescription>
              ) : (
                <AlertDescription className="text-destructive/85">
                  See the build output below for context and stack traces.
                </AlertDescription>
              )}
            </Alert>
          ) : null}

          <div className="space-y-2">
            <p className="px-0.5 text-[0.65rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
              Build output
            </p>
            <BuildLogTerminal logPath={`${data.deployment.artifactPrefix}/build.log`} streamSlot={<StreamIndicator streamState={streamState} />}>
              <pre
                ref={logPreRef}
                className={cn(
                  "kinetic-log-output log-output relative z-1 max-h-[min(24rem,55vh)] min-h-[10rem]",
                  "overflow-auto rounded-none border-0 bg-zinc-950/40 px-4 py-3 font-mono text-[0.7rem] leading-[1.75]",
                  "text-zinc-200 selection:bg-primary/30 selection:text-foreground"
                )}
              >
                {logText}
              </pre>
            </BuildLogTerminal>
          </div>

          {data.runtimeLogsAvailable &&
          data.deployment.serveStrategy === "server" &&
          status === "success" ? (
            <p className="border-t border-border/60 pt-4 text-sm text-muted-foreground">
              <a
                href={`/projects/${data.project.id}/observability#runtime-logs`}
                className="font-medium text-foreground underline-offset-2 hover:underline"
              >
                Runtime logs
              </a>{" "}
              for this preview are on Observability.
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
};
