/**
 * Browser-only script for the Deployment detail page. Uses DOM APIs and EventSource.
 * Do not import in React or server code — loaded via <script src="/assets/deployment-detail-page.js" type="module">.
 */

const getEl = (id: string): HTMLElement | null => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  const deploymentIdEl = getEl("deployment-id") as HTMLInputElement | null;
  const previewUrlEl = getEl("preview-url") as HTMLInputElement | null;
  const deploymentId = deploymentIdEl?.value ?? "";
  const previewUrl = previewUrlEl?.value ?? "";
  const statusBadge = getEl("status-badge");
  const buildingIndicator = getEl("building-indicator");
  const logOutput = getEl("log-output");
  const previewSection = getEl("preview-section");
  const finishedRow = getEl("finished-row");
  const finishedTime = getEl("finished-time");
  const loadingPlaceholder = "Loading logs...\n";

  if (!statusBadge || !logOutput) return;

  let eventSource: EventSource | null = null;

  const connectSSE = (): void => {
    if (eventSource) {
      eventSource.close();
    }
    eventSource = new EventSource("/deployments/" + deploymentId + "/log/stream");
    eventSource.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as {
          type: string;
          status?: string;
          content?: string;
          fullLog?: string;
        };
        if (data.type === "status" && data.status !== undefined) {
          updateStatus(data.status);
        } else if (data.type === "log" && data.content !== undefined) {
          appendLog(data.content);
        } else if (data.type === "done") {
          if (data.fullLog !== undefined && data.fullLog !== "") {
            logOutput.textContent = data.fullLog + (data.fullLog.endsWith("\n") ? "" : "\n");
          } else if (logOutput.textContent === loadingPlaceholder) {
            logOutput.textContent = "No log output.\n";
          }
          if (data.status !== undefined) updateStatus(data.status);
          eventSource?.close();
          eventSource = null;
          if (data.status === "success") showPreviewButton();
          updateFinishedTime();
        } else if (data.type === "error" && data.content !== undefined) {
          appendLog("\n[ERROR] " + data.content + "\n");
          eventSource?.close();
          eventSource = null;
        }
      } catch (err) {
        console.error("Failed to parse SSE data:", err);
      }
    };
    eventSource.onerror = () => {
      console.error("SSE connection error");
      eventSource?.close();
      eventSource = null;
    };
  };

  const updateStatus = (status: string): void => {
    statusBadge.textContent = status;
    statusBadge.className = "tag";
    switch (status) {
      case "success":
        statusBadge.classList.add("is-success");
        break;
      case "failed":
        statusBadge.classList.add("is-danger");
        break;
      case "building":
        statusBadge.classList.add("is-warning");
        break;
      case "queued":
        statusBadge.classList.add("is-info");
        break;
      default:
        statusBadge.classList.add("is-light");
    }
    if (buildingIndicator && (status === "success" || status === "failed")) {
      buildingIndicator.style.display = "none";
    }
  };

  const appendLog = (content: string): void => {
    const scrolledToBottom =
      logOutput.scrollHeight - logOutput.scrollTop <= logOutput.clientHeight + 50;
    if (logOutput.textContent === loadingPlaceholder) {
      logOutput.textContent = content;
    } else {
      logOutput.textContent += content;
    }
    if (scrolledToBottom) {
      logOutput.scrollTop = logOutput.scrollHeight;
    }
  };

  const showPreviewButton = (): void => {
    if (!previewSection) return;
    previewSection.textContent = "";

    const link = document.createElement("a");
    link.href = previewUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "button is-success";
    link.textContent = "Visit";

    previewSection.appendChild(link);
  };

  const updateFinishedTime = (): void => {
    if (finishedRow && finishedTime) {
      finishedRow.style.display = "table-row";
      finishedTime.textContent = new Date().toLocaleString();
    }
  };

  const initialStatus = statusBadge.textContent?.trim().toLowerCase() ?? "";
  const needsLogStream =
    initialStatus === "queued" ||
    initialStatus === "building" ||
    (logOutput.textContent?.startsWith("Loading logs") ?? false);
  if (needsLogStream) {
    connectSSE();
  }
});
