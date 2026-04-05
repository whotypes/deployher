import * as React from "react";
import { Check, ChevronRight, CircleHelp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { GitHubMark } from "@/ui/GitHubMark";
import { fetchWithCsrf } from "./fetchWithCsrf";
import type { RepoScanHintsPayload, RepoScanPrimaryFramework } from "./repoScanHintsTypes";

type OwnerRepoGroupProps = {
  owner: string;
  repos: GitHubRepo[];
  renderRepoTrailing?: (repo: GitHubRepo) => React.ReactNode;
};

const RepoFrameworkGlyph = ({
  repo,
  selectedRepo,
  hintsLoading,
  hintsError,
  hints
}: {
  repo: GitHubRepo;
  selectedRepo: GitHubRepo | null;
  hintsLoading: boolean;
  hintsError: string | null;
  hints: RepoScanHintsPayload | null;
}) => {
  if (!selectedRepo || repo.fullName !== selectedRepo.fullName) {
    return null;
  }
  if (hintsLoading) {
    return <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-label="Scanning repository" />;
  }
  if (hintsError) {
    return (
      <span title={hintsError}>
        <CircleHelp className="text-destructive size-4 shrink-0" aria-label={`Scan failed: ${hintsError}`} />
      </span>
    );
  }
  if (!hints) {
    return null;
  }
  const fw = hints.primaryFramework;
  if (fw) {
    return <FrameworkLogoThumb fw={fw} title={fw.name} />;
  }
  return (
    <span title="No matching framework preset for this path">
      <CircleHelp className="text-destructive size-4 shrink-0" aria-label="Framework unknown" />
    </span>
  );
};

const FrameworkLogoThumb = ({ fw, title }: { fw: RepoScanPrimaryFramework; title: string }) => (
  <span
    className="border-border/60 relative inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background p-0.5"
    title={title}
  >
    {fw.darkModeLogo ? (
      <>
        <img
          src={fw.logo}
          alt={fw.name}
          width={22}
          height={22}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="size-[22px] object-contain dark:hidden"
        />
        <img
          src={fw.darkModeLogo}
          alt=""
          width={22}
          height={22}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="hidden size-[22px] object-contain dark:block"
          aria-hidden
        />
      </>
    ) : (
      <img
        src={fw.logo}
        alt={fw.name}
        width={22}
        height={22}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="size-[22px] object-contain"
      />
    )}
  </span>
);

const OwnerRepoGroup = ({ owner, repos, renderRepoTrailing }: OwnerRepoGroupProps) => {
  const [open, setOpen] = React.useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Separator />
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 py-3 pl-3 pr-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <div className="flex items-center gap-3 py-2.5 pl-9 pr-3">
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
              <div className="flex min-w-7 shrink-0 items-center justify-end">{renderRepoTrailing?.(repo)}</div>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
};

export type NewProjectPageClientProps = {
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
    el.className = "fixed top-17 right-4 z-50 hidden rounded-md px-4 py-3 text-sm font-medium shadow-lg";
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

type StepDef = { id: string; label: string };

const STEPS: StepDef[] = [
  { id: "source", label: "Source" },
  { id: "paths", label: "Paths" },
  { id: "build", label: "Build & preview" }
];

const SetupStepRail = ({
  activeIndex,
  completedThrough
}: {
  activeIndex: number;
  completedThrough: number;
}) => {
  const progressPct = Math.round(((completedThrough + 1) / STEPS.length) * 100);
  return (
    <div className="mb-8 space-y-4">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3" role="list" aria-label="Setup steps">
        {STEPS.map((step, i) => {
          const done = i < completedThrough;
          const current = i === activeIndex;
          return (
            <React.Fragment key={step.id}>
              {i > 0 ? (
                <div
                  className={cn(
                    "hidden h-px w-6 shrink-0 sm:block",
                    i <= completedThrough ? "bg-primary/50" : "bg-border"
                  )}
                  aria-hidden
                />
              ) : null}
              <div
                role="listitem"
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  done && "border-primary/40 bg-primary/10 text-primary",
                  current && !done && "border-primary bg-primary/5 text-foreground",
                  !current && !done && "border-border text-muted-foreground"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-[10px]",
                    done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                  aria-hidden
                >
                  {done ? <Check className="size-3.5" strokeWidth={2.5} /> : i + 1}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">{step.label.split(" ")[0]}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <Progress value={progressPct} className="h-1.5" aria-label="Setup progress" />
    </div>
  );
};

export const NewProjectPageClient = ({ hasRepoAccess, githubLinked }: NewProjectPageClientProps) => {
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
  const [serverPreviewTarget, setServerPreviewTarget] = React.useState<"isolated-runner">("isolated-runner");
  const [runtimeImageMode, setRuntimeImageMode] = React.useState<"auto" | "platform" | "dockerfile">("auto");
  const [dockerfilePath, setDockerfilePath] = React.useState("");
  const [dockerBuildTarget, setDockerBuildTarget] = React.useState("");
  const [runtimeContainerPort, setRuntimeContainerPort] = React.useState("3000");
  const [skipHostStrategyBuild, setSkipHostStrategyBuild] = React.useState(false);
  const [repoHints, setRepoHints] = React.useState<RepoScanHintsPayload | null>(null);
  const [repoHintsLoading, setRepoHintsLoading] = React.useState(false);
  const [repoHintsError, setRepoHintsError] = React.useState<string | null>(null);

  const filteredRepos = React.useMemo(() => filterReposByQuery(repos, deferredFilter), [repos, deferredFilter]);
  const grouped = React.useMemo(() => groupReposByOwner(filteredRepos), [filteredRepos]);
  const fullNameMap = React.useMemo(() => reposByFullName(repos), [repos]);
  const ownerKeys = React.useMemo(() => [...grouped.keys()], [grouped]);

  const manualBasicsReady =
    manualName.trim().length > 0 && manualRepoUrl.trim().length > 0 && manualBranch.trim().length > 0;
  const importFlowReady = Boolean(selectedRepo && branch.trim());
  const completedThrough =
    createMode === "import"
      ? importFlowReady
        ? 2
        : selectedRepo
          ? 1
          : 0
      : manualBasicsReady
        ? 2
        : manualName.trim() || manualRepoUrl.trim()
          ? 1
          : 0;
  const activeIndex = completedThrough >= 2 ? 2 : completedThrough;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("github") !== "linked") return;
    setCreateMode("import");
    params.delete("github");
    const query = params.toString();
    window.history.replaceState({}, "", window.location.pathname + (query ? `?${query}` : ""));
  }, []);

  React.useEffect(() => {
    if (!hasRepoAccess) return;
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
  }, [hasRepoAccess]);

  React.useEffect(() => {
    if (createMode !== "import" || !hasRepoAccess || !selectedRepo || !branch.trim()) {
      setRepoHints(null);
      setRepoHintsError(null);
      setRepoHintsLoading(false);
      return;
    }
    const slashIndex = selectedRepo.fullName.indexOf("/");
    if (slashIndex === -1) return;
    const owner = selectedRepo.fullName.slice(0, slashIndex);
    const repoName = selectedRepo.fullName.slice(slashIndex + 1);
    if (!owner || !repoName) return;

    setRepoHints(null);
    setRepoHintsError(null);
    setRepoHintsLoading(true);

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        setRepoHintsError(null);
        try {
          const params = new URLSearchParams({
            owner,
            repo: repoName,
            ref: branch.trim(),
            projectRoot: projectRootDir.trim() === "" ? "." : projectRootDir.trim()
          });
          const response = await fetch("/api/github/repo-hints?" + params.toString(), {
            headers: { Accept: "application/json" }
          });
          const data = (await response.json().catch(() => ({}))) as RepoScanHintsPayload & {
            error?: string;
          };
          if (!response.ok) {
            throw new Error(data.error ?? "Could not inspect the repository");
          }
          if (!cancelled) {
            setRepoHints({
              ...data,
              primaryFramework: data.primaryFramework ?? null
            });
          }
        } catch (error) {
          if (!cancelled) {
            setRepoHints(null);
            setRepoHintsError(error instanceof Error ? error.message : "Repository inspection failed");
          }
        } finally {
          if (!cancelled) {
            setRepoHintsLoading(false);
          }
        }
      })();
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [createMode, hasRepoAccess, selectedRepo, branch, projectRootDir]);

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

  const finishCreate = (projectId?: string) => {
    if (!projectId) {
      window.location.href = "/projects";
      return;
    }
    window.location.href = readOpenAfterCreate() ? `/projects/${projectId}` : "/projects";
  };

  const handleApplyRepoHints = () => {
    if (!repoHints) return;
    setFrameworkHint(repoHints.suggestedFrameworkHint);
    setPreviewMode(repoHints.suggestedPreviewMode);
  };

  const handleGitHubConnect = async () => {
    setConnectLoading(true);
    try {
      const callbackURL = `${window.location.pathname}?github=linked`;
      const response = await fetch("/api/auth/link-social", {
        method: "POST",
        credentials: "include",
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

  const handleImportCreate = async () => {
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

  const buildOptionsCard = (
    <Card className="dashboard-surface border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Build &amp; preview</CardTitle>
        <CardDescription>
          Auto uses the GitHub scan below. Pick a preset only when detection is wrong.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {createMode === "import" && hasRepoAccess && selectedRepo && branch.trim() && !repoHintsLoading && repoHints ? (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="text-foreground font-medium">GitHub scan</span>
            {repoHints.primaryFramework ? (
              <>
                <FrameworkLogoThumb fw={repoHints.primaryFramework} title={repoHints.primaryFramework.name} />
                <span className="text-foreground">{repoHints.primaryFramework.name}</span>
                {repoHints.primaryFramework.detectedVersion ? (
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {repoHints.primaryFramework.detectedVersion}
                  </Badge>
                ) : null}
                <span className="text-muted-foreground">suggested {repoHints.suggestedFrameworkHint}</span>
              </>
            ) : repoHints.packageJsonFound ? (
              <span>No Vercel-style preset match; try another project root or set Framework manually.</span>
            ) : (
              <span>No package.json at this path.</span>
            )}
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-framework-hint">Framework hint</Label>
            <Select
              value={frameworkHint}
              onValueChange={(value) => setFrameworkHint(value as "auto" | "nextjs" | "node" | "python" | "static")}
            >
              <SelectTrigger id="np-framework-hint" aria-label="Framework hint">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (from scan)</SelectItem>
                <SelectItem value="nextjs">Next.js</SelectItem>
                <SelectItem value="node">Node</SelectItem>
                <SelectItem value="python">Python</SelectItem>
                <SelectItem value="static">Static</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-preview-mode">Preview</Label>
            <Select value={previewMode} onValueChange={(value) => setPreviewMode(value as "auto" | "static" | "server")}>
              <SelectTrigger id="np-preview-mode" aria-label="Preview type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (from scan)</SelectItem>
                <SelectItem value="static">Static</SelectItem>
                <SelectItem value="server">Server</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-server-target">Server preview target</Label>
            <Select
              value={serverPreviewTarget}
              onValueChange={(value) => setServerPreviewTarget(value as "isolated-runner")}
            >
              <SelectTrigger id="np-server-target" aria-label="Server preview target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="isolated-runner">Isolated runner</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-runtime-image-mode">Runtime image mode</Label>
            <Select
              value={runtimeImageMode}
              onValueChange={(value) => setRuntimeImageMode(value as "auto" | "platform" | "dockerfile")}
            >
              <SelectTrigger id="np-runtime-image-mode" aria-label="Runtime image mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (match project)</SelectItem>
                <SelectItem value="platform">Platform image</SelectItem>
                <SelectItem value="dockerfile">Repo Dockerfile</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-dockerfile-path">Dockerfile path</Label>
            <Input
              id="np-dockerfile-path"
              value={dockerfilePath}
              onChange={(event) => setDockerfilePath(event.target.value)}
              placeholder="Dockerfile"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-docker-target">Docker target</Label>
            <Input
              id="np-docker-target"
              value={dockerBuildTarget}
              onChange={(event) => setDockerBuildTarget(event.target.value)}
              placeholder="runner"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-runtime-port">Runtime port</Label>
            <Input
              id="np-runtime-port"
              type="number"
              min={1}
              max={65535}
              value={runtimeContainerPort}
              onChange={(event) => setRuntimeContainerPort(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="np-host-build">Build path</Label>
            <Select
              value={skipHostStrategyBuild ? "skip" : "build"}
              onValueChange={(value) => setSkipHostStrategyBuild(value === "skip")}
            >
              <SelectTrigger id="np-host-build" aria-label="Build path">
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
          Workspace root = install context; project root = app. Dockerfile-only skips host build (server previews).
        </p>
      </CardContent>
    </Card>
  );

  return (
    <>
      <SetupStepRail activeIndex={activeIndex} completedThrough={completedThrough} />

      <div className="min-w-0 space-y-6">
        <Tabs value={createMode} onValueChange={(value) => setCreateMode(value as "import" | "manual")}>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="import">From GitHub</TabsTrigger>
            <TabsTrigger value="manual">Manual URL</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-6 space-y-6 outline-none">
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleImportCreate();
              }}
            >
              <Card className="dashboard-surface border-border/80 shadow-sm">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 pb-3">
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-base">Repository</CardTitle>
                    <CardDescription>
                      {hasRepoAccess
                        ? "Choose a repo, then a branch. Icons show the GitHub scan for the selected row."
                        : "Link GitHub with repo scope to list repositories."}
                    </CardDescription>
                  </div>
                  <Badge variant={hasRepoAccess ? "default" : "secondary"} className="shrink-0 text-xs">
                    {hasRepoAccess ? "GitHub ready" : githubLinked ? "Scope needed" : "No GitHub"}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!hasRepoAccess ? (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      className="gap-2"
                      disabled={connectLoading}
                      onClick={() => void handleGitHubConnect()}
                    >
                      <GitHubMark className="size-4" />
                      {connectLoading ? "Redirecting…" : "Connect GitHub"}
                    </Button>
                  ) : null}

                  {hasRepoAccess ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="np-repo-search">Find a repository</Label>
                        <Input
                          id="np-repo-search"
                          type="search"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Filter by owner or name…"
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                          aria-label="Filter GitHub repositories"
                        />
                      </div>

                      <div className="rounded-lg border border-border/80 bg-muted/5">
                        {repoLoading ? (
                          <p className="p-6 text-center text-sm text-muted-foreground">Loading repositories…</p>
                        ) : null}
                        {repoError ? (
                          <p className="p-4 text-center text-sm text-destructive">{repoError}</p>
                        ) : null}
                        {!repoLoading && !repoError && filteredRepos.length === 0 ? (
                          <p className="p-6 text-center text-sm text-muted-foreground">
                            No repositories match your search.
                          </p>
                        ) : null}
                        {filteredRepos.length > 0 ? (
                          <ScrollArea className="h-[min(20rem,45vh)]">
                            <RadioGroup
                              value={selectedRepo?.fullName}
                              onValueChange={handleRepoRadioChange}
                              className="gap-0"
                              aria-label="GitHub repositories"
                            >
                              {ownerKeys.map((owner) => (
                                <OwnerRepoGroup
                                  key={owner}
                                  owner={owner}
                                  repos={grouped.get(owner) ?? []}
                                  renderRepoTrailing={(repo) => (
                                    <RepoFrameworkGlyph
                                      repo={repo}
                                      selectedRepo={selectedRepo}
                                      hintsLoading={repoHintsLoading}
                                      hintsError={repoHintsError}
                                      hints={repoHints}
                                    />
                                  )}
                                />
                              ))}
                            </RadioGroup>
                          </ScrollArea>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="np-branch-deploy">
                          Branch to deploy
                          {selectedRepo ? <span className="text-destructive"> *</span> : null}
                        </Label>
                        {branchesLoading ? (
                          <p className="text-sm text-muted-foreground">Loading branches…</p>
                        ) : (
                          <Select
                            value={branch || undefined}
                            onValueChange={setBranch}
                            disabled={!selectedRepo || branches.length === 0}
                            required={Boolean(selectedRepo && branches.length > 0)}
                          >
                            <SelectTrigger
                              id="np-branch-deploy"
                              aria-label="Branch to deploy"
                              aria-required={Boolean(selectedRepo)}
                            >
                              <SelectValue
                                placeholder={selectedRepo ? "Select branch" : "Select a repository first"}
                              />
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

                      {selectedRepo && branch.trim() && repoHints && !repoHintsLoading ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" variant="outline" size="sm" onClick={handleApplyRepoHints}>
                              Use scanned framework &amp; preview
                            </Button>
                          </div>
                          {repoHints.warnings.length > 0 ? (
                            <ul className="text-muted-foreground list-inside list-disc space-y-1 text-xs">
                              {repoHints.warnings.map((w) => (
                                <li key={w}>{w}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="dashboard-surface border-border/80 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Monorepo paths</CardTitle>
                  <CardDescription>Lockfiles vs app folder (use . for single-package repos).</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-workspace-root">
                      Workspace root<span className="text-destructive"> *</span>
                    </Label>
                    <Input
                      id="np-workspace-root"
                      value={workspaceRootDir}
                      onChange={(event) => setWorkspaceRootDir(event.target.value)}
                      placeholder="."
                      required
                      aria-label="Workspace root"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-project-root">
                      Project root<span className="text-destructive"> *</span>
                    </Label>
                    <Input
                      id="np-project-root"
                      value={projectRootDir}
                      onChange={(event) => setProjectRootDir(event.target.value)}
                      placeholder="."
                      required
                      aria-label="Project root"
                    />
                  </div>
                </CardContent>
              </Card>

              {buildOptionsCard}

              <div className="border-border bg-card/80 flex flex-col gap-3 rounded-xl border p-4 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" asChild className="justify-center sm:justify-start">
                  <a href="/projects">Cancel</a>
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="gap-2 shadow-md"
                  disabled={!selectedRepo || !branch.trim() || createLoading}
                >
                  {createLoading ? "Creating…" : "Create project"}
                </Button>
              </div>
            </form>
          </TabsContent>

            <TabsContent value="manual" className="mt-6 space-y-6 outline-none">
              <Card className="dashboard-surface border-border/80 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Repository details</CardTitle>
                  <CardDescription>Use any GitHub URL you can push to. Branch must exist on the remote.</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="flex flex-col gap-4" onSubmit={(event) => void handleManualCreate(event)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="np-project-name">
                          Project name<span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-project-name"
                          autoComplete="off"
                          placeholder="my-app"
                          value={manualName}
                          onChange={(event) => setManualName(event.target.value)}
                          required
                          aria-label="Project name"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="np-repo-url">
                          Repository URL<span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-repo-url"
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
                        <Label htmlFor="np-manual-branch">
                          Branch<span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-manual-branch"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="main"
                          value={manualBranch}
                          onChange={(event) => setManualBranch(event.target.value)}
                          required
                          aria-label="Branch to deploy"
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="np-manual-workspace-root">
                          Workspace root<span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-manual-workspace-root"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="."
                          value={workspaceRootDir}
                          onChange={(event) => setWorkspaceRootDir(event.target.value)}
                          required
                          aria-label="Workspace root"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="np-manual-project-root">
                          Project root<span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-manual-project-root"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="."
                          value={projectRootDir}
                          onChange={(event) => setProjectRootDir(event.target.value)}
                          required
                          aria-label="Project root"
                        />
                      </div>
                    </div>

                    {buildOptionsCard}

                    <Button type="submit" disabled={manualCreateLoading} className="w-full sm:w-auto">
                      {manualCreateLoading ? "Creating…" : "Create project"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
      </div>
    </>
  );
};
