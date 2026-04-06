import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { parseGitHubRepoUrl } from "@/github";
import { parseEnvFileContent, looksLikeEnvPaste } from "@/lib/parseEnvFileContent";
import { cn } from "@/lib/utils";
import type { ProjectSettingsData } from "../ProjectSettingsPage";
import { fetchWithCsrf } from "./fetchWithCsrf";
import { PAGE_TOAST_HIDDEN_CLASS, showPageToast } from "./pageNotifications";
import { LazyRepoCodeExplorer } from "./repo-code-explorer-lazy";

type Project = ProjectSettingsData["project"];

const MAX_ENV_FILE_BYTES = 64 * 1024;
const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const BUILD_KEY_PREFIXES = ["NEXT_PUBLIC_", "PD_PUBLIC_"] as const;

type ApiError = { error?: string };

const parseApiError = async (response: Response, fallback: string): Promise<string> => {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  return body.error ?? fallback;
};

const inferPublicFromKey = (key: string): boolean => {
  const k = key.trim();
  return BUILD_KEY_PREFIXES.some((p) => k.startsWith(p));
};

const envPillBtn =
  "inline-flex items-center gap-1.5 rounded-[7px] border border-border bg-card px-3 py-1.5 text-[13px] font-medium tracking-tight text-foreground transition-colors hover:bg-muted/50";
const envPillBtnPrimary =
  "inline-flex items-center gap-1.5 rounded-[7px] border border-primary bg-primary px-3 py-1.5 text-[13px] font-medium tracking-tight text-primary-foreground transition-colors hover:bg-primary/90";

type EnvRowModel = {
  rowId: string;
  serverId?: string;
  key: string;
  value: string;
  manualScope: null | "build" | "runtime";
};

type ProjectEnv = {
  id: string;
  key: string;
  value: string;
  isPublic: boolean;
};

const serializeEnvRows = (rows: EnvRowModel[]): string =>
  JSON.stringify(
    rows.map((r) => ({
      i: r.serverId ?? `n:${r.rowId}`,
      k: r.key,
      v: r.value,
      m: r.manualScope ?? ""
    }))
  );

const effectivePublic = (row: EnvRowModel): boolean => {
  if (row.manualScope === "build") return true;
  if (row.manualScope === "runtime") return false;
  return inferPublicFromKey(row.key);
};

const mapApiToRows = (list: ProjectEnv[]): EnvRowModel[] =>
  list.map((env) => {
    const inferred = inferPublicFromKey(env.key);
    let manualScope: null | "build" | "runtime" = null;
    if (env.isPublic !== inferred) {
      manualScope = env.isPublic ? "build" : "runtime";
    }
    return {
      rowId: env.id,
      serverId: env.id,
      key: env.key,
      value: env.value,
      manualScope
    };
  });

const GeneralSection = ({
  project,
  projectId,
  onToast
}: {
  project: Project;
  projectId: string;
  onToast: (message: string, variant: "success" | "error" | "warning") => void;
}): React.ReactElement => {
  const { t } = useTranslation();
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const get = (id: string): string => {
      const el = document.getElementById(id);
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
        return el.value.trim();
      }
      return "";
    };
    const name = get("edit-name");
    const repoUrl = get("edit-repo-url");
    const branch = get("edit-branch");
    const workspaceRootDir = get("edit-workspace-root-dir");
    const projectRootDir = get("edit-project-root-dir");
    const frameworkHint = (document.getElementById("edit-framework-hint") as HTMLSelectElement | null)?.value ?? "";
    const previewMode = (document.getElementById("edit-preview-mode") as HTMLSelectElement | null)?.value ?? "";
    const serverPreviewTarget =
      (document.getElementById("edit-server-preview-target") as HTMLSelectElement | null)?.value ?? "";
    const runtimeImageMode =
      (document.getElementById("edit-runtime-image-mode") as HTMLSelectElement | null)?.value ?? "";
    const dockerfilePath = get("edit-dockerfile-path");
    const dockerBuildTarget = get("edit-docker-build-target");
    const runtimeContainerPortRaw = get("edit-runtime-container-port");
    const skipHostStrategyBuild =
      (document.getElementById("edit-skip-host-strategy-build") as HTMLSelectElement | null)?.value === "skip";
    const installCommand =
      (document.getElementById("edit-install-command") as HTMLTextAreaElement | null)?.value.trim() ?? "";
    const buildCommand =
      (document.getElementById("edit-build-command") as HTMLTextAreaElement | null)?.value.trim() ?? "";

    const body: Record<string, string | number | boolean | null> = {};
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
    body.installCommand = installCommand;
    body.buildCommand = buildCommand;

    if (Object.keys(body).length === 0) {
      onToast(t("projectSettings.noChanges"), "warning");
      return;
    }

    try {
      const response = await fetchWithCsrf(`/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response, t("projectSettings.updateFailed")));
      }
      onToast(t("projectSettings.updated"), "success");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      onToast(err instanceof Error ? err.message : t("projectSettings.updateFailed"), "error");
    }
  };

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("projectSettings.general.sectionHeading")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("projectSettings.general.sectionIntro")}</p>
      </div>
      <Separator />
      <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="edit-name">{t("projectSettings.general.projectName")}</Label>
          <Input
            id="edit-name"
            type="text"
            placeholder={project.name}
            defaultValue={project.name}
            aria-label={t("projectSettings.general.ariaProjectName")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-repo-url">{t("projectSettings.general.repoUrl")}</Label>
          <Input
            id="edit-repo-url"
            type="url"
            placeholder={project.repoUrl}
            defaultValue={project.repoUrl}
            aria-label={t("projectSettings.general.ariaRepoUrl")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-branch">{t("projectSettings.general.branch")}</Label>
          <Input
            id="edit-branch"
            type="text"
            placeholder={project.branch}
            defaultValue={project.branch}
            aria-label={t("projectSettings.general.ariaBranch")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-workspace-root-dir">{t("projectSettings.general.workspaceRoot")}</Label>
          <Input
            id="edit-workspace-root-dir"
            type="text"
            placeholder="."
            defaultValue={project.workspaceRootDir}
            aria-label={t("projectSettings.general.ariaWorkspaceRoot")}
          />
          <p className="text-xs text-muted-foreground">
            {t("projectSettings.general.workspaceRootHint", { apps: "apps", dot: "." })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-project-root-dir">{t("projectSettings.general.projectRoot")}</Label>
          <Input
            id="edit-project-root-dir"
            type="text"
            placeholder="."
            defaultValue={project.projectRootDir}
            aria-label={t("projectSettings.general.ariaProjectRoot")}
          />
          <p className="text-xs text-muted-foreground">
            {t("projectSettings.general.projectRootHint", { example: "apps/web" })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-runtime-image-mode">{t("projectSettings.general.runtimeImageMode")}</Label>
          <select
            id="edit-runtime-image-mode"
            defaultValue={project.runtimeImageMode}
            aria-label={t("projectSettings.general.ariaRuntimeImageMode")}
            className={selectClass}
          >
            <option value="auto">{t("projectSettings.general.runtimeImageAuto")}</option>
            <option value="platform">{t("projectSettings.general.runtimeImagePlatform")}</option>
            <option value="dockerfile">{t("projectSettings.general.runtimeImageDockerfile")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t("projectSettings.general.runtimeImageHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-dockerfile-path">{t("projectSettings.general.dockerfilePath")}</Label>
          <Input
            id="edit-dockerfile-path"
            type="text"
            placeholder="Dockerfile"
            defaultValue={project.dockerfilePath ?? ""}
            aria-label={t("projectSettings.general.ariaDockerfilePath")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-docker-build-target">{t("projectSettings.general.dockerBuildTarget")}</Label>
          <Input
            id="edit-docker-build-target"
            type="text"
            placeholder="runner"
            defaultValue={project.dockerBuildTarget ?? ""}
            aria-label={t("projectSettings.general.ariaDockerBuildTarget")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-runtime-container-port">{t("projectSettings.general.runtimeContainerPort")}</Label>
          <Input
            id="edit-runtime-container-port"
            type="number"
            min={1}
            max={65535}
            defaultValue={String(project.runtimeContainerPort)}
            aria-label={t("projectSettings.general.ariaRuntimePort")}
          />
          <p className="text-xs text-muted-foreground">{t("projectSettings.general.runtimeContainerPortHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-skip-host-strategy-build">{t("projectSettings.general.hostBuildStrategy")}</Label>
          <select
            id="edit-skip-host-strategy-build"
            defaultValue={project.skipHostStrategyBuild ? "skip" : "build"}
            aria-label={t("projectSettings.general.ariaSkipHostBuild")}
            className={selectClass}
          >
            <option value="build">{t("projectSettings.general.hostBuildRun")}</option>
            <option value="skip">{t("projectSettings.general.hostBuildSkip")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t("projectSettings.general.hostBuildHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-framework-hint">{t("projectSettings.general.framework")}</Label>
          <select
            id="edit-framework-hint"
            defaultValue={project.frameworkHint}
            aria-label={t("projectSettings.general.ariaFramework")}
            className={selectClass}
          >
            <option value="auto">{t("projectSettings.general.frameworkAuto")}</option>
            <option value="nextjs">{t("projectSettings.general.frameworkNextjs")}</option>
            <option value="node">{t("projectSettings.general.frameworkNode")}</option>
            <option value="python">{t("projectSettings.general.frameworkPython")}</option>
            <option value="static">{t("projectSettings.general.frameworkStatic")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t("projectSettings.general.frameworkHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-preview-mode">{t("projectSettings.general.previewType")}</Label>
          <select
            id="edit-preview-mode"
            defaultValue={project.previewMode}
            aria-label={t("projectSettings.general.ariaPreviewMode")}
            className={selectClass}
          >
            <option value="auto">{t("projectSettings.general.previewAuto")}</option>
            <option value="static">{t("projectSettings.general.previewStatic")}</option>
            <option value="server">{t("projectSettings.general.previewServer")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t("projectSettings.general.previewHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-server-preview-target">{t("projectSettings.general.serverPreview")}</Label>
          <select
            id="edit-server-preview-target"
            defaultValue="isolated-runner"
            aria-label={t("projectSettings.general.ariaServerPreviewTarget")}
            className={selectClass}
          >
            <option value="isolated-runner">{t("projectSettings.general.serverPreviewIsolated")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t("projectSettings.general.serverPreviewHint")}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-install-command">{t("projectSettings.general.installCommand")}</Label>
          <Textarea
            id="edit-install-command"
            rows={2}
            placeholder="npm ci --legacy-peer-deps"
            defaultValue={project.installCommand ?? ""}
            aria-label={t("projectSettings.general.ariaInstallCommand")}
            className="min-h-[72px] resize-y font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("projectSettings.general.installCommandHint", {
              ex1: "npm ci --legacy-peer-deps",
              ex2: "pnpm install --frozen-lockfile"
            })}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-build-command">{t("projectSettings.general.buildCommand")}</Label>
          <Textarea
            id="edit-build-command"
            rows={2}
            placeholder="npm run build"
            defaultValue={project.buildCommand ?? ""}
            aria-label={t("projectSettings.general.ariaBuildCommand")}
            className="min-h-[72px] resize-y font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t("projectSettings.general.buildCommandHint", { pkg: "package.json" })}
          </p>
        </div>
        <div className="pt-1">
          <Button type="submit">{t("projectSettings.general.saveChanges")}</Button>
        </div>
      </form>

      <Separator className="my-8" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">{t("projectSettings.general.repoBrowserHeading")}</h3>
        <p className="text-muted-foreground text-sm">{t("projectSettings.general.repoBrowserIntro")}</p>
        {(() => {
          const spec = parseGitHubRepoUrl(project.repoUrl);
          if (!spec) {
            return (
              <p className="text-muted-foreground text-sm">
                {t("projectSettings.general.repoBrowserGithubOnly", { url: "https://github.com/…" })}
              </p>
            );
          }
          return (
            <React.Suspense
              fallback={
                <p className="text-muted-foreground text-sm" role="status">
                  {t("projectSettings.general.loadingRepoBrowser")}
                </p>
              }
            >
              <LazyRepoCodeExplorer
                owner={spec.owner}
                repo={spec.repo}
                ref={project.branch}
                projectRoot={project.projectRootDir.trim() === "" ? "." : project.projectRootDir.trim()}
              />
            </React.Suspense>
          );
        })()}
      </div>
    </div>
  );
};

const EnvSection = ({
  projectId,
  onToast
}: {
  projectId: string;
  onToast: (message: string, variant: "success" | "error" | "warning") => void;
}): React.ReactElement => {
  const { t } = useTranslation();
  const [rows, setRows] = React.useState<EnvRowModel[]>([]);
  const [baselineSerialized, setBaselineSerialized] = React.useState("");
  const [envLoaded, setEnvLoaded] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [valuesRevealed, setValuesRevealed] = React.useState(false);
  const [copyAllFlash, setCopyAllFlash] = React.useState(false);
  const [saveBusy, setSaveBusy] = React.useState(false);
  const [dropHighlight, setDropHighlight] = React.useState(false);
  const dropDepthRef = React.useRef(0);
  const pasteRef = React.useRef<HTMLTextAreaElement>(null);

  const dirty = envLoaded && serializeEnvRows(rows) !== baselineSerialized;

  const mergeParsed = (parsed: Record<string, string>): number => {
    let applied = 0;
    setRows((prev) => {
      const next = [...prev];
      const keyToIndex = new Map<string, number>();
      for (let i = 0; i < next.length; i += 1) {
        const row = next[i];
        if (!row) continue;
        const k = row.key.trim();
        if (k) keyToIndex.set(k, i);
      }
      for (const [key, value] of Object.entries(parsed)) {
        if (!ENV_KEY_REGEX.test(key)) continue;
        const idx = keyToIndex.get(key);
        if (idx !== undefined) {
          const existing = next[idx];
          if (existing) {
            next[idx] = { ...existing, value };
          }
        } else {
          const rowId = crypto.randomUUID();
          next.push({ rowId, key, value, manualScope: null });
          keyToIndex.set(key, next.length - 1);
        }
        applied += 1;
      }
      return next;
    });
    return applied;
  };

  const reloadEnvFromApi = React.useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/projects/${projectId}/env`);
      if (!response.ok) {
        throw new Error(await parseApiError(response, t("projectSettings.env.loadFailed")));
      }
      const list = (await response.json()) as ProjectEnv[];
      const mapped = mapApiToRows(list);
      setRows(mapped);
      setBaselineSerialized(serializeEnvRows(mapped));
      setEnvLoaded(true);
    } catch (err) {
      onToast(err instanceof Error ? err.message : t("projectSettings.env.loadFailed"), "error");
    }
  }, [projectId, onToast, t]);

  React.useEffect(() => {
    void reloadEnvFromApi();
  }, [reloadEnvFromApi]);

  React.useEffect(() => {
    const main = document.getElementById("deployher-main");
    if (!main) return;
    if (dirty) {
      main.classList.add("env-save-bar-pad");
    } else {
      main.classList.remove("env-save-bar-pad");
    }
    return () => main.classList.remove("env-save-bar-pad");
  }, [dirty]);

  React.useEffect(() => {
    if (!envLoaded || !dirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [envLoaded, dirty]);

  const handleScopeToggle = (rowId: string): void => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowId !== rowId) return r;
        const next = !effectivePublic(r);
        return { ...r, manualScope: next ? "build" : "runtime" };
      })
    );
  };

  const handleRemoveRow = async (row: EnvRowModel): Promise<void> => {
    if (!row.serverId) {
      setRows((prev) => {
        const next = prev.filter((r) => r.rowId !== row.rowId);
        setBaselineSerialized(serializeEnvRows(next));
        return next;
      });
      return;
    }
    try {
      const response = await fetchWithCsrf(`/api/projects/${projectId}/env/${row.serverId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await parseApiError(response, t("projectSettings.env.deleteFailed")));
      }
      setRows((prev) => {
        const next = prev.filter((r) => r.rowId !== row.rowId);
        setBaselineSerialized(serializeEnvRows(next));
        return next;
      });
      onToast(t("projectSettings.env.deleted"), "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : t("projectSettings.env.deleteFailed"), "error");
    }
  };

  const handleCopyValue = async (rowId: string): Promise<void> => {
    const row = rows.find((r) => r.rowId === rowId);
    if (!row?.value) return;
    try {
      await navigator.clipboard.writeText(row.value);
    } catch {
      return;
    }
  };

  const handleCopyAll = async (): Promise<void> => {
    const lines = rows
      .map((r) => {
        const k = r.key.trim();
        if (!k) return null;
        return `${k}=${r.value}`;
      })
      .filter((l): l is string => l !== null);
    if (lines.length === 0) return;
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopyAllFlash(true);
      window.setTimeout(() => setCopyAllFlash(false), 1500);
    } catch {
      onToast(t("projectSettings.env.copyFailed"), "warning");
    }
  };

  const handleDiscard = (): void => {
    if (!dirty) return;
    if (!window.confirm(t("projectSettings.env.discardConfirm"))) return;
    void reloadEnvFromApi();
  };

  const handleSave = async (): Promise<void> => {
    const payloads: Array<{ id?: string; key: string; value: string; isPublic: boolean }> = [];
    const seenKeys = new Set<string>();

    for (const row of rows) {
      const key = row.key.trim();
      const value = row.value;
      const isPublic = effectivePublic(row);
      if (!key && !value) continue;
      if (!key) {
        onToast(t("projectSettings.env.keyRequired"), "warning");
        return;
      }
      if (!ENV_KEY_REGEX.test(key)) {
        onToast(t("projectSettings.env.invalidKey", { key }), "warning");
        return;
      }
      if (seenKeys.has(key)) {
        onToast(t("projectSettings.env.duplicateKey", { key }), "warning");
        return;
      }
      seenKeys.add(key);
      payloads.push({
        ...(row.serverId ? { id: row.serverId } : {}),
        key,
        value,
        isPublic
      });
    }

    setSaveBusy(true);
    try {
      for (const payload of payloads) {
        const response = await fetchWithCsrf(`/api/projects/${projectId}/env`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (!response.ok) {
          throw new Error(await parseApiError(response, t("projectSettings.env.saveFailed")));
        }
      }
      await reloadEnvFromApi();
      onToast(t("projectSettings.env.saved"), "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : t("projectSettings.env.saveFailed"), "error");
    } finally {
      setSaveBusy(false);
    }
  };

  const q = search.trim().toLowerCase();
  const filtered = rows.map((r) => ({
    row: r,
    visible: !q || r.key.trim().toLowerCase().includes(q)
  }));
  const visibleCount = filtered.filter((x) => x.visible).length;
  const showFilterEmpty = Boolean(q) && rows.length > 0 && visibleCount === 0;

  const readFileEnv = async (file: File): Promise<void> => {
    if (file.size > MAX_ENV_FILE_BYTES) {
      onToast(t("projectSettings.env.fileTooLarge", { size: file.size, max: MAX_ENV_FILE_BYTES }), "warning");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseEnvFileContent(text);
      const n = mergeParsed(parsed);
      onToast(
        n > 0
          ? t("projectSettings.env.mergedFromFile", { count: n })
          : t("projectSettings.env.noValidInFile"),
        n > 0 ? "success" : "warning"
      );
    } catch {
      onToast(t("projectSettings.env.readFileFailed"), "error");
    }
  };

  const handleDrop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault();
    dropDepthRef.current = 0;
    setDropHighlight(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await readFileEnv(file);
      return;
    }
    const text = e.dataTransfer.getData("text/plain").trim();
    if (!text) return;
    const parsed = parseEnvFileContent(text);
    const n = mergeParsed(parsed);
    onToast(
      n > 0 ? t("projectSettings.env.mergedFromDrop", { count: n }) : t("projectSettings.env.noValidInDrop"),
      n > 0 ? "success" : "warning"
    );
  };

  const handlePasteArea = (e: React.ClipboardEvent): void => {
    const text = e.clipboardData.getData("text/plain");
    if (!looksLikeEnvPaste(text)) return;
    e.preventDefault();
    const parsed = parseEnvFileContent(text);
    const n = mergeParsed(parsed);
    if (pasteRef.current) pasteRef.current.value = "";
    onToast(
      n > 0 ? t("projectSettings.env.mergedFromClipboard", { count: n }) : t("projectSettings.env.noValidInPaste"),
      n > 0 ? "success" : "warning"
    );
  };

  const handleTablePaste = (e: React.ClipboardEvent): void => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement)) return;
    const text = e.clipboardData.getData("text/plain");
    if (!looksLikeEnvPaste(text)) return;
    e.preventDefault();
    const parsed = parseEnvFileContent(text);
    const n = mergeParsed(parsed);
    onToast(
      n > 0 ? t("projectSettings.env.mergedFromClipboard", { count: n }) : t("projectSettings.env.noValidInPaste"),
      n > 0 ? "success" : "warning"
    );
  };

  const handleMergePasteClick = (): void => {
    const text = pasteRef.current?.value ?? "";
    const parsed = parseEnvFileContent(text);
    const n = mergeParsed(parsed);
    if (pasteRef.current) pasteRef.current.value = "";
    onToast(
      n > 0 ? t("projectSettings.env.mergedGeneric", { count: n }) : t("projectSettings.env.noValidInPaste"),
      n > 0 ? "success" : "warning"
    );
  };

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">{t("projectSettings.env.sectionHeading")}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t("projectSettings.env.intro")}</p>
        <p className="mt-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground/90">{t("projectSettings.env.generalLinkStrong")}</strong>{" "}
          {t("projectSettings.env.generalLinkBefore")}{" "}
          <Link to={`/projects/${projectId}/settings`} className="font-medium text-primary underline-offset-2 hover:underline">
            {t("projectSettings.navGeneral")}
          </Link>
          {t("projectSettings.env.generalLinkAfter")}
        </p>
        <details className="mt-4 rounded-lg border border-border/80 bg-muted/15 px-4 py-3 text-sm open:shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 select-none font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <span className="text-xs text-muted-foreground" aria-hidden>
              ▸
            </span>
            {t("projectSettings.env.howThisWorks")}
          </summary>
          <div className="mt-3 space-y-2 border-t border-border/50 pt-3 text-xs leading-relaxed text-muted-foreground">
            <p>{t("projectSettings.env.howBuildP")}</p>
            <p>{t("projectSettings.env.howRuntimeP")}</p>
            <p>{t("projectSettings.env.howOwnersP")}</p>
          </div>
        </details>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border/80 bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border/50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">{t("projectSettings.env.variablesHeading")}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rows.length === 0
                ? t("projectSettings.env.noVarsYet")
                : rows.length === 1
                  ? t("projectSettings.env.varCountOne")
                  : t("projectSettings.env.varCount", { count: rows.length })}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {t("projectSettings.env.parserHint", {
                export: "export",
                save: t("projectSettings.env.saveStrong")
              })}
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className={cn(rows.length === 0 && "hidden")}>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    className={cn(envPillBtn, "shrink-0")}
                    aria-pressed={valuesRevealed}
                    onClick={() => setValuesRevealed((v) => !v)}
                  >
                    {valuesRevealed ? <EyeOff className="size-3.5 shrink-0" aria-hidden /> : <Eye className="size-3.5 shrink-0" aria-hidden />}
                    {valuesRevealed ? t("projectSettings.env.hideValues") : t("projectSettings.env.revealValues")}
                  </button>
                  <button type="button" className={cn(envPillBtn, "shrink-0")} onClick={() => void handleCopyAll()}>
                    {copyAllFlash ? (
                      <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Copy className="size-3.5 shrink-0" aria-hidden />
                    )}
                    {copyAllFlash ? t("projectSettings.env.copied") : t("projectSettings.env.copyAll")}
                  </button>
                </div>
              </div>
              <button
                type="button"
                className={cn(envPillBtnPrimary, "shrink-0")}
                onClick={() => {
                  setRows((prev) => [...prev, { rowId: crypto.randomUUID(), key: "", value: "", manualScope: null }]);
                }}
              >
                <Plus className="size-3.5 shrink-0" aria-hidden />
                {t("projectSettings.env.add")}
              </button>
            </div>
            <Input
              type="search"
              placeholder={t("projectSettings.env.filterPlaceholder")}
              aria-label={t("projectSettings.env.filterAria")}
              autoComplete="off"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 max-w-full font-mono text-xs sm:w-[220px]"
            />
          </div>
        </div>

        <div className="space-y-4 p-4">
          <details className="group/import rounded-[10px] border border-dashed border-border/80 bg-muted/10 px-4 py-4 transition-colors open:border-border hover:bg-muted/12 open:bg-muted/15">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
              <Plus className="size-3.5 opacity-70" aria-hidden />
              {t("projectSettings.env.importSummary")}
            </summary>
            <div
              className={cn(
                "mt-3 space-y-3 rounded-lg border border-transparent transition-colors",
                dropHighlight && "border-border/60 bg-muted/25"
              )}
              onDragEnter={(e) => {
                e.preventDefault();
                dropDepthRef.current += 1;
                setDropHighlight(true);
              }}
              onDragLeave={() => {
                dropDepthRef.current = Math.max(0, dropDepthRef.current - 1);
                if (dropDepthRef.current === 0) setDropHighlight(false);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => void handleDrop(e)}
            >
              <p className="text-center text-xs text-muted-foreground">{t("projectSettings.env.importDropHint")}</p>
              <Textarea
                ref={pasteRef}
                rows={4}
                placeholder={t("projectSettings.env.pastePlaceholder")}
                aria-label={t("projectSettings.env.pasteAria")}
                className="resize-y border-border/80 bg-muted/20 font-mono text-xs leading-relaxed"
                onPaste={handlePasteArea}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={handleMergePasteClick}>
                  {t("projectSettings.env.parsePaste")}
                </Button>
                <label className="inline-flex cursor-pointer">
                  <Input
                    type="file"
                    accept=".env,text/plain"
                    className="sr-only"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) void readFileEnv(f);
                    }}
                  />
                  <span className={cn(envPillBtn, "cursor-pointer text-xs")}>{t("projectSettings.env.chooseFile")}</span>
                </label>
              </div>
            </div>
          </details>

          <div className="relative overflow-hidden rounded-[10px] border border-border/60 bg-background/30">
            <div className="max-h-[min(52vh,28rem)] overflow-auto">
              <table className="env-editor-table w-full border-collapse text-sm" onPaste={handleTablePaste}>
                <thead>
                  <tr className="bg-muted/25">
                    <th className="w-[40%] border-b border-r border-border/50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("projectSettings.env.colKey")}
                    </th>
                    <th className="min-w-32 border-b border-border/50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("projectSettings.env.colValue")}
                    </th>
                    <th className="w-24 whitespace-nowrap border-b border-border/50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {t("projectSettings.env.colScope")}
                    </th>
                    <th className="w-22 border-b border-border/50 px-2 py-2.5" aria-label={t("projectSettings.env.rowActionsAria")} />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        {t("projectSettings.env.emptyTable", { add: t("projectSettings.env.addStrong") })}
                      </td>
                    </tr>
                  ) : null}
                  {showFilterEmpty ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        {t("projectSettings.env.filterNoMatch")}
                      </td>
                    </tr>
                  ) : null}
                  {filtered.map(({ row, visible }) => {
                    if (!visible) {
                      return null;
                    }
                    const pub = effectivePublic(row);
                    const scopeLabel = pub ? t("projectSettings.env.scopeBuild") : t("projectSettings.env.scopeRuntime");
                    return (
                      <tr
                        key={row.rowId}
                        className="group border-b border-border/40 transition-colors hover:bg-muted/35 focus-within:bg-muted/25"
                      >
                        <td className="h-12 border-r border-border/50 px-4 py-0 align-middle">
                          <Input
                            type="text"
                            value={row.key}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRows((prev) =>
                                prev.map((r) => (r.rowId === row.rowId ? { ...r, key: v, manualScope: null } : r))
                              );
                            }}
                            placeholder="API_BASE_URL"
                            maxLength={128}
                            aria-label={t("projectSettings.env.envKeyAria")}
                            className="h-12 w-full min-w-0 rounded-none border-0 bg-transparent py-3 font-mono text-[13px] text-foreground shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0"
                          />
                        </td>
                        <td className="h-12 min-w-0 max-w-[min(22rem,48vw)] px-4 py-0 align-middle">
                          <Input
                            type={valuesRevealed ? "text" : "password"}
                            value={row.value}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRows((prev) => prev.map((r) => (r.rowId === row.rowId ? { ...r, value: v } : r)));
                            }}
                            placeholder={t("projectSettings.env.valuePlaceholder")}
                            autoComplete="off"
                            title={row.value.length > 0 ? row.value : undefined}
                            aria-label={t("projectSettings.env.envValueAria")}
                            className="h-12 w-full min-w-0 truncate rounded-none border-0 bg-transparent py-3 font-mono text-[13px] text-foreground shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0"
                          />
                        </td>
                        <td className="h-12 whitespace-nowrap px-4 py-0 align-middle">
                          <button
                            type="button"
                            aria-pressed={pub}
                            aria-label={
                              pub ? t("projectSettings.env.scopeAriaBuild") : t("projectSettings.env.scopeAriaRuntime")
                            }
                            title={
                              row.manualScope === null
                                ? pub
                                  ? t("projectSettings.env.scopeTitleDefaultBuild")
                                  : t("projectSettings.env.scopeTitleDefaultRuntime")
                                : pub
                                  ? t("projectSettings.env.scopeTitleManualBuild")
                                  : t("projectSettings.env.scopeTitleManualRuntime")
                            }
                            onClick={() => handleScopeToggle(row.rowId)}
                            className={cn(
                              "inline-flex h-7 max-w-full cursor-pointer items-center justify-center rounded-md border-0 px-2 text-[0.65rem] font-semibold uppercase tracking-wide outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              pub
                                ? "bg-primary/15 text-primary hover:bg-primary/25"
                                : "bg-muted/50 text-muted-foreground hover:bg-muted/80"
                            )}
                          >
                            {scopeLabel}
                          </button>
                        </td>
                        <td className="h-12 px-2 py-0 text-right align-middle">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100 group-focus-within:opacity-100">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 shrink-0"
                              aria-label={t("projectSettings.env.copyValueAria")}
                              title={t("projectSettings.env.copyValueTitle")}
                              onClick={() => void handleCopyValue(row.rowId)}
                            >
                              <Copy className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 shrink-0 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                              aria-label={t("projectSettings.env.removeVarAria")}
                              title={t("projectSettings.env.removeTitle")}
                              onClick={() => void handleRemoveRow(row)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              className="flex w-full cursor-pointer items-center gap-2 border-t border-border/50 bg-transparent px-4 py-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
              onClick={() => {
                setRows((prev) => [...prev, { rowId: crypto.randomUUID(), key: "", value: "", manualScope: null }]);
              }}
            >
              <Plus className="size-3.5 shrink-0 opacity-70" aria-hidden />
              {t("projectSettings.env.addVariable")}
            </button>
          </div>
        </div>
      </div>

      <div
        role="region"
        aria-label={t("projectSettings.env.saveBarAria")}
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/92 px-4 py-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md",
          !dirty && "hidden"
        )}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {dirty ? t("projectSettings.env.unsavedHint") : ""}
          </p>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="outline" size="sm" disabled={saveBusy} onClick={handleDiscard}>
              {t("projectSettings.env.discard")}
            </Button>
            <Button type="button" size="sm" disabled={saveBusy} onClick={() => void handleSave()}>
              {t("projectSettings.env.save")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DangerSection = ({
  project,
  projectId,
  onToast
}: {
  project: Project;
  projectId: string;
  onToast: (message: string, variant: "success" | "error" | "warning") => void;
}): React.ReactElement => {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm(t("projectSettings.danger.deleteConfirm"))) return;
    setBusy(true);
    try {
      const response = await fetchWithCsrf(`/projects/${projectId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await parseApiError(response, t("projectSettings.danger.deleteFailed")));
      }
      onToast(t("projectSettings.danger.deleted"), "success");
      window.setTimeout(() => {
        window.location.href = "/projects";
      }, 500);
    } catch (err) {
      onToast(err instanceof Error ? err.message : t("projectSettings.danger.deleteFailed"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-destructive">{t("projectSettings.danger.heading")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("projectSettings.danger.intro")}</p>
      </div>
      <Separator className="border-destructive/30" />
      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("projectSettings.danger.deleteTitle")}</CardTitle>
          <CardDescription>{t("projectSettings.danger.deleteDesc", { name: project.name })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
            {t("projectSettings.danger.deleteButton")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export const ProjectSettingsPageClient = ({ data }: { data: ProjectSettingsData }): React.ReactElement => {
  const notifRef = React.useRef<HTMLDivElement>(null);
  const { project, activeSection } = data;
  const projectId = project.id;

  const onToast = React.useCallback((message: string, variant: "success" | "error" | "warning") => {
    const el = notifRef.current;
    if (el) showPageToast(el, message, variant);
  }, []);

  return (
    <>
      <div ref={notifRef} aria-live="polite" className={PAGE_TOAST_HIDDEN_CLASS} />
      {activeSection === "general" && <GeneralSection project={project} projectId={projectId} onToast={onToast} />}
      {activeSection === "env" && <EnvSection projectId={projectId} onToast={onToast} />}
      {activeSection === "danger" && <DangerSection project={project} projectId={projectId} onToast={onToast} />}
    </>
  );
};
