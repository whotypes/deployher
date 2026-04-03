/**
 * Browser-only script for the Project settings page. Uses DOM APIs.
 * Do not import in React or server code — loaded via <script src="/assets/project-settings-page.js" type="module">.
 */

import { parseEnvFileContent, looksLikeEnvPaste } from "../../lib/parseEnvFileContent";
import { fetchWithCsrf } from "./fetchWithCsrf";

const getEl = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const MAX_ENV_FILE_SIZE_BYTES = 64 * 1024;
const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BUILD_KEY_PREFIXES = ["NEXT_PUBLIC_", "PD_PUBLIC_"] as const;

type ProjectEnv = {
  id: string;
  key: string;
  value: string;
  isPublic: boolean;
};

type EnvRowSeed = {
  id?: string;
  key: string;
  value: string;
  isPublic?: boolean;
};

type RowSnap = { i: string; k: string; v: string; m: string };

type ApiError = { error?: string };

const parseApiError = async (response: Response, fallback: string): Promise<string> => {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  return body.error ?? fallback;
};

const inferPublicFromKey = (key: string): boolean => {
  const k = key.trim();
  return BUILD_KEY_PREFIXES.some((p) => k.startsWith(p));
};

const svgCopyIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="block pointer-events-none" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 0 2 2v1"/></svg>`;
const svgCheckIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="block pointer-events-none" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;
const svgTrashIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="block pointer-events-none" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></svg>`;

const rowIconBtnClass =
  "env-row-icon-btn inline-flex size-7 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const rowDestructiveIconBtnClass = `${rowIconBtnClass} hover:bg-destructive/15 hover:text-destructive`;

document.addEventListener("DOMContentLoaded", () => {
  const notification = getEl<HTMLElement>("notification");
  const projectIdEl = getEl<HTMLInputElement>("project-id");

  if (!notification) return;

  const projectId = projectIdEl?.value ?? "";

  const showNotification = (message: string, type: string): void => {
    notification.textContent = message;
    notification.className = "notification is-toast " + type;
    notification.style.display = "block";
    setTimeout(() => {
      notification.style.display = "none";
    }, 3000);
  };

  const editForm = getEl<HTMLFormElement>("edit-project-form");

  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = getEl<HTMLInputElement>("edit-name");
      const repoInput = getEl<HTMLInputElement>("edit-repo-url");
      const branchInput = getEl<HTMLInputElement>("edit-branch");
      const workspaceRootDirInput = getEl<HTMLInputElement>("edit-workspace-root-dir");
      const projectRootDirInput = getEl<HTMLInputElement>("edit-project-root-dir");
      const frameworkHintInput = getEl<HTMLSelectElement>("edit-framework-hint");
      const previewModeInput = getEl<HTMLSelectElement>("edit-preview-mode");
      const serverPreviewTargetInput = getEl<HTMLSelectElement>("edit-server-preview-target");
      const runtimeImageModeInput = getEl<HTMLSelectElement>("edit-runtime-image-mode");
      const dockerfilePathInput = getEl<HTMLInputElement>("edit-dockerfile-path");
      const dockerBuildTargetInput = getEl<HTMLInputElement>("edit-docker-build-target");
      const runtimeContainerPortInput = getEl<HTMLInputElement>("edit-runtime-container-port");
      const skipHostStrategyBuildInput = getEl<HTMLSelectElement>("edit-skip-host-strategy-build");
      const installCommandInput = getEl<HTMLTextAreaElement>("edit-install-command");
      const buildCommandInput = getEl<HTMLTextAreaElement>("edit-build-command");
      const name = nameInput?.value.trim() ?? "";
      const repoUrl = repoInput?.value.trim() ?? "";
      const branch = branchInput?.value.trim() ?? "";
      const workspaceRootDir = workspaceRootDirInput?.value.trim() ?? "";
      const projectRootDir = projectRootDirInput?.value.trim() ?? "";
      const frameworkHint = frameworkHintInput?.value ?? "";
      const previewMode = previewModeInput?.value ?? "";
      const serverPreviewTarget = serverPreviewTargetInput?.value ?? "";
      const runtimeImageMode = runtimeImageModeInput?.value ?? "";
      const dockerfilePath = dockerfilePathInput?.value.trim() ?? "";
      const dockerBuildTarget = dockerBuildTargetInput?.value.trim() ?? "";
      const runtimeContainerPortRaw = runtimeContainerPortInput?.value.trim() ?? "";
      const skipHostStrategyBuild = skipHostStrategyBuildInput?.value === "skip";
      const body: {
        name?: string;
        repoUrl?: string;
        branch?: string;
        workspaceRootDir?: string;
        projectRootDir?: string;
        frameworkHint?: string;
        previewMode?: string;
        serverPreviewTarget?: string;
        runtimeImageMode?: string;
        dockerfilePath?: string | null;
        dockerBuildTarget?: string | null;
        runtimeContainerPort?: number;
        skipHostStrategyBuild?: boolean;
        installCommand?: string;
        buildCommand?: string;
      } = {};
      if (name) body.name = name;
      if (repoUrl) body.repoUrl = repoUrl;
      if (branch) body.branch = branch;
      if (workspaceRootDir) body.workspaceRootDir = workspaceRootDir;
      if (projectRootDir) body.projectRootDir = projectRootDir;
      if (frameworkHint) body.frameworkHint = frameworkHint;
      if (previewMode) body.previewMode = previewMode;
      if (serverPreviewTarget) body.serverPreviewTarget = serverPreviewTarget;
      if (runtimeImageMode) body.runtimeImageMode = runtimeImageMode;
      body.dockerfilePath = dockerfilePath || null;
      body.dockerBuildTarget = dockerBuildTarget || null;
      body.skipHostStrategyBuild = skipHostStrategyBuild;
      if (runtimeContainerPortRaw) {
        body.runtimeContainerPort = Number.parseInt(runtimeContainerPortRaw, 10);
      }
      if (installCommandInput) body.installCommand = installCommandInput.value.trim();
      if (buildCommandInput) body.buildCommand = buildCommandInput.value.trim();
      if (Object.keys(body).length === 0) {
        showNotification("No changes to save", "is-warning");
        return;
      }
      try {
        const response = await fetchWithCsrf("/projects/" + projectId, {
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

  const envRowsEl = getEl<HTMLTableSectionElement>("project-env-rows");
  const envEmptyRow = getEl<HTMLTableRowElement>("project-env-empty");
  const envFilterEmptyRow = getEl<HTMLTableRowElement>("project-env-filter-empty");
  const envMergePasteBtn = getEl<HTMLButtonElement>("project-env-merge-paste");
  const envDropZone = getEl<HTMLElement>("project-env-drop-zone");
  const envSaveBtn = getEl<HTMLButtonElement>("project-env-save");
  const envDiscardBtn = getEl<HTMLButtonElement>("project-env-discard");
  const envSaveBar = getEl<HTMLElement>("project-env-save-bar");
  const envDirtyLabel = getEl<HTMLElement>("project-env-dirty-label");
  const mainEl = getEl<HTMLElement>("pdploy-main");
  const envShowValues = getEl<HTMLInputElement>("project-env-show-values");
  const envRevealToggle = getEl<HTMLButtonElement>("project-env-reveal-toggle");
  const envCopyAllBtn = getEl<HTMLButtonElement>("project-env-copy-all");
  const envRowActions = getEl<HTMLElement>("project-env-row-actions");
  const envCountEl = getEl<HTMLElement>("project-env-count");
  const envPasteArea = getEl<HTMLTextAreaElement>("project-env-paste");
  const envFileUpload = getEl<HTMLInputElement>("project-env-file-upload");
  const envSearch = getEl<HTMLInputElement>("project-env-search");

  let envLoaded = false;
  let baselineSerialized = "";

  const valuesRevealed = (): boolean => envShowValues?.checked === true;

  const setSaveBarVisible = (visible: boolean): void => {
    if (!envSaveBar) return;
    if (visible) {
      envSaveBar.classList.remove("hidden");
      mainEl?.classList.add("env-save-bar-pad");
    } else {
      envSaveBar.classList.add("hidden");
      mainEl?.classList.remove("env-save-bar-pad");
    }
  };

  const getEnvRows = (): HTMLTableRowElement[] => {
    if (!envRowsEl) return [];
    return Array.from(envRowsEl.querySelectorAll<HTMLTableRowElement>('tr[data-env-row="1"]'));
  };

  const serializeRows = (): string => {
    const rows = getEnvRows();
    const data: RowSnap[] = rows.map((row, idx) => ({
      i: row.dataset.envId ?? `n${idx}`,
      k: row.querySelector<HTMLInputElement>('[data-env-field="key"]')?.value ?? "",
      v: row.querySelector<HTMLInputElement>('[data-env-field="value"]')?.value ?? "",
      m: row.dataset.scopeManual ?? ""
    }));
    return JSON.stringify(data);
  };

  const captureBaseline = (): void => {
    baselineSerialized = serializeRows();
    refreshDirtyState();
  };

  const refreshDirtyState = (): void => {
    if (!envRowsEl || !envLoaded) {
      setSaveBarVisible(false);
      return;
    }
    const dirty = serializeRows() !== baselineSerialized;
    setSaveBarVisible(dirty);
    if (envDirtyLabel) {
      envDirtyLabel.textContent = dirty
        ? "You have unsaved changes—save before you leave this page."
        : "";
    }
  };

  const scheduleDirtyCheck = (): void => {
    refreshDirtyState();
  };

  const syncRevealButton = (): void => {
    if (!envShowValues || !envRevealToggle) return;
    const on = envShowValues.checked;
    envRevealToggle.setAttribute("aria-pressed", on ? "true" : "false");
    envRevealToggle.querySelector(".env-reveal-icon-show")?.classList.toggle("hidden", on);
    envRevealToggle.querySelector(".env-reveal-icon-hide")?.classList.toggle("hidden", !on);
    envRevealToggle.querySelector(".env-reveal-label-show")?.classList.toggle("hidden", on);
    envRevealToggle.querySelector(".env-reveal-label-hide")?.classList.toggle("hidden", !on);
  };

  const resetCopyAllButton = (): void => {
    if (!envCopyAllBtn) return;
    envCopyAllBtn.querySelector(".env-copy-icon-default")?.classList.remove("hidden");
    envCopyAllBtn.querySelector(".env-copy-icon-done")?.classList.add("hidden");
    envCopyAllBtn.querySelector(".env-copy-label")?.classList.remove("hidden");
    envCopyAllBtn.querySelector(".env-copy-label-done")?.classList.add("hidden");
  };

  const flashCopyAllButton = (): void => {
    if (!envCopyAllBtn) return;
    envCopyAllBtn.querySelector(".env-copy-icon-default")?.classList.add("hidden");
    envCopyAllBtn.querySelector(".env-copy-icon-done")?.classList.remove("hidden");
    envCopyAllBtn.querySelector(".env-copy-label")?.classList.add("hidden");
    envCopyAllBtn.querySelector(".env-copy-label-done")?.classList.remove("hidden");
    setTimeout(() => resetCopyAllButton(), 1500);
  };

  const updateEnvSummary = (): void => {
    const n = getEnvRows().length;
    if (envCountEl) {
      envCountEl.textContent = n === 0 ? "No variables yet" : `${n} variable${n === 1 ? "" : "s"}`;
    }
    envRowActions?.classList.toggle("hidden", n === 0);
  };

  const updateValueTitle = (row: HTMLTableRowElement): void => {
    const valueInput = row.querySelector<HTMLInputElement>('[data-env-field="value"]');
    if (!valueInput) return;
    const v = valueInput.value;
    valueInput.title = v.length > 0 ? v : "";
  };

  const getEffectivePublic = (row: HTMLTableRowElement): boolean => {
    const key =
      row.querySelector<HTMLInputElement>('[data-env-field="key"]')?.value.trim() ?? "";
    const manual = row.dataset.scopeManual;
    if (manual === "1") return true;
    if (manual === "0") return false;
    return inferPublicFromKey(key);
  };

  const syncScopeBadge = (row: HTMLTableRowElement): void => {
    const btn = row.querySelector<HTMLButtonElement>("[data-env-scope-badge]");
    if (!btn) return;
    const isPublic = getEffectivePublic(row);
    const auto = !row.dataset.scopeManual;
    btn.textContent = isPublic ? "Build" : "Runtime";
    btn.setAttribute("aria-pressed", isPublic ? "true" : "false");
    btn.setAttribute(
      "aria-label",
      isPublic
        ? "Scope: included in build. Click to mark runtime-only."
        : "Scope: runtime-only. Click to include in build."
    );
    btn.title = auto
      ? isPublic
        ? "Default: public prefix. Click to force runtime-only."
        : "Default: no public prefix. Click to force build."
      : isPublic
        ? "Manually set to build. Click to use runtime-only."
        : "Manually set to runtime. Click to use build.";
    btn.className = isPublic
      ? "inline-flex h-7 max-w-full items-center justify-center rounded-md border-0 bg-primary/15 px-2 text-[0.65rem] font-semibold uppercase tracking-wide text-primary outline-none hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
      : "inline-flex h-7 max-w-full items-center justify-center rounded-md border-0 bg-muted/50 px-2 text-[0.65rem] font-semibold uppercase tracking-wide text-muted-foreground outline-none hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring cursor-pointer";
  };

  const applyValueInputVisibility = (): void => {
    if (!envRowsEl) return;
    const t = valuesRevealed() ? "text" : "password";
    envRowsEl.querySelectorAll<HTMLInputElement>('[data-env-field="value"]').forEach((input) => {
      input.type = t;
      input.setAttribute("autocomplete", "off");
    });
  };

  const updateEnvEmptyState = (): void => {
    if (!envEmptyRow) return;
    const hasRows = getEnvRows().length > 0;
    envEmptyRow.style.display = hasRows ? "none" : "";
    if (envFilterEmptyRow && !hasRows) {
      envFilterEmptyRow.classList.add("hidden");
    }
    updateEnvSummary();
  };

  const updateSearchFilter = (): void => {
    if (!envRowsEl) return;
    const q = (envSearch?.value ?? "").trim().toLowerCase();
    const rows = getEnvRows();
    let visible = 0;
    for (const row of rows) {
      const key =
        row.querySelector<HTMLInputElement>('[data-env-field="key"]')?.value.trim().toLowerCase() ?? "";
      const show = !q || key.includes(q);
      row.style.display = show ? "" : "none";
      if (show) visible += 1;
    }
    if (envFilterEmptyRow) {
      const showFilterEmpty = Boolean(q) && rows.length > 0 && visible === 0;
      if (showFilterEmpty) {
        envFilterEmptyRow.classList.remove("hidden");
        envFilterEmptyRow.style.display = "";
      } else {
        envFilterEmptyRow.classList.add("hidden");
        envFilterEmptyRow.style.display = "none";
      }
    }
  };

  const removeEnvRow = async (row: HTMLTableRowElement): Promise<void> => {
    const envId = row.dataset.envId ?? "";

    if (!envId) {
      row.remove();
      updateEnvEmptyState();
      updateSearchFilter();
      scheduleDirtyCheck();
      return;
    }

    try {
      const response = await fetchWithCsrf(`/api/projects/${projectId}/env/${envId}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to delete environment variable"));
      }

      row.remove();
      updateEnvEmptyState();
      updateSearchFilter();
      showNotification("Environment variable deleted", "is-success");
      captureBaseline();
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : "Failed to delete environment variable",
        "is-danger"
      );
    }
  };

  const buildEnvRow = (env?: EnvRowSeed | ProjectEnv): HTMLTableRowElement => {
    const row = document.createElement("tr");
    row.className =
      "group border-b border-border/40 transition-colors hover:bg-muted/35 focus-within:bg-muted/25";
    row.dataset.envRow = "1";
    if (env && "id" in env && env.id) row.dataset.envId = env.id;

    const inferred = inferPublicFromKey(env?.key ?? "");
    const storedPublic = env?.isPublic ?? false;
    if (env && "id" in env && env.id) {
      if (storedPublic === inferred) delete row.dataset.scopeManual;
      else row.dataset.scopeManual = storedPublic ? "1" : "0";
    } else {
      delete row.dataset.scopeManual;
    }

    const keyTd = document.createElement("td");
    keyTd.className = "h-12 border-r border-border/50 align-middle px-4 py-0";
    const keyInput = document.createElement("input");
    keyInput.type = "text";
    keyInput.dataset.envField = "key";
    keyInput.className =
      "env-cell-input h-12 w-full min-w-0 border-0 bg-transparent py-3 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/55 shadow-none focus:outline-none focus:ring-0 rounded-none";
    keyInput.placeholder = "API_BASE_URL";
    keyInput.value = env?.key ?? "";
    keyInput.maxLength = 128;
    keyInput.setAttribute("aria-label", "Environment variable key");
    keyInput.addEventListener("input", () => {
      row.dataset.scopeManual = "";
      syncScopeBadge(row);
      updateValueTitle(row);
      scheduleDirtyCheck();
      updateSearchFilter();
    });
    keyTd.appendChild(keyInput);

    const valueTd = document.createElement("td");
    valueTd.className = "min-w-0 max-w-[min(22rem,48vw)] h-12 align-middle px-4 py-0";
    const valueInput = document.createElement("input");
    valueInput.type = valuesRevealed() ? "text" : "password";
    valueInput.dataset.envField = "value";
    valueInput.className =
      "env-cell-input h-12 w-full min-w-0 border-0 bg-transparent py-3 text-[13px] font-mono text-foreground placeholder:text-muted-foreground/55 shadow-none focus:outline-none focus:ring-0 rounded-none truncate";
    valueInput.placeholder = "value";
    valueInput.value = env?.value ?? "";
    valueInput.setAttribute("autocomplete", "off");
    valueInput.setAttribute("aria-label", "Environment variable value");
    valueInput.addEventListener("input", () => {
      updateValueTitle(row);
      scheduleDirtyCheck();
    });
    valueTd.appendChild(valueInput);

    const scopeTd = document.createElement("td");
    scopeTd.className = "h-12 whitespace-nowrap align-middle px-4 py-0";
    const scopeBtn = document.createElement("button");
    scopeBtn.type = "button";
    scopeBtn.dataset.envScopeBadge = "1";
    scopeBtn.addEventListener("click", () => {
      const next = !getEffectivePublic(row);
      row.dataset.scopeManual = next ? "1" : "0";
      syncScopeBadge(row);
      scheduleDirtyCheck();
    });
    scopeTd.appendChild(scopeBtn);

    const actionsTd = document.createElement("td");
    actionsTd.className = "h-12 align-middle px-2 py-0 text-right";
    const actionsWrap = document.createElement("div");
    actionsWrap.className =
      "flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100";

    const copyValueBtn = document.createElement("button");
    copyValueBtn.type = "button";
    copyValueBtn.className = rowIconBtnClass;
    copyValueBtn.title = "Copy value";
    copyValueBtn.setAttribute("aria-label", "Copy value");
    copyValueBtn.innerHTML = svgCopyIcon;
    copyValueBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = row.querySelector<HTMLInputElement>('[data-env-field="value"]')?.value ?? "";
      if (!v) return;
      try {
        await navigator.clipboard.writeText(v);
      } catch {
        return;
      }
      copyValueBtn.innerHTML = svgCheckIcon;
      copyValueBtn.classList.add("text-primary");
      setTimeout(() => {
        copyValueBtn.innerHTML = svgCopyIcon;
        copyValueBtn.classList.remove("text-primary");
      }, 1500);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = rowDestructiveIconBtnClass;
    deleteButton.title = "Remove";
    deleteButton.setAttribute("aria-label", "Remove variable");
    deleteButton.innerHTML = svgTrashIcon;
    deleteButton.addEventListener("click", () => {
      void removeEnvRow(row);
    });

    actionsWrap.append(copyValueBtn, deleteButton);
    actionsTd.appendChild(actionsWrap);

    row.append(keyTd, valueTd, scopeTd, actionsTd);
    syncScopeBadge(row);
    updateValueTitle(row);
    return row;
  };

  const mergeParsedIntoTable = (parsed: Record<string, string>): number => {
    if (!envRowsEl) return 0;
    let applied = 0;
    const rows = getEnvRows();
    const keyToRow = new Map<string, HTMLTableRowElement>();
    for (const row of rows) {
      const keyInput = row.querySelector<HTMLInputElement>('[data-env-field="key"]');
      const k = keyInput?.value.trim() ?? "";
      if (k) keyToRow.set(k, row);
    }

    for (const [key, value] of Object.entries(parsed)) {
      if (!ENV_KEY_REGEX.test(key)) continue;
      const existing = keyToRow.get(key);
      if (existing) {
        const valueInput = existing.querySelector<HTMLInputElement>('[data-env-field="value"]');
        if (valueInput) valueInput.value = value;
        updateValueTitle(existing);
        syncScopeBadge(existing);
      } else {
        const row = buildEnvRow({ key, value });
        envRowsEl.appendChild(row);
        keyToRow.set(key, row);
      }
      applied += 1;
    }

    applyValueInputVisibility();
    updateEnvEmptyState();
    updateSearchFilter();
    scheduleDirtyCheck();
    return applied;
  };

  const loadEnvRows = async (force = false): Promise<void> => {
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
      applyValueInputVisibility();
      updateEnvEmptyState();
      updateSearchFilter();
      captureBaseline();
    } catch (error) {
      showNotification(
        error instanceof Error ? error.message : "Failed to load environment variables",
        "is-danger"
      );
    }
  };

  envRevealToggle?.addEventListener("click", () => {
    if (!envShowValues) return;
    envShowValues.checked = !envShowValues.checked;
    envShowValues.dispatchEvent(new Event("change"));
  });

  envShowValues?.addEventListener("change", () => {
    syncRevealButton();
    applyValueInputVisibility();
  });

  envCopyAllBtn?.addEventListener("click", async () => {
    const rows = getEnvRows();
    const lines: string[] = [];
    for (const row of rows) {
      const k = row.querySelector<HTMLInputElement>('[data-env-field="key"]')?.value.trim() ?? "";
      const v = row.querySelector<HTMLInputElement>('[data-env-field="value"]')?.value ?? "";
      if (k) lines.push(`${k}=${v}`);
    }
    if (lines.length === 0) return;
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      flashCopyAllButton();
    } catch {
      showNotification("Could not copy to clipboard", "is-warning");
    }
  });

  envMergePasteBtn?.addEventListener("click", () => {
    const text = envPasteArea?.value ?? "";
    const parsed = parseEnvFileContent(text);
    const n = mergeParsedIntoTable(parsed);
    if (envPasteArea) envPasteArea.value = "";
    showNotification(
      n > 0 ? `Merged ${n} variable(s)` : "No valid variables in paste",
      n > 0 ? "is-success" : "is-warning"
    );
  });

  let envDropDepth = 0;
  envDropZone?.addEventListener("dragenter", (e) => {
    e.preventDefault();
    envDropDepth += 1;
    envDropZone.classList.add("border-border/60", "bg-muted/25");
  });
  envDropZone?.addEventListener("dragleave", () => {
    envDropDepth = Math.max(0, envDropDepth - 1);
    if (envDropDepth === 0) {
      envDropZone.classList.remove("border-border/60", "bg-muted/25");
    }
  });
  envDropZone?.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  envDropZone?.addEventListener("drop", async (e) => {
    e.preventDefault();
    envDropDepth = 0;
    envDropZone.classList.remove("border-border/60", "bg-muted/25");
    const dt = e.dataTransfer;
    if (!dt) return;
    const file = dt.files?.[0];
    if (file) {
      if (file.size > MAX_ENV_FILE_SIZE_BYTES) {
        showNotification(
          `.env file is too large (${file.size} bytes). Max is ${MAX_ENV_FILE_SIZE_BYTES} bytes.`,
          "is-warning"
        );
        return;
      }
      try {
        const text = await file.text();
        const parsed = parseEnvFileContent(text);
        const n = mergeParsedIntoTable(parsed);
        showNotification(
          n > 0 ? `Merged ${n} variable(s) from file` : "No valid variables in file",
          n > 0 ? "is-success" : "is-warning"
        );
      } catch {
        showNotification("Failed to read dropped file", "is-danger");
      }
      return;
    }
    const text = dt.getData("text/plain").trim();
    if (!text) return;
    const parsed = parseEnvFileContent(text);
    const n = mergeParsedIntoTable(parsed);
    showNotification(
      n > 0 ? `Merged ${n} variable(s) from drop` : "No valid variables in drop",
      n > 0 ? "is-success" : "is-warning"
    );
  });

  envSearch?.addEventListener("input", () => {
    updateSearchFilter();
  });

  envPasteArea?.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!looksLikeEnvPaste(text)) return;
    e.preventDefault();
    const parsed = parseEnvFileContent(text);
    const n = mergeParsedIntoTable(parsed);
    envPasteArea.value = "";
    showNotification(
      n > 0 ? `Merged ${n} variable(s) from clipboard` : "No valid variables in paste",
      n > 0 ? "is-success" : "is-warning"
    );
  });

  envRowsEl?.addEventListener("paste", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const row = t.closest("tr");
    if (!row || row.dataset.envRow !== "1") return;
    const text = e.clipboardData?.getData("text/plain") ?? "";
    if (!looksLikeEnvPaste(text)) return;
    e.preventDefault();
    const parsed = parseEnvFileContent(text);
    const n = mergeParsedIntoTable(parsed);
    showNotification(
      n > 0 ? `Merged ${n} variable(s) from clipboard` : "No valid variables in paste",
      n > 0 ? "is-success" : "is-warning"
    );
  });

  if (envFileUpload) {
    envFileUpload.addEventListener("change", async () => {
      const file = envFileUpload.files?.[0];
      if (!file) return;

      if (file.size > MAX_ENV_FILE_SIZE_BYTES) {
        showNotification(
          `.env file is too large (${file.size} bytes). Max is ${MAX_ENV_FILE_SIZE_BYTES} bytes.`,
          "is-warning"
        );
        envFileUpload.value = "";
        return;
      }

      try {
        const text = await file.text();
        const parsed = parseEnvFileContent(text);
        const n = mergeParsedIntoTable(parsed);
        showNotification(
          n > 0 ? `Merged ${n} variable(s) from file` : "No valid variables in file",
          n > 0 ? "is-success" : "is-warning"
        );
      } catch {
        showNotification("Failed to read selected .env file", "is-danger");
      } finally {
        envFileUpload.value = "";
      }
    });
  }

  if (envRowsEl) {
    syncRevealButton();
    updateEnvSummary();
    void loadEnvRows();

    window.addEventListener("beforeunload", (e) => {
      if (!envLoaded || serializeRows() === baselineSerialized) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  if (envRowsEl) {
    document.querySelectorAll(".js-project-env-add").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!envLoaded) await loadEnvRows();
        envRowsEl.appendChild(buildEnvRow());
        updateEnvEmptyState();
        updateSearchFilter();
        scheduleDirtyCheck();
      });
    });
  }

  envDiscardBtn?.addEventListener("click", () => {
    if (serializeRows() === baselineSerialized) return;
    if (!window.confirm("Discard all unsaved changes to environment variables?")) return;
    void loadEnvRows(true);
  });

  if (envSaveBtn) {
    envSaveBtn.addEventListener("click", async () => {
      const rows = getEnvRows();
      const payloads: Array<{ id?: string; key: string; value: string; isPublic: boolean }> = [];
      const seenKeys = new Set<string>();

      for (const row of rows) {
        const keyInput = row.querySelector<HTMLInputElement>('[data-env-field="key"]');
        const valueInput = row.querySelector<HTMLInputElement>('[data-env-field="value"]');

        const key = keyInput?.value.trim() ?? "";
        const value = valueInput?.value ?? "";
        const isPublic = getEffectivePublic(row);

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
      if (envDiscardBtn) envDiscardBtn.disabled = true;

      try {
        for (const payload of payloads) {
          const response = await fetchWithCsrf(`/api/projects/${projectId}/env`, {
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
        if (envDiscardBtn) envDiscardBtn.disabled = false;
      }
    });
  }

  const deleteBtn = getEl<HTMLButtonElement>("delete-btn");

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this project? This action cannot be undone.")) return;
      deleteBtn.classList.add("is-loading");
      try {
        const response = await fetchWithCsrf("/projects/" + projectId, { method: "DELETE" });
        if (!response.ok) {
          throw new Error(await parseApiError(response, "Failed to delete project"));
        }
        showNotification("Project deleted", "is-success");
        setTimeout(() => {
          window.location.href = "/projects";
        }, 500);
      } catch (err) {
        showNotification(err instanceof Error ? err.message : "Failed to delete project", "is-danger");
      } finally {
        deleteBtn.classList.remove("is-loading");
      }
    });
  }
});
