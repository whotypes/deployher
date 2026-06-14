import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, CircleHelp, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useSearchParams } from "@/spa/routerCompat";
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
import {
  isAncestorOrEqualPath,
  normalizeRepoRelativePathString,
  parseRuntimePortInput
} from "@/lib/repoRelativePath";
import { readOpenAfterCreate, readPreferredBranch, readProjectsCreateModeInitial } from "@/lib/userUiPrefs";
import { cn } from "@/lib/utils";
import { GitHubMark } from "@/ui/GitHubMark";
import { fetchWithCsrf } from "./fetchWithCsrf";
import { showPageToast } from "./pageNotifications";
import { NewProjectPathExplorer } from "./NewProjectPathExplorer";
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
  const { t } = useTranslation();
  if (!selectedRepo || repo.fullName !== selectedRepo.fullName) {
    return null;
  }
  if (hintsLoading) {
    return (
      <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-label={t("newProject.scanningRepo")} />
    );
  }
  if (hintsError) {
    return (
      <span title={hintsError}>
        <CircleHelp
          className="text-destructive size-4 shrink-0"
          aria-label={t("newProject.scanFailed", { message: hintsError })}
        />
      </span>
    );
  }
  if (!hints) {
    return null;
  }
  const fw = hints.primaryFramework;
  if (fw) {
    return (
      <span className="flex min-w-0 max-w-40 items-center gap-1.5">
        <FrameworkLogoThumb fw={fw} title={fw.name} pixelSize={22} />
        <span className="text-foreground truncate text-xs font-medium">{fw.name}</span>
      </span>
    );
  }
  return (
    <span title={t("newProject.noFrameworkPreset")}>
      <CircleHelp className="text-destructive size-4 shrink-0" aria-label={t("newProject.frameworkUnknown")} />
    </span>
  );
};

const FrameworkLogoThumb = ({
  fw,
  title,
  pixelSize = 22
}: {
  fw: RepoScanPrimaryFramework;
  title: string;
  pixelSize?: number;
}) => (
  <span
    className="border-border/60 relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background p-0.5"
    style={{ width: pixelSize + 6, height: pixelSize + 6 }}
    title={title}
  >
    {fw.darkModeLogo ? (
      <>
        <img
          src={fw.logo}
          alt={fw.name}
          width={pixelSize}
          height={pixelSize}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="object-contain dark:hidden"
          style={{ width: pixelSize, height: pixelSize }}
        />
        <img
          src={fw.darkModeLogo}
          alt=""
          width={pixelSize}
          height={pixelSize}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="hidden object-contain dark:block"
          style={{ width: pixelSize, height: pixelSize }}
          aria-hidden
        />
      </>
    ) : (
      <img
        src={fw.logo}
        alt={fw.name}
        width={pixelSize}
        height={pixelSize}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="object-contain"
        style={{ width: pixelSize, height: pixelSize }}
      />
    )}
  </span>
);

const OwnerRepoGroup = ({ owner, repos, renderRepoTrailing }: OwnerRepoGroupProps) => {
  const { t } = useTranslation();
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
                  {repo.private ? t("newProject.repoPrivate") : t("newProject.repoPublic")}
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

const fetchRepos = async (fallbackError: string): Promise<GitHubRepo[]> => {
  const response = await fetch("/api/github/repos", { headers: { Accept: "application/json" } });
  const data = (await response.json().catch(() => ({}))) as { repos?: GitHubRepo[]; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? fallbackError);
  }
  if (!Array.isArray(data.repos)) return [];
  return data.repos.map((row) => {
    const db = row.defaultBranch?.trim();
    return {
      ...row,
      defaultBranch: db && db.length > 0 ? db : "main"
    };
  });
};

const fetchBranches = async (owner: string, repo: string, fallbackError: string): Promise<string[]> => {
  const params = new URLSearchParams({ owner, repo });
  const response = await fetch("/api/github/branches?" + params.toString(), {
    headers: { Accept: "application/json" }
  });
  const data = (await response.json().catch(() => ({}))) as { branches?: string[]; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? fallbackError);
  }
  return Array.isArray(data.branches) ? data.branches : [];
};

type StepDef = { id: string; label: string; shortLabel: string };

const SetupStepRail = ({
  activeIndex,
  completedThrough
}: {
  activeIndex: number;
  completedThrough: number;
}) => {
  const { t } = useTranslation();
  const steps = React.useMemo<StepDef[]>(
    () => [
      { id: "source", label: t("newProject.steps.source"), shortLabel: t("newProject.stepsShort.source") },
      { id: "paths", label: t("newProject.steps.paths"), shortLabel: t("newProject.stepsShort.paths") },
      { id: "build", label: t("newProject.steps.build"), shortLabel: t("newProject.stepsShort.build") }
    ],
    [t]
  );
  const progressPct = Math.round(((completedThrough + 1) / steps.length) * 100);
  return (
      <div className="mb-10 space-y-5">
      <div className="flex flex-wrap items-center gap-2 sm:gap-3" role="list" aria-label={t("newProject.stepsAria")}>
        {steps.map((step, i) => {
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
                    "flex items-center gap-2.5 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors",
                    done && "border-primary/45 bg-primary/12 text-primary",
                    current && !done && "border-primary bg-primary/8 text-foreground shadow-[inset_0_1px_0_0_color-mix(in_oklab,var(--primary)_22%,transparent)]",
                    !current && !done && "border-border text-muted-foreground"
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-xs font-semibold",
                      done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    )}
                    aria-hidden
                  >
                    {done ? <Check className="size-4" strokeWidth={2.5} /> : i + 1}
                  </span>
                <span className="hidden sm:inline">{step.label}</span>
                <span className="sm:hidden">{step.shortLabel}</span>
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <Progress value={progressPct} className="h-2" aria-label={t("newProject.progressAria")} />
    </div>
  );
};

export const NewProjectPageClient = ({ hasRepoAccess, githubLinked }: NewProjectPageClientProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routerLocation = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
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

  const refForHints = React.useMemo(() => {
    if (!selectedRepo) return "";
    const chosen = branch.trim();
    if (chosen) return chosen;
    const db = selectedRepo.defaultBranch.trim();
    return db || "main";
  }, [selectedRepo, branch]);

  const filteredRepos = React.useMemo(() => filterReposByQuery(repos, deferredFilter), [repos, deferredFilter]);
  const grouped = React.useMemo(() => groupReposByOwner(filteredRepos), [filteredRepos]);
  const fullNameMap = React.useMemo(() => reposByFullName(repos), [repos]);
  const ownerKeys = React.useMemo(() => [...grouped.keys()], [grouped]);

  const manualBasicsReady =
    manualName.trim().length > 0 && manualRepoUrl.trim().length > 0 && manualBranch.trim().length > 0;
  const normalizedWorkspace = React.useMemo(
    () => normalizeRepoRelativePathString(workspaceRootDir),
    [workspaceRootDir]
  );
  const normalizedProject = React.useMemo(
    () => normalizeRepoRelativePathString(projectRootDir),
    [projectRootDir]
  );
  const rootsValid =
    normalizedWorkspace !== null &&
    normalizedProject !== null &&
    isAncestorOrEqualPath(normalizedWorkspace, normalizedProject);
  const portParsed = React.useMemo(() => parseRuntimePortInput(runtimeContainerPort), [runtimeContainerPort]);
  const portValid = portParsed.ok;
  const importFlowReady = Boolean(selectedRepo && branch.trim());
  const importCanSubmit = Boolean(
    selectedRepo && branch.trim() && rootsValid && portValid
  );
  const manualCanSubmit = manualBasicsReady && rootsValid && portValid;
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
    if (searchParams.get("github") !== "linked") return;
    setCreateMode("import");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("github");
        return next;
      },
      { replace: true }
    );
  }, [searchParams, setSearchParams]);

  React.useEffect(() => {
    if (!hasRepoAccess) return;
    let cancelled = false;
    setRepoLoading(true);
    setRepoError(null);
    void (async () => {
      try {
        const list = await fetchRepos(t("newProject.loadReposFailed"));
        if (!cancelled) {
          setRepos(list);
          if (list.length === 0) {
            setRepoError(t("newProject.noRepos"));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setRepoError(error instanceof Error ? error.message : t("newProject.loadReposFailed"));
        }
      } finally {
        if (!cancelled) setRepoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasRepoAccess, t]);

  React.useEffect(() => {
    if (createMode !== "import" || !hasRepoAccess || !selectedRepo || !refForHints) {
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
            ref: refForHints,
            projectRoot: projectRootDir.trim() === "" ? "." : projectRootDir.trim()
          });
          const response = await fetch("/api/github/repo-hints?" + params.toString(), {
            headers: { Accept: "application/json" }
          });
          const data = (await response.json().catch(() => ({}))) as RepoScanHintsPayload & {
            error?: string;
          };
          if (!response.ok) {
            throw new Error(data.error ?? t("newProject.inspectFailed"));
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
            setRepoHintsError(error instanceof Error ? error.message : t("newProject.inspectError"));
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
  }, [createMode, hasRepoAccess, selectedRepo, refForHints, projectRootDir, t]);

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
        const list = await fetchBranches(owner, repoName, t("newProject.loadBranchesFailed"));
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
        setBranchesError(error instanceof Error ? error.message : t("newProject.loadBranchesFailed"));
      } finally {
        setBranchesLoading(false);
      }
    },
    [t]
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

  const finishCreate = React.useCallback(
    (projectId?: string) => {
      void queryClient.invalidateQueries({ queryKey: ["workspace-shell"] });
      if (!projectId) {
        navigate("/projects");
        return;
      }
      navigate(readOpenAfterCreate() ? `/projects/${projectId}` : "/projects");
    },
    [navigate, queryClient]
  );

  React.useEffect(() => {
    if (createMode !== "import") return;
    if (!repoHints || repoHintsLoading) return;
    setFrameworkHint(repoHints.suggestedFrameworkHint);
    setPreviewMode(repoHints.suggestedPreviewMode);
  }, [createMode, repoHints, repoHintsLoading]);

  const handleGitHubConnect = async () => {
    setConnectLoading(true);
    try {
      const callbackURL = `${routerLocation.pathname}?github=linked`;
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
      const redirectLocation = response.headers.get("Location");
      if (redirectLocation) {
        window.location.href = redirectLocation;
        return;
      }
      const data = (await response.json().catch(() => ({}))) as { url?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      showPageToast(t("newProject.linkGithubFailed"), "error");
    } catch {
      showPageToast(t("newProject.linkGithubFailed"), "error");
    } finally {
      setConnectLoading(false);
    }
  };

  const handleImportCreate = async () => {
    if (!selectedRepo || !branch.trim()) return;
    const ws = normalizeRepoRelativePathString(workspaceRootDir);
    const pr = normalizeRepoRelativePathString(projectRootDir);
    if (!ws || !pr || !isAncestorOrEqualPath(ws, pr)) {
      showPageToast(t("newProject.validation.pathsInvalid"), "error");
      return;
    }
    const portResult = parseRuntimePortInput(runtimeContainerPort);
    if (!portResult.ok) {
      showPageToast(t("newProject.validation.portInvalid"), "error");
      return;
    }
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
          workspaceRootDir: ws,
          projectRootDir: pr,
          frameworkHint,
          previewMode,
          serverPreviewTarget,
          runtimeImageMode,
          dockerfilePath: dockerfilePath.trim() || null,
          dockerBuildTarget: dockerBuildTarget.trim() || null,
          runtimeContainerPort: portResult.port,
          skipHostStrategyBuild
        })
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? t("newProject.createFailed"));
      }
      showPageToast(t("newProject.projectCreated"), "success");
      finishCreate(data.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : t("newProject.createFailed");
      setBranchesError(message);
      showPageToast(message, "error");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleManualCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manualName.trim() || !manualRepoUrl.trim() || !manualBranch.trim()) {
      showPageToast(t("newProject.fillRequired"), "error");
      return;
    }
    const ws = normalizeRepoRelativePathString(workspaceRootDir);
    const pr = normalizeRepoRelativePathString(projectRootDir);
    if (!ws || !pr || !isAncestorOrEqualPath(ws, pr)) {
      showPageToast(t("newProject.validation.pathsInvalid"), "error");
      return;
    }
    const portResult = parseRuntimePortInput(runtimeContainerPort);
    if (!portResult.ok) {
      showPageToast(t("newProject.validation.portInvalid"), "error");
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
          workspaceRootDir: ws,
          projectRootDir: pr,
          frameworkHint,
          previewMode,
          serverPreviewTarget,
          runtimeImageMode,
          dockerfilePath: dockerfilePath.trim() || null,
          dockerBuildTarget: dockerBuildTarget.trim() || null,
          runtimeContainerPort: portResult.port,
          skipHostStrategyBuild
        })
      });
      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? t("newProject.createFailed"));
      }
      showPageToast(t("newProject.projectCreated"), "success");
      finishCreate(data.id);
    } catch (error) {
      showPageToast(error instanceof Error ? error.message : t("newProject.createFailed"), "error");
    } finally {
      setManualCreateLoading(false);
    }
  };

  const buildOptionsCard = (
    <Card className="dashboard-surface border-border/80 shadow-none">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-semibold tracking-tight md:text-2xl">{t("newProject.buildPreviewTitle")}</CardTitle>
        <CardDescription className="text-base leading-relaxed">{t("newProject.buildPreviewCardDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-framework-hint">{t("newProject.frameworkHint")}</Label>
            <Select
              value={frameworkHint}
              onValueChange={(value) => setFrameworkHint(value as "auto" | "nextjs" | "node" | "python" | "static")}
            >
              <SelectTrigger
                id="np-framework-hint"
                aria-describedby="np-framework-hint-help"
                aria-label={t("newProject.frameworkHintAria")}
                className="gap-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {createMode === "import" && repoHintsLoading ? (
                    <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-hidden />
                  ) : createMode === "import" && repoHints?.primaryFramework ? (
                    <FrameworkLogoThumb
                      fw={repoHints.primaryFramework}
                      title={repoHints.primaryFramework.name}
                      pixelSize={20}
                    />
                  ) : null}
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("newProject.selectAutoScan")}</SelectItem>
                <SelectItem value="nextjs">Next.js</SelectItem>
                <SelectItem value="node">{t("projects.framework.node")}</SelectItem>
                <SelectItem value="python">{t("projects.framework.python")}</SelectItem>
                <SelectItem value="static">{t("projects.framework.static")}</SelectItem>
              </SelectContent>
            </Select>
            <p id="np-framework-hint-help" className="text-xs text-muted-foreground">
              {t("newProject.frameworkHintHelp")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-preview-mode">{t("newProject.preview")}</Label>
            <Select value={previewMode} onValueChange={(value) => setPreviewMode(value as "auto" | "static" | "server")}>
              <SelectTrigger
                id="np-preview-mode"
                aria-describedby="np-preview-mode-help"
                aria-label={t("newProject.previewAria")}
                className="gap-2"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {createMode === "import" && repoHintsLoading ? (
                    <Loader2 className="text-muted-foreground size-4 shrink-0 animate-spin" aria-hidden />
                  ) : null}
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("newProject.selectAutoScan")}</SelectItem>
                <SelectItem value="static">{t("newProject.previewModeStatic")}</SelectItem>
                <SelectItem value="server">{t("newProject.previewModeServer")}</SelectItem>
              </SelectContent>
            </Select>
            <p id="np-preview-mode-help" className="text-xs text-muted-foreground">
              {t("newProject.previewHelp")}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-server-target">{t("newProject.serverPreviewTarget")}</Label>
            <Select
              value={serverPreviewTarget}
              onValueChange={(value) => setServerPreviewTarget(value as "isolated-runner")}
            >
              <SelectTrigger
                id="np-server-target"
                aria-describedby="np-server-target-help"
                aria-label={t("newProject.serverPreviewTarget")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="isolated-runner">{t("newProject.isolatedRunner")}</SelectItem>
              </SelectContent>
            </Select>
            <p id="np-server-target-help" className="text-xs text-muted-foreground">
              {t("newProject.serverPreviewTargetHelp")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-runtime-image-mode">{t("newProject.runtimeImageMode")}</Label>
            <Select
              value={runtimeImageMode}
              onValueChange={(value) => setRuntimeImageMode(value as "auto" | "platform" | "dockerfile")}
            >
              <SelectTrigger
                id="np-runtime-image-mode"
                aria-describedby="np-runtime-image-mode-help"
                aria-label={t("newProject.runtimeImageMode")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">{t("newProject.selectAutoProject")}</SelectItem>
                <SelectItem value="platform">{t("newProject.platformImage")}</SelectItem>
                <SelectItem value="dockerfile">{t("newProject.repoDockerfile")}</SelectItem>
              </SelectContent>
            </Select>
            <p id="np-runtime-image-mode-help" className="text-xs text-muted-foreground">
              {t("newProject.runtimeImageModeHelp")}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-dockerfile-path">{t("newProject.dockerfilePath")}</Label>
            <Input
              id="np-dockerfile-path"
              value={dockerfilePath}
              onChange={(event) => setDockerfilePath(event.target.value)}
              placeholder={t("newProject.dockerfilePlaceholder")}
              aria-describedby="np-dockerfile-path-help"
            />
            <p id="np-dockerfile-path-help" className="text-xs text-muted-foreground">
              {t("newProject.dockerfilePathHelp")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-docker-target">{t("newProject.dockerTarget")}</Label>
            <Input
              id="np-docker-target"
              value={dockerBuildTarget}
              onChange={(event) => setDockerBuildTarget(event.target.value)}
              placeholder={t("newProject.dockerTargetPlaceholder")}
              aria-describedby="np-docker-target-help"
            />
            <p id="np-docker-target-help" className="text-xs text-muted-foreground">
              {t("newProject.dockerTargetHelp")}
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="np-runtime-port">{t("newProject.runtimePort")}</Label>
            <Input
              id="np-runtime-port"
              type="number"
              min={1}
              max={65535}
              value={runtimeContainerPort}
              onChange={(event) => setRuntimeContainerPort(event.target.value)}
              aria-describedby="np-runtime-port-help"
            />
            <p id="np-runtime-port-help" className="text-xs text-muted-foreground">
              {t("newProject.runtimePortHelp")}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="np-host-build">{t("newProject.hostBuild")}</Label>
            <Select
              value={skipHostStrategyBuild ? "skip" : "build"}
              onValueChange={(value) => setSkipHostStrategyBuild(value === "skip")}
            >
              <SelectTrigger
                id="np-host-build"
                aria-describedby="np-host-build-help"
                aria-label={t("newProject.hostBuild")}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="build">{t("newProject.runHostBuild")}</SelectItem>
                <SelectItem value="skip">{t("newProject.dockerfileOnly")}</SelectItem>
              </SelectContent>
            </Select>
            <p id="np-host-build-help" className="text-xs text-muted-foreground">
              {t("newProject.hostBuildHelp")}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t("newProject.workspaceRootHint")}</p>
      </CardContent>
    </Card>
  );

  return (
    <>
      <SetupStepRail activeIndex={activeIndex} completedThrough={completedThrough} />

      <div className="min-w-0 space-y-8">
        <Tabs value={createMode} onValueChange={(value) => setCreateMode(value as "import" | "manual")}>
          <TabsList className="grid h-12 w-full max-w-lg grid-cols-2 rounded-xl bg-muted/55 p-1.5 shadow-inner">
            <TabsTrigger value="import" className="rounded-lg text-sm font-semibold data-[state=active]:shadow-sm">
              {t("newProject.tabImport")}
            </TabsTrigger>
            <TabsTrigger value="manual" className="rounded-lg text-sm font-semibold data-[state=active]:shadow-sm">
              {t("newProject.tabManual")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-6 space-y-6 outline-none">
            <form
              className="space-y-6"
              onSubmit={(event) => {
                event.preventDefault();
                void handleImportCreate();
              }}
            >
              <Card className="dashboard-surface border-border/80 shadow-none">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 pb-4">
                  <div className="min-w-0 space-y-2">
                    <CardTitle className="text-xl font-semibold tracking-tight md:text-2xl">{t("newProject.repoCardTitle")}</CardTitle>
                    <CardDescription className="text-base leading-relaxed">
                      {hasRepoAccess ? t("newProject.repoCardDescAccess") : t("newProject.repoCardDescNoAccess")}
                    </CardDescription>
                  </div>
                  <Badge variant={hasRepoAccess ? "default" : "secondary"} className="shrink-0 px-2.5 py-1 text-xs font-semibold">
                    {hasRepoAccess
                      ? t("newProject.badgeGithubReady")
                      : githubLinked
                        ? t("newProject.badgeScopeNeeded")
                        : t("newProject.badgeNoGithub")}
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
                      {connectLoading ? t("newProject.redirecting") : t("newProject.connectGitHub")}
                    </Button>
                  ) : null}

                  {hasRepoAccess ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="np-repo-search">{t("newProject.findRepo")}</Label>
                        <Input
                          id="np-repo-search"
                          type="search"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={t("newProject.filterPlaceholder")}
                          value={filter}
                          onChange={(event) => setFilter(event.target.value)}
                          aria-label={t("newProject.filterReposAria")}
                        />
                      </div>

                      <div className="rounded-lg border border-border/80 bg-muted/5">
                        {repoLoading ? (
                          <p className="p-6 text-center text-sm text-muted-foreground">{t("newProject.loadingRepos")}</p>
                        ) : null}
                        {repoError ? (
                          <p className="p-4 text-center text-sm text-destructive">{repoError}</p>
                        ) : null}
                        {!repoLoading && !repoError && filteredRepos.length === 0 ? (
                          <p className="p-6 text-center text-sm text-muted-foreground">
                            {t("newProject.noRepoMatchSearch")}
                          </p>
                        ) : null}
                        {filteredRepos.length > 0 ? (
                          <ScrollArea className="h-[min(20rem,45vh)]">
                            <RadioGroup
                              value={selectedRepo?.fullName}
                              onValueChange={handleRepoRadioChange}
                              className="gap-0"
                              aria-label={t("newProject.reposGroupAria")}
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
                          {t("newProject.branchDeploy")}
                          {selectedRepo ? <span className="text-destructive"> *</span> : null}
                        </Label>
                        {branchesLoading ? (
                          <p className="text-sm text-muted-foreground">{t("newProject.loadingBranches")}</p>
                        ) : (
                          <Select
                            value={branch || undefined}
                            onValueChange={setBranch}
                            disabled={!selectedRepo || branches.length === 0}
                            required={Boolean(selectedRepo && branches.length > 0)}
                          >
                            <SelectTrigger
                              id="np-branch-deploy"
                              aria-label={t("newProject.branchDeploy")}
                              aria-required={Boolean(selectedRepo)}
                            >
                              <SelectValue
                                placeholder={
                                  selectedRepo
                                    ? t("newProject.selectBranchPlaceholder")
                                    : t("newProject.selectRepoFirstPlaceholder")
                                }
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

                      {selectedRepo && refForHints && repoHintsError ? (
                        <p className="text-destructive text-sm" role="alert">
                          {repoHintsError}
                        </p>
                      ) : null}
                      {selectedRepo &&
                      refForHints &&
                      repoHints &&
                      !repoHintsLoading &&
                      repoHints.warnings.length > 0 ? (
                        <ul className="text-muted-foreground list-inside list-disc space-y-1 text-xs">
                          {repoHints.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="dashboard-surface border-border/80 shadow-none">
                <CardHeader className="space-y-2 pb-4">
                  <CardTitle className="text-xl font-semibold tracking-tight md:text-2xl">{t("newProject.monorepoTitle")}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{t("newProject.monorepoDesc")}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedRepo && refForHints ? (
                    (() => {
                      const slash = selectedRepo.fullName.indexOf("/");
                      if (slash === -1) return null;
                      const ghOwner = selectedRepo.fullName.slice(0, slash);
                      const ghRepo = selectedRepo.fullName.slice(slash + 1);
                      if (!ghOwner || !ghRepo) return null;
                      return (
                        <NewProjectPathExplorer
                          owner={ghOwner}
                          repo={ghRepo}
                          ref={refForHints}
                          workspaceRootDir={workspaceRootDir}
                          projectRootDir={projectRootDir}
                          onWorkspaceRootChange={setWorkspaceRootDir}
                          onProjectRootChange={setProjectRootDir}
                        />
                      );
                    })()
                  ) : (
                    <p className="text-muted-foreground rounded-lg border border-dashed border-border/80 bg-muted/10 px-3 py-4 text-center text-sm">
                      {t("newProject.pathExplorer.needRepoBranch")}
                    </p>
                  )}
                  <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-workspace-root">
                      {t("newProject.workspaceRootLabel")}
                      <span className="text-destructive"> *</span>
                    </Label>
                    <Input
                      id="np-workspace-root"
                      value={workspaceRootDir}
                      onChange={(event) => setWorkspaceRootDir(event.target.value)}
                      placeholder={t("newProject.placeholderRoot")}
                      required
                      aria-label={t("newProject.workspaceRootLabel")}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="np-project-root">
                      {t("newProject.projectRootLabel")}
                      <span className="text-destructive"> *</span>
                    </Label>
                    <Input
                      id="np-project-root"
                      value={projectRootDir}
                      onChange={(event) => setProjectRootDir(event.target.value)}
                      placeholder={t("newProject.placeholderRoot")}
                      required
                      aria-label={t("newProject.projectRootLabel")}
                    />
                  </div>
                  </div>
                </CardContent>
              </Card>

              {buildOptionsCard}

              <div className="border-border/80 bg-card/85 flex flex-col gap-4 rounded-xl border p-5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="ghost" asChild className="justify-center sm:justify-start">
                  <Link to="/projects">{t("common.cancel")}</Link>
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="gap-2 shadow-md"
                  disabled={!importCanSubmit || createLoading}
                >
                  {createLoading ? t("newProject.creating") : t("newProject.createProjectButton")}
                </Button>
              </div>
            </form>
          </TabsContent>

            <TabsContent value="manual" className="mt-6 space-y-6 outline-none">
              <Card className="dashboard-surface border-border/80 shadow-none">
                <CardHeader className="space-y-2 pb-4">
                  <CardTitle className="text-xl font-semibold tracking-tight md:text-2xl">{t("newProject.manualRepoTitle")}</CardTitle>
                  <CardDescription className="text-base leading-relaxed">{t("newProject.manualRepoDesc")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form className="flex flex-col gap-4" onSubmit={(event) => void handleManualCreate(event)}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="np-project-name">
                          {t("newProject.projectNameLabel")}
                          <span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-project-name"
                          autoComplete="off"
                          placeholder={t("newProject.placeholderProjectName")}
                          value={manualName}
                          onChange={(event) => setManualName(event.target.value)}
                          required
                          aria-label={t("newProject.projectNameLabel")}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 sm:col-span-2">
                        <Label htmlFor="np-repo-url">
                          {t("newProject.repositoryUrlLabel")}
                          <span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-repo-url"
                          type="url"
                          autoComplete="off"
                          inputMode="url"
                          spellCheck={false}
                          placeholder={t("newProject.placeholderRepoUrl")}
                          value={manualRepoUrl}
                          onChange={(event) => setManualRepoUrl(event.target.value)}
                          required
                          aria-label={t("newProject.repositoryUrlLabel")}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="np-manual-branch">
                          {t("newProject.branchLabel")}
                          <span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-manual-branch"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={t("newProject.placeholderBranch")}
                          value={manualBranch}
                          onChange={(event) => setManualBranch(event.target.value)}
                          required
                          aria-label={t("newProject.branchDeploy")}
                        />
                      </div>
                    </div>

                    <Separator />

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="np-manual-workspace-root">
                          {t("newProject.workspaceRootLabel")}
                          <span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-manual-workspace-root"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={t("newProject.placeholderRoot")}
                          value={workspaceRootDir}
                          onChange={(event) => setWorkspaceRootDir(event.target.value)}
                          required
                          aria-label={t("newProject.workspaceRootLabel")}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="np-manual-project-root">
                          {t("newProject.projectRootLabel")}
                          <span className="text-destructive"> *</span>
                        </Label>
                        <Input
                          id="np-manual-project-root"
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={t("newProject.placeholderRoot")}
                          value={projectRootDir}
                          onChange={(event) => setProjectRootDir(event.target.value)}
                          required
                          aria-label={t("newProject.projectRootLabel")}
                        />
                      </div>
                    </div>

                    {buildOptionsCard}

                    <Button type="submit" disabled={!manualCanSubmit || manualCreateLoading} className="w-full sm:w-auto">
                      {manualCreateLoading ? t("newProject.creating") : t("newProject.createProjectButton")}
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
