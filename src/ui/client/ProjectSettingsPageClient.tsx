import * as React from "react";
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
      onToast("No changes to save", "warning");
      return;
    }

    try {
      const response = await fetchWithCsrf(`/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to update project"));
      }
      onToast("Project updated!", "success");
      window.setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to update project", "error");
    }
  };

  const selectClass =
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">General</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your project name, repository, and build configuration.
        </p>
      </div>
      <Separator />
      <form className="space-y-5" onSubmit={(e) => void handleSubmit(e)}>
        <div className="space-y-1.5">
          <Label htmlFor="edit-name">Project Name</Label>
          <Input id="edit-name" type="text" placeholder={project.name} defaultValue={project.name} aria-label="Project name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-repo-url">Repository URL</Label>
          <Input
            id="edit-repo-url"
            type="url"
            placeholder={project.repoUrl}
            defaultValue={project.repoUrl}
            aria-label="GitHub repository URL"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-branch">Branch</Label>
          <Input id="edit-branch" type="text" placeholder={project.branch} defaultValue={project.branch} aria-label="Branch to deploy" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-workspace-root-dir">Workspace Root</Label>
          <Input
            id="edit-workspace-root-dir"
            type="text"
            placeholder="."
            defaultValue={project.workspaceRootDir}
            aria-label="Workspace root directory inside the repository"
          />
          <p className="text-xs text-muted-foreground">
            Install and lockfile detection run here. Set this to the monorepo workspace root, such as <code>apps</code> or{" "}
            <code>.</code>.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-project-root-dir">Project Root</Label>
          <Input
            id="edit-project-root-dir"
            type="text"
            placeholder="."
            defaultValue={project.projectRootDir}
            aria-label="Project root directory inside the repository"
          />
          <p className="text-xs text-muted-foreground">
            Strategy detection and app build run here. This must stay inside the workspace root, for example <code>apps/web</code>.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-runtime-image-mode">Runtime Image Mode</Label>
          <select id="edit-runtime-image-mode" defaultValue={project.runtimeImageMode} aria-label="Runtime image mode" className={selectClass}>
            <option value="auto">Auto</option>
            <option value="platform">Platform image</option>
            <option value="dockerfile">Repo Dockerfile</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Auto prefers your repo Dockerfile when present. Platform always uses a Deployher-generated runtime image.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-dockerfile-path">Dockerfile Path (optional)</Label>
          <Input
            id="edit-dockerfile-path"
            type="text"
            placeholder="Dockerfile"
            defaultValue={project.dockerfilePath ?? ""}
            aria-label="Dockerfile path relative to the repository root"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-docker-build-target">Docker Build Target (optional)</Label>
          <Input
            id="edit-docker-build-target"
            type="text"
            placeholder="runner"
            defaultValue={project.dockerBuildTarget ?? ""}
            aria-label="Docker build target"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-runtime-container-port">Runtime Container Port</Label>
          <Input
            id="edit-runtime-container-port"
            type="number"
            min={1}
            max={65535}
            defaultValue={String(project.runtimeContainerPort)}
            aria-label="Runtime container port"
          />
          <p className="text-xs text-muted-foreground">
            Used for server previews when Deployher runs your built image. This is especially important for Dockerfile-first deploys.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-skip-host-strategy-build">Host Build Strategy</Label>
          <select
            id="edit-skip-host-strategy-build"
            defaultValue={project.skipHostStrategyBuild ? "skip" : "build"}
            aria-label="Skip host strategy build"
            className={selectClass}
          >
            <option value="build">Run host build strategy</option>
            <option value="skip">Dockerfile-only server build</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Dockerfile-only skips host install/build and uploads only the image built from your repo. Server previews only.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-framework-hint">Framework</Label>
          <select id="edit-framework-hint" defaultValue={project.frameworkHint} aria-label="Framework hint" className={selectClass}>
            <option value="auto">Auto-detect</option>
            <option value="nextjs">Next.js</option>
            <option value="node">Node server</option>
            <option value="python">Python</option>
            <option value="static">Static site</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Use a framework hint when auto-detect keeps picking the wrong output for this repository.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-preview-mode">Preview Type</Label>
          <select id="edit-preview-mode" defaultValue={project.previewMode} aria-label="Preview type" className={selectClass}>
            <option value="auto">Auto-detect</option>
            <option value="static">Static</option>
            <option value="server">Server</option>
          </select>
          <p className="text-xs text-muted-foreground">
            This is your requested preview mode. The deployment detail page shows the final resolved output after the build.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-server-preview-target">Server preview</Label>
          <select id="edit-server-preview-target" defaultValue="isolated-runner" aria-label="Server preview target" className={selectClass}>
            <option value="isolated-runner">Isolated runner</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Server previews are proxied to RUNNER_URL; the preview-runner loads runtime-image.tar from S3 and runs a bounded container.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-install-command">Install command (optional)</Label>
          <Textarea
            id="edit-install-command"
            rows={2}
            placeholder="npm ci --legacy-peer-deps"
            defaultValue={project.installCommand ?? ""}
            aria-label="Custom dependency install command for Node.js builds"
            className="min-h-[72px] resize-y font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            For Node.js builds only, replaces the auto-detected install command. No shell — use a single command line (examples:{" "}
            <code className="text-xs">npm ci --legacy-peer-deps</code>, <code className="text-xs">pnpm install --frozen-lockfile</code>
            ). Runs in the workspace root inside the build container.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-build-command">Build command (optional)</Label>
          <Textarea
            id="edit-build-command"
            rows={2}
            placeholder="npm run build"
            defaultValue={project.buildCommand ?? ""}
            aria-label="Custom build command for Node.js builds"
            className="min-h-[72px] resize-y font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            When set, runs this instead of the default package-manager build for Node.js. Leave empty to keep using{" "}
            <code className="text-xs">package.json</code> behavior (including skipping build when there is no build script).
          </p>
        </div>
        <div className="pt-1">
          <Button type="submit">Save Changes</Button>
        </div>
      </form>

      <Separator className="my-8" />
      <div className="space-y-2">
        <h3 className="text-lg font-semibold">Repository browser</h3>
        <p className="text-muted-foreground text-sm">
          Browse files and line counts for the configured branch and project root.
        </p>
        {(() => {
          const spec = parseGitHubRepoUrl(project.repoUrl);
          if (!spec) {
            return (
              <p className="text-muted-foreground text-sm">
                Repository browser requires an <code className="text-xs">https://github.com/…</code> URL.
              </p>
            );
          }
          return (
            <React.Suspense
              fallback={
                <p className="text-muted-foreground text-sm" role="status">
                  Loading repository browser…
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
        throw new Error(await parseApiError(response, "Failed to load environment variables"));
      }
      const list = (await response.json()) as ProjectEnv[];
      const mapped = mapApiToRows(list);
      setRows(mapped);
      setBaselineSerialized(serializeEnvRows(mapped));
      setEnvLoaded(true);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to load environment variables", "error");
    }
  }, [projectId, onToast]);

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
        throw new Error(await parseApiError(response, "Failed to delete environment variable"));
      }
      setRows((prev) => {
        const next = prev.filter((r) => r.rowId !== row.rowId);
        setBaselineSerialized(serializeEnvRows(next));
        return next;
      });
      onToast("Environment variable deleted", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to delete environment variable", "error");
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
      onToast("Could not copy to clipboard", "warning");
    }
  };

  const handleDiscard = (): void => {
    if (!dirty) return;
    if (!window.confirm("Discard all unsaved changes to environment variables?")) return;
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
        onToast("Environment variable key is required", "warning");
        return;
      }
      if (!ENV_KEY_REGEX.test(key)) {
        onToast(`Invalid env key: ${key}`, "warning");
        return;
      }
      if (seenKeys.has(key)) {
        onToast(`Duplicate env key: ${key}`, "warning");
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
          throw new Error(await parseApiError(response, "Failed to save environment variables"));
        }
      }
      await reloadEnvFromApi();
      onToast("Environment variables saved", "success");
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to save environment variables", "error");
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
      onToast(`.env file is too large (${file.size} bytes). Max is ${MAX_ENV_FILE_BYTES} bytes.`, "warning");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseEnvFileContent(text);
      const n = mergeParsed(parsed);
      onToast(n > 0 ? `Merged ${n} variable(s) from file` : "No valid variables in file", n > 0 ? "success" : "warning");
    } catch {
      onToast("Failed to read file", "error");
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
    onToast(n > 0 ? `Merged ${n} variable(s) from drop` : "No valid variables in drop", n > 0 ? "success" : "warning");
  };

  const handlePasteArea = (e: React.ClipboardEvent): void => {
    const text = e.clipboardData.getData("text/plain");
    if (!looksLikeEnvPaste(text)) return;
    e.preventDefault();
    const parsed = parseEnvFileContent(text);
    const n = mergeParsed(parsed);
    if (pasteRef.current) pasteRef.current.value = "";
    onToast(n > 0 ? `Merged ${n} variable(s) from clipboard` : "No valid variables in paste", n > 0 ? "success" : "warning");
  };

  const handleTablePaste = (e: React.ClipboardEvent): void => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    const text = e.clipboardData.getData("text/plain");
    if (!looksLikeEnvPaste(text)) return;
    e.preventDefault();
    const parsed = parseEnvFileContent(text);
    const n = mergeParsed(parsed);
    onToast(n > 0 ? `Merged ${n} variable(s) from clipboard` : "No valid variables in paste", n > 0 ? "success" : "warning");
  };

  const handleMergePasteClick = (): void => {
    const text = pasteRef.current?.value ?? "";
    const parsed = parseEnvFileContent(text);
    const n = mergeParsed(parsed);
    if (pasteRef.current) pasteRef.current.value = "";
    onToast(n > 0 ? `Merged ${n} variable(s)` : "No valid variables in paste", n > 0 ? "success" : "warning");
  };

  return (
    <div className="space-y-6 pb-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Environment variables</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Values are saved with the project and applied on deploy—no per-deploy <code className="text-foreground/90">.env</code> upload. Keys
          starting with <code className="text-foreground/90">NEXT_PUBLIC_</code> or <code className="text-foreground/90">PD_PUBLIC_</code>{" "}
          default to <span className="text-foreground/90">Build</span>; others default to <span className="text-foreground/90">Runtime</span>.
          Click a scope badge to override.
        </p>
        <p className="mt-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <strong className="font-medium text-foreground/90">Install and build commands</strong> live under{" "}
          <a href={`/projects/${projectId}/settings`} className="font-medium text-primary underline-offset-2 hover:underline">
            General
          </a>
          . Saving variables here does not update those fields—open General and click Save Changes after editing them.
        </p>
        <details className="mt-4 rounded-lg border border-border/80 bg-muted/15 px-4 py-3 text-sm open:shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 select-none font-medium text-foreground [&::-webkit-details-marker]:hidden">
            <span className="text-xs text-muted-foreground" aria-hidden>
              ▸
            </span>
            How this works
          </summary>
          <div className="mt-3 space-y-2 border-t border-border/50 pt-3 text-xs leading-relaxed text-muted-foreground">
            <p>
              <strong className="font-medium text-foreground/90">Build</strong> variables are passed into the build step (install, compile).
              Use for anything the build must read; treat them as sensitive if logs or artifacts could expose them.
            </p>
            <p>
              <strong className="font-medium text-foreground/90">Runtime</strong> variables are kept out of the build step and injected only
              into the running server preview container. Use this scope for server-only secrets like database URLs, API keys, and Next.js
              server action encryption keys.
            </p>
            <p>Only project owners can read or change these values via the API.</p>
          </div>
        </details>
      </div>

      <div className="overflow-hidden rounded-[10px] border border-border/80 bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border/50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Variables</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {rows.length === 0 ? "No variables yet" : `${rows.length} variable${rows.length === 1 ? "" : "s"}`}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Parser matches deployment builds (comments, <code className="text-[0.7rem]">export</code>, quoted values). Merge from paste or
              file, then <strong className="font-medium text-foreground/80">Save</strong> when the bar appears.
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
                    {valuesRevealed ? "Hide values" : "Reveal values"}
                  </button>
                  <button type="button" className={cn(envPillBtn, "shrink-0")} onClick={() => void handleCopyAll()}>
                    {copyAllFlash ? (
                      <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <Copy className="size-3.5 shrink-0" aria-hidden />
                    )}
                    {copyAllFlash ? "Copied" : "Copy all"}
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
                Add
              </button>
            </div>
            <Input
              type="search"
              placeholder="Filter by key…"
              aria-label="Filter environment variables by key"
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
              Import from <code className="font-mono text-[0.7rem]">.env</code> (paste, file, or drop)
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
              <p className="text-center text-xs text-muted-foreground">
                Paste a <code className="rounded bg-muted px-1.5 py-px font-mono text-[0.65rem]">.env</code> or drag a file here. Matching keys
                update rows; new keys append.
              </p>
              <Textarea
                ref={pasteRef}
                rows={4}
                placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=sk-...\nNEXT_PUBLIC_URL=https://..."}
                aria-label="Paste .env content to merge into the table"
                className="resize-y border-border/80 bg-muted/20 font-mono text-xs leading-relaxed"
                onPaste={handlePasteArea}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" className="text-xs" onClick={handleMergePasteClick}>
                  Parse paste
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
                  <span className={cn(envPillBtn, "cursor-pointer text-xs")}>Choose file</span>
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
                      Key
                    </th>
                    <th className="min-w-32 border-b border-border/50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Value
                    </th>
                    <th className="w-24 whitespace-nowrap border-b border-border/50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Scope
                    </th>
                    <th className="w-22 border-b border-border/50 px-2 py-2.5" aria-label="Row actions" />
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                        No variables yet. Use <span className="font-medium text-foreground/80">Add</span> or import a{" "}
                        <code className="font-mono text-xs">.env</code>.
                      </td>
                    </tr>
                  ) : null}
                  {showFilterEmpty ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                        No keys match this filter.
                      </td>
                    </tr>
                  ) : null}
                  {filtered.map(({ row, visible }) => {
                    if (!visible) {
                      return null;
                    }
                    const pub = effectivePublic(row);
                    const scopeLabel = pub ? "Build" : "Runtime";
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
                            aria-label="Environment variable key"
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
                            placeholder="value"
                            autoComplete="off"
                            title={row.value.length > 0 ? row.value : undefined}
                            aria-label="Environment variable value"
                            className="h-12 w-full min-w-0 truncate rounded-none border-0 bg-transparent py-3 font-mono text-[13px] text-foreground shadow-none placeholder:text-muted-foreground/55 focus-visible:ring-0"
                          />
                        </td>
                        <td className="h-12 whitespace-nowrap px-4 py-0 align-middle">
                          <button
                            type="button"
                            aria-pressed={pub}
                            aria-label={
                              pub
                                ? "Scope: included in build. Click to mark runtime-only."
                                : "Scope: runtime-only. Click to include in build."
                            }
                            title={
                              row.manualScope === null
                                ? pub
                                  ? "Default: public prefix. Click to force runtime-only."
                                  : "Default: no public prefix. Click to force build."
                                : pub
                                  ? "Manually set to build. Click to use runtime-only."
                                  : "Manually set to runtime. Click to use build."
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
                              aria-label="Copy value"
                              title="Copy value"
                              onClick={() => void handleCopyValue(row.rowId)}
                            >
                              <Copy className="size-3.5" aria-hidden />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="size-7 shrink-0 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                              aria-label="Remove variable"
                              title="Remove"
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
              Add variable
            </button>
          </div>
        </div>
      </div>

      <div
        role="region"
        aria-label="Save environment variables"
        className={cn(
          "fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/92 px-4 py-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.45)] backdrop-blur-md",
          !dirty && "hidden"
        )}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {dirty ? "You have unsaved changes—save before you leave this page." : ""}
          </p>
          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button type="button" variant="outline" size="sm" disabled={saveBusy} onClick={handleDiscard}>
              Discard
            </Button>
            <Button type="button" size="sm" disabled={saveBusy} onClick={() => void handleSave()}>
              Save
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
  const [busy, setBusy] = React.useState(false);

  const handleDelete = async (): Promise<void> => {
    if (!window.confirm("Are you sure you want to delete this project? This action cannot be undone.")) return;
    setBusy(true);
    try {
      const response = await fetchWithCsrf(`/projects/${projectId}`, { method: "DELETE" });
      if (!response.ok) {
        throw new Error(await parseApiError(response, "Failed to delete project"));
      }
      onToast("Project deleted", "success");
      window.setTimeout(() => {
        window.location.href = "/projects";
      }, 500);
    } catch (err) {
      onToast(err instanceof Error ? err.message : "Failed to delete project", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
        <p className="mt-1 text-sm text-muted-foreground">Irreversible actions. Proceed with caution.</p>
      </div>
      <Separator className="border-destructive/30" />
      <Card className="border-destructive/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Delete Project</CardTitle>
          <CardDescription>
            Permanently delete <strong className="text-foreground">{project.name}</strong> and all its deployments. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button type="button" variant="destructive" disabled={busy} onClick={() => void handleDelete()}>
            Delete Project
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
