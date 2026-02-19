/**
 * Browser-only script for the Project detail page. Uses DOM APIs.
 * Do not import in React or server code — loaded via <script src="/assets/project-detail-page.js" type="module">.
 */

const getEl = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const MAX_ENV_FILE_SIZE_BYTES = 64 * 1024;
const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ProjectEnv = {
  id: string;
  key: string;
  value: string;
  isPublic: boolean;
};

type ApiError = { error?: string };

const parseApiError = async (response: Response, fallback: string): Promise<string> => {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  return body.error ?? fallback;
};

document.addEventListener("DOMContentLoaded", () => {
  const editForm = getEl<HTMLFormElement>("edit-project-form");
  const deployBtn = getEl<HTMLButtonElement>("deploy-btn");
  const deleteBtn = getEl<HTMLButtonElement>("delete-btn");
  const notification = getEl<HTMLElement>("notification");
  const projectIdEl = getEl<HTMLInputElement>("project-id");
  const deployEnvText = getEl<HTMLTextAreaElement>("deploy-env-file");
  const deployEnvUpload = getEl<HTMLInputElement>("deploy-env-upload");

  const tabOverviewBtn = getEl<HTMLButtonElement>("project-tab-btn-overview");
  const tabEnvBtn = getEl<HTMLButtonElement>("project-tab-btn-env");
  const tabOverview = getEl<HTMLElement>("project-tab-overview");
  const tabEnv = getEl<HTMLElement>("project-tab-env");

  const envRowsEl = getEl<HTMLTableSectionElement>("project-env-rows");
  const envEmptyRow = getEl<HTMLTableRowElement>("project-env-empty");
  const envAddBtn = getEl<HTMLButtonElement>("project-env-add");
  const envSaveBtn = getEl<HTMLButtonElement>("project-env-save");

  const projectId = projectIdEl?.value ?? "";
  let envLoaded = false;

  if (!notification) return;

  const showNotification = (message: string, type: string): void => {
    notification.textContent = message;
    notification.className = "notification is-toast " + type;
    notification.style.display = "block";
    setTimeout(() => {
      notification.style.display = "none";
    }, 3000);
  };

  const setTab = (tab: "overview" | "env") => {
    const overviewActive = tab === "overview";

    if (tabOverview) tabOverview.style.display = overviewActive ? "block" : "none";
    if (tabEnv) tabEnv.style.display = overviewActive ? "none" : "block";

    if (tabOverviewBtn) {
      tabOverviewBtn.classList.toggle("is-active", overviewActive);
      tabOverviewBtn.setAttribute("aria-selected", overviewActive ? "true" : "false");
      tabOverviewBtn.parentElement?.classList.toggle("is-active", overviewActive);
    }
    if (tabEnvBtn) {
      tabEnvBtn.classList.toggle("is-active", !overviewActive);
      tabEnvBtn.setAttribute("aria-selected", overviewActive ? "false" : "true");
      tabEnvBtn.parentElement?.classList.toggle("is-active", !overviewActive);
    }
  };

  const getEnvRows = (): HTMLTableRowElement[] => {
    if (!envRowsEl) return [];
    return Array.from(envRowsEl.querySelectorAll<HTMLTableRowElement>('tr[data-env-row="1"]'));
  };

  const updateEnvEmptyState = () => {
    if (!envEmptyRow) return;
    envEmptyRow.style.display = getEnvRows().length > 0 ? "none" : "table-row";
  };

  const removeEnvRow = async (row: HTMLTableRowElement) => {
    const envId = row.dataset.envId ?? "";

    if (!envId) {
      row.remove();
      updateEnvEmptyState();
      return;
    }

    try {
      const response = await fetch(`/api/projects/${projectId}/env/${envId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to delete environment variable"));
      }

      row.remove();
      updateEnvEmptyState();
      showNotification("Environment variable deleted", "is-success");
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : "Failed to delete environment variable",
        "is-danger"
      );
    }
  };

  const buildEnvRow = (env?: ProjectEnv): HTMLTableRowElement => {
    const row = document.createElement("tr");
    row.dataset.envRow = "1";
    if (env?.id) {
      row.dataset.envId = env.id;
    }

    const keyTd = document.createElement("td");
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.className = "input is-family-monospace";
    keyInput.placeholder = "API_BASE_URL";
    keyInput.value = env?.key ?? "";
    keyInput.maxLength = 128;
    keyInput.setAttribute("aria-label", "Environment variable key");
    keyTd.appendChild(keyInput);

    const valueTd = document.createElement("td");
    const valueInput = document.createElement("input");
    valueInput.type = "text";
    valueInput.className = "input is-family-monospace";
    valueInput.placeholder = "https://example.com";
    valueInput.value = env?.value ?? "";
    valueInput.setAttribute("aria-label", "Environment variable value");
    valueTd.appendChild(valueInput);

    const scopeTd = document.createElement("td");
    const selectWrap = document.createElement("div");
    selectWrap.className = "select is-fullwidth";
    const scopeSelect = document.createElement("select");
    scopeSelect.setAttribute("aria-label", "Environment variable scope");

    const publicOption = document.createElement("option");
    publicOption.value = "public";
    publicOption.textContent = "Public (build)";

    const privateOption = document.createElement("option");
    privateOption.value = "private";
    privateOption.textContent = "Private (runtime)";

    scopeSelect.append(publicOption, privateOption);
    scopeSelect.value = env?.isPublic ? "public" : "private";
    selectWrap.appendChild(scopeSelect);
    scopeTd.appendChild(selectWrap);

    const actionsTd = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "button is-small is-danger is-light";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => {
      void removeEnvRow(row);
    });
    actionsTd.appendChild(deleteButton);

    row.append(keyTd, valueTd, scopeTd, actionsTd);
    return row;
  };

  const loadEnvRows = async (force = false) => {
    if (!envRowsEl) return;
    if (envLoaded && !force) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/env`);
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to load environment variables"));
      }

      const rows = (await response.json()) as ProjectEnv[];
      getEnvRows().forEach((row) => row.remove());

      for (const env of rows) {
        envRowsEl.appendChild(buildEnvRow(env));
      }

      envLoaded = true;
      updateEnvEmptyState();
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : "Failed to load environment variables",
        "is-danger"
      );
    }
  };

  if (tabOverviewBtn) {
    tabOverviewBtn.addEventListener("click", () => {
      setTab("overview");
    });
  }

  if (tabEnvBtn) {
    tabEnvBtn.addEventListener("click", () => {
      setTab("env");
      void loadEnvRows();
    });
  }

  if (envAddBtn && envRowsEl) {
    envAddBtn.addEventListener("click", async () => {
      if (!envLoaded) {
        await loadEnvRows();
      }
      envRowsEl.appendChild(buildEnvRow());
      updateEnvEmptyState();
    });
  }

  if (envSaveBtn) {
    envSaveBtn.addEventListener("click", async () => {
      const rows = getEnvRows();
      const payloads: Array<{ id?: string; key: string; value: string; isPublic: boolean }> = [];
      const seenKeys = new Set<string>();

      for (const row of rows) {
        const keyInput = row.querySelector<HTMLInputElement>("td:nth-child(1) input");
        const valueInput = row.querySelector<HTMLInputElement>("td:nth-child(2) input");
        const scopeSelect = row.querySelector<HTMLSelectElement>("td:nth-child(3) select");

        const key = keyInput?.value.trim() ?? "";
        const value = valueInput?.value ?? "";
        const isPublic = (scopeSelect?.value ?? "private") === "public";

        if (!key && !value) continue;

        if (!key) {
          showNotification("Environment variable key is required", "is-warning");
          keyInput?.focus();
          return;
        }
        if (!ENV_KEY_REGEX.test(key)) {
          showNotification(`Invalid env key: ${key}`, "is-warning");
          keyInput?.focus();
          return;
        }
        if (seenKeys.has(key)) {
          showNotification(`Duplicate env key: ${key}`, "is-warning");
          keyInput?.focus();
          return;
        }

        seenKeys.add(key);
        payloads.push({
          ...(row.dataset.envId ? { id: row.dataset.envId } : {}),
          key,
          value,
          isPublic
        });
      }

      envSaveBtn.classList.add("is-loading");

      try {
        for (const payload of payloads) {
          const response = await fetch(`/api/projects/${projectId}/env`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            throw new Error(await parseApiError(response, "Failed to save environment variables"));
          }
        }

        await loadEnvRows(true);
        showNotification("Environment variables saved", "is-success");
      } catch (error) {
        showNotification(
          error instanceof Error ? error.message : "Failed to save environment variables",
          "is-danger"
        );
      } finally {
        envSaveBtn.classList.remove("is-loading");
      }
    });
  }

  setTab("overview");
  updateEnvEmptyState();

  if (deployEnvUpload && deployEnvText) {
    deployEnvUpload.addEventListener("change", async () => {
      const file = deployEnvUpload.files?.[0];
      if (!file) return;

      if (file.size > MAX_ENV_FILE_SIZE_BYTES) {
        showNotification(
          `.env file is too large (${file.size} bytes). Max is ${MAX_ENV_FILE_SIZE_BYTES} bytes.`,
          "is-warning"
        );
        deployEnvUpload.value = "";
        return;
      }

      try {
        const text = await file.text();
        deployEnvText.value = text;
      } catch {
        showNotification("Failed to read selected .env file", "is-danger");
      } finally {
        deployEnvUpload.value = "";
      }
    });
  }

  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = getEl<HTMLInputElement>("edit-name");
      const repoInput = getEl<HTMLInputElement>("edit-repo-url");
      const branchInput = getEl<HTMLInputElement>("edit-branch");
      const name = nameInput?.value.trim() ?? "";
      const repoUrl = repoInput?.value.trim() ?? "";
      const branch = branchInput?.value.trim() ?? "";
      if (!name && !repoUrl && !branch) {
        showNotification("Please provide at least one field to update", "is-warning");
        return;
      }
      const body: { name?: string; repoUrl?: string; branch?: string } = {};
      if (name) body.name = name;
      if (repoUrl) body.repoUrl = repoUrl;
      if (branch) body.branch = branch;
      try {
        const response = await fetch("/projects/" + projectId, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, "Failed to update project"));
        }
        showNotification("Project updated!", "is-success");
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showNotification(err instanceof Error ? err.message : "Failed to update project", "is-danger");
      }
    });
  }

  if (deployBtn) {
    deployBtn.addEventListener("click", async () => {
      deployBtn.classList.add("is-loading");
      try {
        const envFile = deployEnvText?.value ?? "";
        if (envFile && new Blob([envFile]).size > MAX_ENV_FILE_SIZE_BYTES) {
          showNotification(
            `.env file is too large. Max is ${MAX_ENV_FILE_SIZE_BYTES} bytes.`,
            "is-warning"
          );
          return;
        }

        const payload: { envFile?: string } = {};
        if (envFile.trim()) {
          payload.envFile = envFile;
        }

        const response = await fetch("/projects/" + projectId + "/deployments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to create deployment");
        }

        showNotification("Deployment started!", "is-success");
        setTimeout(() => {
          window.location.href = "/deployments/" + (data.id ?? "");
        }, 500);
      } catch (err) {
        showNotification(
          err instanceof Error ? err.message : "Failed to create deployment",
          "is-danger"
        );
      } finally {
        deployBtn.classList.remove("is-loading");
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (
        !confirm("Are you sure you want to delete this project? This action cannot be undone.")
      ) {
        return;
      }
      deleteBtn.classList.add("is-loading");
      try {
        const response = await fetch("/projects/" + projectId, { method: "DELETE" });
        if (!response.ok) {
          throw new Error(await parseApiError(response, "Failed to delete project"));
        }
        showNotification("Project deleted", "is-success");
        setTimeout(() => {
          window.location.href = "/projects";
        }, 500);
      } catch (err) {
        showNotification(
          err instanceof Error ? err.message : "Failed to delete project",
          "is-danger"
        );
      } finally {
        deleteBtn.classList.remove("is-loading");
      }
    });
  }
});
