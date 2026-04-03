/**
 * Browser-only script for the Deployment detail page. Uses DOM APIs and EventSource.
 * Do not import in React or server code — loaded via <script src="/assets/deployment-detail-page.js" type="module">.
 */

import { buildDeploymentPipelineHtml } from "../../lib/deploymentPipeline";
import { fetchWithCsrf } from "./fetchWithCsrf";

const getEl = (id: string): HTMLElement | null => document.getElementById(id);

const statusLabelForApi = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "building") return "Building";
  if (s === "queued") return "Queued";
  if (s === "success") return "Live";
  if (s === "failed") return "Build failed";
  return status;
};

const badgeClassesForStatus = (status: string): string => {
  const base =
    "inline-flex items-center gap-1.5 rounded border-0 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em] transition-colors";
  const s = status.toLowerCase();
  if (s === "success") {
    return `${base} bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25`;
  }
  if (s === "failed") {
    return `${base} bg-[color-mix(in_oklab,var(--destructive)_15%,transparent)] text-[color-mix(in_oklab,var(--destructive)_88%,white)] ring-1 ring-destructive/30`;
  }
  if (s === "building") {
    return `${base} border-amber-500/35 bg-amber-500/10 text-amber-100 ring-1 ring-amber-500/20`;
  }
  if (s === "queued") {
    return `${base} border-border/60 bg-secondary/80 text-secondary-foreground ring-1 ring-border/40`;
  }
  return `${base} border-border/60 bg-muted text-muted-foreground`;
};

const dotClassesForStatus = (status: string): string => {
  const base = "inline-block size-1.5 rounded-full";
  const s = status.toLowerCase();
  if (s === "success") return `${base} bg-emerald-400`;
  if (s === "failed") return `${base} bg-[color-mix(in_oklab,var(--destructive)_80%,white)]`;
  if (s === "building") return `${base} bg-amber-300`;
  if (s === "queued") return `${base} bg-chart-3`;
  return `${base} bg-muted-foreground`;
};

document.addEventListener("DOMContentLoaded", () => {
  const deploymentIdEl = getEl("deployment-id") as HTMLInputElement | null;
  const previewUrlEl = getEl("preview-url") as HTMLInputElement | null;
  const deploymentId = deploymentIdEl?.value ?? "";
  const previewUrl = previewUrlEl?.value ?? "";
  const statusBadge = getEl("status-badge");
  const statusLabelEl = getEl("status-badge-label");
  const statusDotEl = getEl("status-badge-dot");
  const deploymentPipeline = getEl("deployment-pipeline");
  const buildingIndicator = getEl("building-indicator");
  const logOutput = getEl("log-output");
  const previewSection = getEl("preview-section");
  const cancelButton = getEl("cancel-deployment-btn") as HTMLButtonElement | null;
  const finishedRow = getEl("finished-row");
  const finishedTime = getEl("finished-time");
  const logStreamHost = getEl("log-stream-state");
  const PLACEHOLDERS = [
    "Loading logs...\n",
    "Connecting to build log stream...\n",
    "Connecting...\n",
    "Build queued. Logs will appear when a worker picks up the job.\n",
    "Streaming build logs...\n"
  ];
  const isPlaceholder = (text: string | null): boolean =>
    text != null && PLACEHOLDERS.some((p) => text === p || text.startsWith(p.trim()));

  if (!statusBadge || !logOutput) return;

  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let currentStatus =
    statusBadge.getAttribute("data-deployment-status")?.trim().toLowerCase() ??
    statusLabelEl?.textContent?.trim().toLowerCase() ??
    "";
  let streamState: "live" | "reconnecting" | "saved" = "live";

  const streamStateEl = document.createElement("div");
  streamStateEl.className =
    "flex items-center gap-2 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground";
  if (logStreamHost) {
    logStreamHost.appendChild(streamStateEl);
  } else {
    logOutput.parentElement?.insertBefore(streamStateEl, logOutput);
  }

  const renderStreamState = (): void => {
    const label =
      streamState === "live"
        ? "Live stream"
        : streamState === "reconnecting"
          ? "Reconnecting"
          : "Saved log";
    const dotClass =
      streamState === "live"
        ? "bg-emerald-500"
        : streamState === "reconnecting"
          ? "bg-amber-500"
          : "bg-slate-500";
    streamStateEl.innerHTML = `<span class="inline-block h-2 w-2 rounded-full ${dotClass}" aria-hidden="true"></span><span>${label}</span>`;
  };
  renderStreamState();

  let logFlushRaf = 0;
  let logPending = "";

  const applyLogBatch = (content: string): void => {
    const scrolledToBottom =
      logOutput.scrollHeight - logOutput.scrollTop <= logOutput.clientHeight + 50;
    if (isPlaceholder(logOutput.textContent)) {
      logOutput.textContent = content;
    } else {
      logOutput.textContent = (logOutput.textContent ?? "") + content;
    }
    if (scrolledToBottom) {
      logOutput.scrollTop = logOutput.scrollHeight;
    }
  };

  const flushLogPending = (): void => {
    if (logFlushRaf !== 0) {
      cancelAnimationFrame(logFlushRaf);
      logFlushRaf = 0;
    }
    if (logPending.length === 0) return;
    const batch = logPending;
    logPending = "";
    applyLogBatch(batch);
  };

  const scheduleLogFlush = (): void => {
    if (logFlushRaf !== 0) return;
    logFlushRaf = requestAnimationFrame(() => {
      logFlushRaf = 0;
      if (logPending.length === 0) return;
      const batch = logPending;
      logPending = "";
      applyLogBatch(batch);
    });
  };

  const getCurrentLogByteLength = (): number => {
    flushLogPending();
    const text = logOutput.textContent ?? "";
    if (isPlaceholder(text)) return 0;
    return new TextEncoder().encode(text).length;
  };

  const clearReconnectTimer = (): void => {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const scheduleReconnect = (): void => {
    if (reconnectTimer !== null || (currentStatus !== "queued" && currentStatus !== "building")) {
      return;
    }
    streamState = "reconnecting";
    renderStreamState();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (currentStatus === "queued" || currentStatus === "building") {
        connectSSE();
      }
    }, 1500);
  };

  const connectSSE = (): void => {
    clearReconnectTimer();
    if (eventSource) {
      eventSource.close();
    }
    const offset = getCurrentLogByteLength();
    const streamUrl =
      offset > 0
        ? `/deployments/${deploymentId}/log/stream?offset=${offset}`
        : `/deployments/${deploymentId}/log/stream`;
    streamState = "live";
    renderStreamState();
    eventSource = new EventSource(streamUrl);
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          status?: string;
          content?: string;
        };
        if (data.type === "status" && data.status !== undefined) {
          updateStatus(data.status);
          setWaitingMessage(data.status);
        } else if (data.type === "log" && data.content !== undefined) {
          appendLog(data.content);
        } else if (data.type === "done") {
          flushLogPending();
          if (data.status !== undefined) updateStatus(data.status);
          eventSource?.close();
          eventSource = null;
          clearReconnectTimer();
          if (data.status === "success") showPreviewButton();
          updateFinishedTime();
          void loadFinalLog();
        } else if (data.type === "error" && data.content !== undefined) {
          flushLogPending();
          appendLog("\n[ERROR] " + data.content + "\n");
          flushLogPending();
          eventSource?.close();
          eventSource = null;
          scheduleReconnect();
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };
    eventSource.onerror = () => {
      console.error("SSE connection error");
      eventSource?.close();
      eventSource = null;
      fetch(`/api/deployments/${deploymentId}`, { credentials: "same-origin" })
        .then((res) => (res.ok ? res.json() : null))
        .then((d) => {
          if (d?.status && (d.status === "success" || d.status === "failed")) {
            updateStatus(d.status);
            if (buildingIndicator) buildingIndicator.classList.add("hidden");
            if (d.status === "success" && (d.previewUrl ?? previewUrl)) showPreviewButton(d.previewUrl ?? previewUrl);
            updateFinishedTime();
            void loadFinalLog();
          } else if (d?.status && (d.status === "queued" || d.status === "building")) {
            updateStatus(d.status);
            setWaitingMessage(d.status);
            scheduleReconnect();
          } else {
            scheduleReconnect();
          }
        })
        .catch(() => {
          scheduleReconnect();
        });
    };
  };

  const loadFinalLog = async (): Promise<void> => {
    flushLogPending();
    try {
      const response = await fetch(`/deployments/${deploymentId}/log`, {
        credentials: "same-origin"
      });
      if (!response.ok) {
        if (isPlaceholder(logOutput.textContent)) {
          logOutput.textContent = "No log output.\n";
        }
        return;
      }
      const fullLog = await response.text();
      if (!fullLog.trim()) {
        if (isPlaceholder(logOutput.textContent)) {
          logOutput.textContent = "No log output.\n";
        }
        return;
      }
      const normalized = fullLog.endsWith("\n") ? fullLog : `${fullLog}\n`;
      const current = logOutput.textContent ?? "";
      if (isPlaceholder(current) || normalized.length >= current.length) {
        logOutput.textContent = normalized;
      }
      streamState = "saved";
      renderStreamState();
    } catch {
      if (isPlaceholder(logOutput.textContent)) {
        logOutput.textContent = "No log output.\n";
      }
    }
  };

  const setWaitingMessage = (status: string): void => {
    if (!logOutput || !isPlaceholder(logOutput.textContent)) return;
    if (status === "queued") {
      logOutput.textContent = "Build queued. Logs will appear when a worker picks up the job.\n";
    } else if (status === "building") {
      logOutput.textContent = "Streaming build logs...\n";
    }
  };

  const updateStatus = (status: string): void => {
    currentStatus = status;
    statusBadge.setAttribute("data-deployment-status", status);
    if (statusLabelEl) {
      statusLabelEl.textContent = statusLabelForApi(status);
    }
    statusBadge.className = badgeClassesForStatus(status);
    if (statusDotEl) {
      statusDotEl.className = dotClassesForStatus(status);
    }
    if (deploymentPipeline) {
      deploymentPipeline.innerHTML = buildDeploymentPipelineHtml(status);
    }
    if (buildingIndicator && (status === "success" || status === "failed")) {
      buildingIndicator.classList.add("hidden");
    }
    if (cancelButton && (status === "success" || status === "failed")) {
      cancelButton.disabled = true;
      cancelButton.classList.add("hidden");
    }
    if (status === "success" || status === "failed") {
      clearReconnectTimer();
    }
  };

  const appendLog = (content: string): void => {
    if (!content) return;
    logPending += content;
    scheduleLogFlush();
  };

  const showPreviewButton = (url?: string): void => {
    if (!previewSection) return;
    previewSection.innerHTML = "";

    const link = document.createElement("a");
    link.href = url ?? previewUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Visit preview";
    link.className =
      "inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

    previewSection.appendChild(link);
  };

  const updateFinishedTime = (): void => {
    if (finishedRow && finishedTime) {
      finishedRow.classList.remove("hidden");
      finishedTime.textContent = new Date().toLocaleString();
    }
  };

  const initialStatus =
    statusBadge.getAttribute("data-deployment-status")?.trim().toLowerCase() ?? "";
  const isActive = initialStatus === "queued" || initialStatus === "building";
  const isTerminal = initialStatus === "success" || initialStatus === "failed";

  cancelButton?.addEventListener("click", async () => {
    if (!window.confirm("Cancel this build?")) return;
    cancelButton.disabled = true;
    try {
      const response = await fetchWithCsrf(`/deployments/${deploymentId}/cancel`, {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Failed to cancel deployment");
      }
      appendLog(`\n[${new Date().toISOString()}] Cancellation requested.\n`);
      flushLogPending();
      updateStatus("failed");
      updateFinishedTime();
    } catch (error) {
      console.error(error);
      cancelButton.disabled = false;
      window.alert(error instanceof Error ? error.message : "Failed to cancel deployment");
    }
  });

  if (isActive) {
    connectSSE();
  } else if (isTerminal || (logOutput.textContent?.startsWith("Loading logs") ?? false)) {
    void loadFinalLog();
  }
});
