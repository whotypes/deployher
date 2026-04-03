import * as React from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  filterReposByQuery,
  groupReposByOwner,
  type GitHubRepo,
  reposByFullName
} from "@/lib/githubRepo";
import { readOpenAfterCreate, readPreferredBranch, readProjectsCreateModeInitial } from "@/lib/userUiPrefs";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "./fetchWithCsrf";

const GitHubMark = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden
    className={cn("size-4 shrink-0", className)}
    focusable="false"
  >
    <path
      fill="currentColor"
      d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
    />
  </svg>
);

type OwnerRepoGroupProps = {
  owner: string;
  repos: GitHubRepo[];
};

const OwnerRepoGroup = ({ owner, repos }: OwnerRepoGroupProps) => {
  const [open, setOpen] = React.useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Separator />
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 py-3 pl-4 pr-4 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        type="button"
      >
        <ChevronRight
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden
        />
        <span className="font-medium">{owner}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {repos.map((repo) => (
          <div key={repo.id}>
            <Separator />
            <div className="flex items-center gap-3 py-3 pl-11 pr-4">
              <RadioGroupItem value={repo.fullName} id={`github-repo-${repo.id}`} className="shrink-0" />
              <Label
                htmlFor={`github-repo-${repo.id}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm font-normal"
              >
                <span className="truncate">{repo.name}</span>
                <Badge variant={repo.private ? "secondary" : "outline"} className="text-[10px] font-normal">
                  {repo.private ? "private" : "public"}
                </Badge>
              </Label>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

export type ProjectsPageClientProps = {
  hasRepoAccess: boolean;
  githubLinked: boolean;
};

const showToast = (message: string, variant: "success" | "error"): void => {
  const el = document.getElementById("notification");
  if (!el) return;
  el.textContent = message;
  el.className = cn(
    "fixed top-4 right-4 z-[100] rounded-md px-4 py-3 text-sm font-medium shadow-lg",
    variant === "success" && "bg-primary text-primary-foreground",
    variant === "error" && "bg-destructive text-destructive-foreground"
  );
  window.setTimeout(() => {
    el.className = "hidden fixed top-4 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg";
  }, 3200);
};

const fetchRepos = async (): Promise<GitHubRepo[]> => {
  const response = await fetch("/api/github/repos", { headers: { Accept: "application/json" } });
  const data = (await response.json().catch(() => ({}))) as { repos?: GitHubRepo[]; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load repositories");
  }
  return Array.isArray(data.repos) ? data.repos : [];
};

const fetchBranches = async (owner: string, repo: string): Promise<string[]> => {
  const params = new URLSearchParams({ owner, repo });
  const response = await fetch("/api/github/branches?" + params.toString(), {
    headers: { Accept: "application/json" }
  });
  const data = (await response.json().catch(() => ({}))) as { branches?: string[]; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load branches");
  }
  return Array.isArray(data.branches) ? data.branches : [];
};

export const ProjectsPageClient = ({ hasRepoAccess, githubLinked }: ProjectsPageClientProps) => {
  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [createMode, setCreateMode] = React.useState<"import" | "manual">(() =>
    readProjectsCreateModeInitial(hasRepoAccess)
  );
  const [repos, setRepos] = React.useState<GitHubRepo[]>([]);
  const [repoLoading, setRepoLoading] = React.useState(false);
  const [repoError, setRepoError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState("");
  const deferredFilter = React.useDeferredValue(filter);
  const [selectedRepo, setSelectedRepo] = React.useState<GitHubRepo | null>(null);
  const [branches, setBranches] = React.useState<string[]>([]);
  const [branch, setBranch] = React.useState("");
  const [branchesLoading, setBranchesLoading] = React.useState(false);
  const [branchesError, setBranchesError] = React.useState<string | null>(null);
  const [createLoading, setCreateLoading] = React.useState(false);
  const [manualCreateLoading, setManualCreateLoading] = React.useState(false);
  const [connectLoading, setConnectLoading] = React.useState(false);
  const [manualName, setManualName] = React.useState("");
  const [manualRepoUrl, setManualRepoUrl] = React.useState("");
  const [manualBranch, setManualBranch] = React.useState(() => readPreferredBranch());
  const [workspaceRootDir, setWorkspaceRootDir] = React.useState(".");
  const [projectRootDir, setProjectRootDir] = React.useState(".");
  const [frameworkHint, setFrameworkHint] = React.useState<
    "auto" | "nextjs" | "node" | "python" | "static"
  >("auto");
  const [previewMode, setPreviewMode] = React.useState<"auto" | "static" | "server">("auto");
  const [serverPreviewTarget, setServerPreviewTarget] = React.useState<
    "isolated-runner" | "trusted-local-docker"
  >("isolated-runner");
  const [runtimeImageMode, setRuntimeImageMode] = React.useState<
    "auto" | "platform" | "dockerfile"
  >("auto");
  const [dockerfilePath, setDockerfilePath] = React.useState("");
  const [dockerBuildTarget, setDockerBuildTarget] = React.useState("");
  const [runtimeContainerPort, setRuntimeContainerPort] = React.useState("3000");
  const [skipHostStrategyBuild, setSkipHostStrategyBuild] = React.useState(false);

  const filteredRepos = React.useMemo(() => filterReposByQuery(repos, deferredFilter), [repos, deferredFilter]);
  const grouped = React.useMemo(() => groupReposByOwner(filteredRepos), [filteredRepos]);
  const fullNameMap = React.useMemo(() => reposByFullName(repos), [repos]);
  const ownerKeys = React.useMemo(() => [...grouped.keys()], [grouped]);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("github") !== "linked") return;
    setCreateMode("import");
    setCreateModalOpen(true);
    setPickerOpen(true);
    params.delete("github");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  }, []);

  React.useEffect(() => {
    const openFromHash = () => {
      if (window.location.hash === "#new") {
        setCreateModalOpen(true);
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  React.useEffect(() => {
    if (!pickerOpen) return;
    let cancelled = false;
    setRepoLoading(true);
    setRepoError(null);
    void (async () => {
      try {
        const list = await fetchRepos();
        if (!cancelled) {
          setRepos(list);
          if (list.length === 0) {
            setRepoError("No repositories found.");
          }
        }
      } catch (error) {
        if (!cancelled) {
          setRepoError(error instanceof Error ? error.message : "Failed to load repositories");
        }
      } finally {
        if (!cancelled) setRepoLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pickerOpen]);

  React.useEffect(() => {
    if (selectedRepo && !filteredRepos.some((repo) => repo.id === selectedRepo.id)) {
      setSelectedRepo(null);
      setBranches([]);
      setBranch("");
    }
  }, [filteredRepos, selectedRepo]);

  const loadBranchesForRepo = React.useCallback(
    async (repo: GitHubRepo) => {
      const slashIndex = repo.fullName.indexOf("/");
      if (slashIndex === -1) return;
      const owner = repo.fullName.slice(0, slashIndex);
      const repoName = repo.fullName.slice(slashIndex + 1);
      if (!owner || !repoName) return;

      setBranchesLoading(true);
      setBranchesError(null);
      setBranch("");
      try {
        const list = await fetchBranches(owner, repoName);
        const preferredName = readPreferredBranch();
        const preferred = list.includes(preferredName)
          ? preferredName
          : list.includes("main")
            ? "main"
            : list[0] ?? "";
        setBranches(list);
        setBranch(preferred);
      } catch (error) {
        setBranches([]);
        setBranchesError(error instanceof Error ? error.message : "Failed to load branches");
      } finally {
        setBranchesLoading(false);
      }
    },
    []
  );

  const handleRepoRadioChange = React.useCallback(
    (value: string) => {
      if (!value) return;
      const repo = fullNameMap.get(value);
      if (!repo) return;
      setSelectedRepo(repo);
      void loadBranchesForRepo(repo);
    },
    [fullNameMap, loadBranchesForRepo]
  );

  const handlePickerOpenChange = (open: boolean) => {
    setPickerOpen(open);
    if (!open) {
      setSelectedRepo(null);
      setBranches([]);
      setBranch("");
      setFilter("");
      setBranchesError(null);
      setRepoError(null);
    }
  };

  const handleCreateModalOpenChange = (open: boolean) => {
    setCreateModalOpen(open);
    if (!open) {
      handlePickerOpenChange(false);
      if (window.location.hash === "#new") {
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}`
        );
      }
    }
  };

  const finishCreate = (projectId?: string) => {
    if (!projectId) {
      window.location.href = "/projects";
      return;
    }
    window.location.href = readOpenAfterCreate() ? `/projects/${projectId}` : "/projects";
  };

  const handleGitHubConnect = async () => {
    setConnectLoading(true);
    try {
      const callbackURL = `${window.location.pathname}?github=linked`;
      const response = await fetch("/api/auth/link-social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "github",
          callbackURL,
          scopes: ["repo", "user:email"]
        })
      });
      if (response.redirected) {
        window.location.href = response.url;
        return;
      }
      const location = response.headers.get("Location");
      if (location) {
        window.location.href = location;
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      showToast("GitHub linking failed. Please try again.", "error");
    } catch {
      showToast("GitHub linking failed. Please try again.", "error");
    } finally {
      setConnectLoading(false);
    }
  };

  const handleCreateFromPicker = async () => {
    if (!selectedRepo || !branch.trim()) return;
    setCreateLoading(true);
    setBranchesError(null);
    try {
      const response = await fetchWithCsrf("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedRepo.name,
          repoUrl: selectedRepo.htmlUrl,
          branch: branch.trim(),
          workspaceRootDir,
          projectRootDir,
          frameworkHint,
          previewMode,
          serverPreviewTarget,
          runtimeImageMode,
          dockerfilePath: dockerfilePath.trim() || null,
          dockerBuildTarget: dockerBuildTarget.trim() || null,
          runtimeContainerPort: Number.parseInt(runtimeContainerPort, 10),
          skipHostStrategyBuild
        })
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create project");
      }
      showToast("Project created.", "success");
      finishCreate(data.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create project";
      setBranchesError(message);
      showToast(message, "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleManualCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualName.trim() || !manualRepoUrl.trim() || !manualBranch.trim()) {
      showToast("Please fill in name, repository and branch.", "error");
      return;
    }

    setManualCreateLoading(true);
    try {
      const response = await fetchWithCsrf("/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: manualName.trim(),
          repoUrl: manualRepoUrl.trim(),
          branch: manualBranch.trim(),
          workspaceRootDir,
          projectRootDir,
          frameworkHint,
          previewMode,
          serverPreviewTarget,
          runtimeImageMode,
          dockerfilePath: dockerfilePath.trim() || null,
          dockerBuildTarget: dockerBuildTarget.trim() || null,
          runtimeContainerPort: Number.parseInt(runtimeContainerPort, 10),
          skipHostStrategyBuild
        })
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to create project");
      }
      showToast("Project created.", "success");
      finishCreate(data.id);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to create project", "error");
    } finally {
      setManualCreateLoading(false);
    }
  };

  return (
    <>
      <Dialog open={createModalOpen} onOpenChange={handleCreateModalOpenChange}>
        <DialogContent className="flex max-h-[min(90vh,52rem)] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-3 border-b border-border px-6 pb-4 pr-14 pt-6 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <DialogTitle className="text-left text-base font-semibold leading-snug sm:text-lg">
                  New project
                </DialogTitle>
                <DialogDescription className="text-left">
                  Import from GitHub or paste a repository URL.
                </DialogDescription>
              </div>
              <Badge variant={hasRepoAccess ? "default" : "secondary"} className="shrink-0 text-xs">
                {hasRepoAccess ? "GitHub ready" : githubLinked ? "Scope needed" : "No GitHub"}
              </Badge>
            </div>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <Tabs value={createMode} onValueChange={(value) => setCreateMode(value as "import" | "manual")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="import">Import</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>

            <TabsContent value="import" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <GitHubMark className="size-4 shrink-0 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {hasRepoAccess ? "Pick a repo and branch." : "Grant repo access to use the picker."}
                  </p>
                </div>
                {hasRepoAccess ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                    Choose repo
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={connectLoading}
                    onClick={() => void handleGitHubConnect()}
                  >
                    {connectLoading ? "Redirecting…" : "Grant access"}
                  </Button>
                )}
              </div>

              <div className="space-y-1 text-sm">
                <p className="text-muted-foreground">
                  <span className="text-foreground font-medium">Repo:</span>{" "}
                  <span className="truncate">{selectedRepo?.fullName ?? "—"}</span>
                </p>
                <p className="text-muted-foreground">
                  <span className="text-foreground font-medium">Branch:</span>{" "}
                  {branch || readPreferredBranch() || "—"}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-workspace-root">Workspace root</Label>
                  <Input
                    id="import-workspace-root"
                    value={workspaceRootDir}
                    onChange={(event) => setWorkspaceRootDir(event.target.value)}
                    placeholder="."
                    aria-label="Workspace root"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-project-root">Project root</Label>
                  <Input
                    id="import-project-root"
                    value={projectRootDir}
                    onChange={(event) => setProjectRootDir(event.target.value)}
                    placeholder="."
                    aria-label="Project root"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-framework-hint">Framework</Label>
                  <Select
                    value={frameworkHint}
                    onValueChange={(value) => setFrameworkHint(value as "auto" | "nextjs" | "node" | "python" | "static")}
                  >
                    <SelectTrigger id="import-framework-hint" aria-label="Framework hint">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="nextjs">Next.js</SelectItem>
                      <SelectItem value="node">Node server</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="static">Static site</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-preview-mode">Preview type</Label>
                  <Select value={previewMode} onValueChange={(value) => setPreviewMode(value as "auto" | "static" | "server")}>
                    <SelectTrigger id="import-preview-mode" aria-label="Preview type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="static">Static</SelectItem>
                      <SelectItem value="server">Server</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-server-target">Server preview target</Label>
                  <Select
                    value={serverPreviewTarget}
                    onValueChange={(value) =>
                      setServerPreviewTarget(value as "isolated-runner" | "trusted-local-docker")
                    }
                  >
                    <SelectTrigger id="import-server-target" aria-label="Server preview target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="isolated-runner">Isolated runner</SelectItem>
                      <SelectItem value="trusted-local-docker">Trusted local Docker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="import-runtime-image-mode">Runtime image mode</Label>
                  <Select
                    value={runtimeImageMode}
                    onValueChange={(value) => setRuntimeImageMode(value as "auto" | "platform" | "dockerfile")}
                  >
                    <SelectTrigger id="import-runtime-image-mode" aria-label="Runtime image mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="platform">Platform image</SelectItem>
                      <SelectItem value="dockerfile">Repo Dockerfile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="import-dockerfile-path">Dockerfile path</Label>
                    <Input
                      id="import-dockerfile-path"
                      value={dockerfilePath}
                      onChange={(event) => setDockerfilePath(event.target.value)}
                      placeholder="Dockerfile"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="import-docker-target">Docker target</Label>
                    <Input
                      id="import-docker-target"
                      value={dockerBuildTarget}
                      onChange={(event) => setDockerBuildTarget(event.target.value)}
                      placeholder="runner"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="import-runtime-port">Runtime port</Label>
                    <Input
                      id="import-runtime-port"
                      type="number"
                      min="1"
                      max="65535"
                      value={runtimeContainerPort}
                      onChange={(event) => setRuntimeContainerPort(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="import-host-build">Build path</Label>
                    <Select
                      value={skipHostStrategyBuild ? "skip" : "build"}
                      onValueChange={(value) => setSkipHostStrategyBuild(value === "skip")}
                    >
                      <SelectTrigger id="import-host-build" aria-label="Build path">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="build">Run host build</SelectItem>
                        <SelectItem value="skip">Dockerfile only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use <code>workspaceRootDir</code> for install/lockfiles and <code>projectRootDir</code> for the app itself. Dockerfile-only mode is server-only.
                </p>
              </div>
            </TabsContent>

            <TabsContent value="manual" className="mt-4">
              <form className="flex flex-col gap-4" onSubmit={(event) => void handleManualCreate(event)}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-name">Name</Label>
                  <Input
                    id="project-name"
                    name="project-name"
                    type="text"
                    autoComplete="off"
                    placeholder="my-app"
                    value={manualName}
                    onChange={(event) => setManualName(event.target.value)}
                    required
                    aria-label="Project name"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="repo-url">Repository URL</Label>
                  <Input
                    id="repo-url"
                    name="repo-url"
                    type="url"
                    autoComplete="off"
                    inputMode="url"
                    spellCheck={false}
                    placeholder="https://github.com/owner/repo"
                    value={manualRepoUrl}
                    onChange={(event) => setManualRepoUrl(event.target.value)}
                    required
                    aria-label="GitHub repository URL"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="project-branch">Branch</Label>
                  <Input
                    id="project-branch"
                    name="project-branch"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="main"
                    value={manualBranch}
                    onChange={(event) => setManualBranch(event.target.value)}
                    required
                    aria-label="Branch to deploy"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-workspace-root">Workspace root</Label>
                  <Input
                    id="manual-workspace-root"
                    name="manual-workspace-root"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="."
                    value={workspaceRootDir}
                    onChange={(event) => setWorkspaceRootDir(event.target.value)}
                    aria-label="Workspace root"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-project-root">Project root</Label>
                  <Input
                    id="manual-project-root"
                    name="manual-project-root"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="."
                    value={projectRootDir}
                    onChange={(event) => setProjectRootDir(event.target.value)}
                    aria-label="Project root"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-framework-hint">Framework</Label>
                  <Select
                    value={frameworkHint}
                    onValueChange={(value) => setFrameworkHint(value as "auto" | "nextjs" | "node" | "python" | "static")}
                  >
                    <SelectTrigger id="manual-framework-hint" aria-label="Framework hint">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="nextjs">Next.js</SelectItem>
                      <SelectItem value="node">Node server</SelectItem>
                      <SelectItem value="python">Python</SelectItem>
                      <SelectItem value="static">Static site</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-preview-mode">Preview type</Label>
                  <Select value={previewMode} onValueChange={(value) => setPreviewMode(value as "auto" | "static" | "server")}>
                    <SelectTrigger id="manual-preview-mode" aria-label="Preview type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto-detect</SelectItem>
                      <SelectItem value="static">Static</SelectItem>
                      <SelectItem value="server">Server</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-runtime-image-mode">Runtime image mode</Label>
                  <Select
                    value={runtimeImageMode}
                    onValueChange={(value) => setRuntimeImageMode(value as "auto" | "platform" | "dockerfile")}
                  >
                    <SelectTrigger id="manual-runtime-image-mode" aria-label="Runtime image mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      <SelectItem value="platform">Platform image</SelectItem>
                      <SelectItem value="dockerfile">Repo Dockerfile</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="manual-dockerfile-path">Dockerfile path</Label>
                    <Input
                      id="manual-dockerfile-path"
                      value={dockerfilePath}
                      onChange={(event) => setDockerfilePath(event.target.value)}
                      placeholder="Dockerfile"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="manual-docker-target">Docker target</Label>
                    <Input
                      id="manual-docker-target"
                      value={dockerBuildTarget}
                      onChange={(event) => setDockerBuildTarget(event.target.value)}
                      placeholder="runner"
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="manual-runtime-port">Runtime port</Label>
                    <Input
                      id="manual-runtime-port"
                      type="number"
                      min="1"
                      max="65535"
                      value={runtimeContainerPort}
                      onChange={(event) => setRuntimeContainerPort(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="manual-host-build">Build path</Label>
                    <Select
                      value={skipHostStrategyBuild ? "skip" : "build"}
                      onValueChange={(value) => setSkipHostStrategyBuild(value === "skip")}
                    >
                      <SelectTrigger id="manual-host-build" aria-label="Build path">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="build">Run host build</SelectItem>
                        <SelectItem value="skip">Dockerfile only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="manual-server-target">Server preview target</Label>
                  <Select
                    value={serverPreviewTarget}
                    onValueChange={(value) =>
                      setServerPreviewTarget(value as "isolated-runner" | "trusted-local-docker")
                    }
                  >
                    <SelectTrigger id="manual-server-target" aria-label="Server preview target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="isolated-runner">Isolated runner</SelectItem>
                      <SelectItem value="trusted-local-docker">Trusted local Docker</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-xs text-muted-foreground">
                  Point pdploy at the actual app directory when the repository contains multiple apps or docs at the root.
                </p>

                <Button type="submit" disabled={manualCreateLoading}>
                  {manualCreateLoading ? "Creating…" : "Create"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pickerOpen} onOpenChange={handlePickerOpenChange}>
        <DialogContent className="z-100 grid max-h-[85vh] w-full max-w-3xl grid-rows-[auto_auto_minmax(0,1fr)_auto_auto] gap-0 overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 px-6 pb-2 pt-6 text-center sm:text-center">
            <DialogTitle className="text-xl font-semibold">Choose Repository</DialogTitle>
            <DialogDescription className="text-pretty text-center">
              Pick a GitHub repository, then confirm the branch before creating the project.
            </DialogDescription>
            <div className="flex items-center justify-center gap-2 pt-2 text-sm text-foreground" aria-live="polite">
              <GitHubMark />
              <span className="font-medium">{selectedRepo?.fullName ?? "No repository selected"}</span>
            </div>
          </DialogHeader>

          <div className="shrink-0 px-6 py-3">
            <Label htmlFor="github-repo-search" className="sr-only">
              Filter repositories
            </Label>
            <Input
              id="github-repo-search"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Filter by owner or name…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter GitHub repositories"
            />
          </div>

          <div className="flex min-h-0 flex-col overflow-hidden border-t border-border">
            {repoLoading ? (
              <p className="shrink-0 px-6 py-6 text-center text-sm text-muted-foreground">Loading repositories…</p>
            ) : null}
            {repoError ? (
              <p className="shrink-0 px-6 py-4 text-center text-sm text-destructive">{repoError}</p>
            ) : null}
            {!repoLoading && !repoError && filteredRepos.length === 0 ? (
              <p className="shrink-0 px-6 py-6 text-center text-sm text-muted-foreground">
                No repositories match your search.
              </p>
            ) : null}

            {filteredRepos.length > 0 ? (
              <div
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain scroll-smooth outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                tabIndex={0}
                role="region"
                aria-label="GitHub repositories by owner"
              >
                <RadioGroup
                  value={selectedRepo?.fullName}
                  onValueChange={handleRepoRadioChange}
                  className="gap-0 pb-2"
                >
                  {ownerKeys.map((owner) => (
                    <OwnerRepoGroup key={owner} owner={owner} repos={grouped.get(owner) ?? []} />
                  ))}
                </RadioGroup>
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2 border-t border-border px-6 py-4">
            <Label htmlFor="github-branch-deploy">Branch To Deploy</Label>
            {branchesLoading ? (
              <p className="text-sm text-muted-foreground">Loading branches…</p>
            ) : (
              <Select value={branch || undefined} onValueChange={setBranch} disabled={!selectedRepo || branches.length === 0}>
                <SelectTrigger id="github-branch-deploy" aria-label="Branch to deploy">
                  <SelectValue placeholder={selectedRepo ? "Select branch" : "Select a repository first"} />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branchName) => (
                    <SelectItem key={branchName} value={branchName}>
                      {branchName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {branchesError ? <p className="text-sm text-destructive">{branchesError}</p> : null}
          </div>

          <DialogFooter className="shrink-0 flex-row items-center justify-between gap-3 border-t border-border px-6 py-4 sm:justify-between sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => handlePickerOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={!selectedRepo || !branch || createLoading} onClick={() => void handleCreateFromPicker()}>
              {createLoading ? "Creating…" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
