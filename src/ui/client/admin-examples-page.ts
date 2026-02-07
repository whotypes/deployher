type ExampleDeployment = {
  id: string;
  shortId: string;
  status: "queued" | "building" | "success" | "failed";
  createdAt: string;
  finishedAt: string | null;
  previewUrl: string | null;
};

type ExampleRow = {
  name: string;
  latestDeployment: ExampleDeployment | null;
};

type ExamplesResponse = {
  examples: ExampleRow[];
  error?: string;
};

const getEl = (id: string): HTMLElement | null => document.getElementById(id);

const showNotification = (message: string, type: string): void => {
  const notification = getEl("notification");
  if (!notification) return;
  notification.textContent = message;
  notification.className = "notification is-toast " + type;
  notification.style.display = "block";
  setTimeout(() => {
    notification.style.display = "none";
  }, 3000);
};

const getStatusClass = (status?: string): string => {
  switch (status) {
    case "success":
      return "is-success";
    case "failed":
      return "is-danger";
    case "building":
      return "is-warning";
    case "queued":
      return "is-info";
    default:
      return "is-light";
  }
};

const renderExampleRow = (example: ExampleRow): string => {
  const deployment = example.latestDeployment;
  const deploymentCell = deployment
    ? `<a href="/deployments/${deployment.id}">${deployment.shortId}</a>`
    : `<span style="color: #666">No deployments</span>`;
  const createdAtCell = deployment ? new Date(deployment.createdAt).toLocaleString() : "—";
  const previewButton =
    deployment?.status === "success" && deployment.previewUrl
      ? `<a class="button is-small is-link" href="${deployment.previewUrl}" target="_blank" rel="noopener noreferrer">Preview</a>`
      : "";
  const logsButton = deployment
    ? `<a class="button is-small" href="/deployments/${deployment.id}">Logs</a>`
    : "";

  return `
    <tr data-example-name="${example.name}">
      <td><code>${example.name}</code></td>
      <td data-field="deployment">${deploymentCell}</td>
      <td data-field="status"><span class="tag ${getStatusClass(deployment?.status)}">${deployment?.status ?? "idle"}</span></td>
      <td data-field="createdAt">${createdAtCell}</td>
      <td data-field="actions">
        <div class="buttons">
          <button
            type="button"
            class="button is-success is-small"
            data-action="deploy"
            data-example-name="${example.name}"
          >
            Build & Deploy
          </button>
          ${logsButton}
          ${previewButton}
        </div>
      </td>
    </tr>
  `;
};

document.addEventListener("DOMContentLoaded", () => {
  const tbody = getEl("admin-examples-tbody");
  const refreshBtn = getEl("refresh-admin-examples") as HTMLButtonElement | null;
  if (!tbody) return;

  let pollInterval: ReturnType<typeof setInterval> | null = null;
  let refreshing = false;

  const renderRows = (rows: ExampleRow[]) => {
    tbody.innerHTML = rows.map((row) => renderExampleRow(row)).join("");
  };

  const fetchRows = async (): Promise<ExampleRow[]> => {
    const response = await fetch("/api/admin/examples", { headers: { Accept: "application/json" } });
    const data = (await response.json().catch(() => ({}))) as ExamplesResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "Failed to load examples");
    }
    return Array.isArray(data.examples) ? data.examples : [];
  };

  const refreshRows = async (showToast: boolean) => {
    if (refreshing) return;
    refreshing = true;
    if (refreshBtn) {
      refreshBtn.classList.add("is-loading");
    }
    try {
      const rows = await fetchRows();
      renderRows(rows);
      if (showToast) {
        showNotification("Example statuses updated", "is-success");
      }
    } catch (err) {
      showNotification(err instanceof Error ? err.message : "Failed to load examples", "is-danger");
    } finally {
      refreshing = false;
      if (refreshBtn) {
        refreshBtn.classList.remove("is-loading");
      }
    }
  };

  const runDeployment = async (exampleName: string, button: HTMLButtonElement) => {
    button.classList.add("is-loading");
    button.disabled = true;
    try {
      const response = await fetch(`/api/admin/examples/${encodeURIComponent(exampleName)}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const data = (await response.json().catch(() => ({}))) as {
        deployment?: { id: string };
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to start deployment");
      }
      showNotification(`Started deployment for ${exampleName}`, "is-success");
      await refreshRows(false);
    } catch (err) {
      showNotification(err instanceof Error ? err.message : "Failed to start deployment", "is-danger");
    } finally {
      button.classList.remove("is-loading");
      button.disabled = false;
    }
  };

  tbody.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const button = target.closest("button[data-action='deploy']") as HTMLButtonElement | null;
    if (!button) return;
    const exampleName = button.dataset.exampleName;
    if (!exampleName) return;
    runDeployment(exampleName, button);
  });

  refreshBtn?.addEventListener("click", () => {
    refreshRows(true);
  });

  pollInterval = setInterval(() => {
    refreshRows(false);
  }, 4000);

  window.addEventListener("beforeunload", () => {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });
});

