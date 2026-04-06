import * as React from "react";
import { ChevronRight, FileCode, Folder, Loader2, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { isAncestorOrEqualPath } from "@/lib/repoRelativePath";
import { cn } from "@/lib/utils";
import type { Locs, LocsChild } from "@/lib/githubRepoLocs";
import type { RepoLocsApiResponse } from "./RepoCodeExplorer";

export type NewProjectPathExplorerProps = {
  owner: string;
  repo: string;
  ref: string;
  workspaceRootDir: string;
  projectRootDir: string;
  onWorkspaceRootChange: (value: string) => void;
  onProjectRootChange: (value: string) => void;
  className?: string;
};

const isFolder = (child: LocsChild): child is Locs => typeof child !== "number";

const sortChildNames = (children: Record<string, LocsChild>): string[] => {
  const names = Object.keys(children);
  names.sort((a, b) => {
    const ca = children[a];
    const cb = children[b];
    if (ca === undefined || cb === undefined) return 0;
    const fa = isFolder(ca);
    const fb = isFolder(cb);
    if (fa !== fb) return fa ? -1 : 1;
    return a.localeCompare(b);
  });
  return names;
};

const drillPath = (root: Locs | null, path: string[]): Locs | number | null => {
  if (!root) return null;
  let cur: Locs | number = root;
  for (const seg of path) {
    if (!isFolder(cur)) return cur;
    const ch: LocsChild | undefined = cur.children?.[seg];
    if (ch === undefined) return null;
    cur = ch;
  }
  return cur;
};

const segmentsToDir = (segments: string[]): string =>
  segments.length === 0 ? "." : segments.join("/");

const useDebouncedValue = <T,>(value: T, ms: number): T => {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    if (!ms) {
      setV(value);
      return;
    }
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
};

export const NewProjectPathExplorer = ({
  owner,
  repo,
  ref,
  workspaceRootDir,
  projectRootDir,
  onWorkspaceRootChange,
  onProjectRootChange,
  className
}: NewProjectPathExplorerProps): React.ReactElement => {
  const { t } = useTranslation();
  const [filter, setFilter] = React.useState("");
  const debouncedFilter = useDebouncedValue(filter, 400);
  const [path, setPath] = React.useState<string[]>([]);
  const [locsRes, setLocsRes] = React.useState<RepoLocsApiResponse | null>(null);
  const [locsError, setLocsError] = React.useState<string | null>(null);
  const [locsLoading, setLocsLoading] = React.useState(false);

  const root = locsRes?.locs ?? null;
  const atNode = drillPath(root, path);
  const isFile = atNode !== null && !isFolder(atNode);
  const parentPath = isFile ? path.slice(0, -1) : path;
  const parentNode = drillPath(root, parentPath);
  const displayChildren =
    parentNode !== null && isFolder(parentNode) ? parentNode.children : undefined;

  const dirSegmentsForActions = isFile ? path.slice(0, -1) : path;
  const dirForActions = segmentsToDir(dirSegmentsForActions);
  const dirNodeForActions = drillPath(root, dirSegmentsForActions);
  const hasPackageJsonHere =
    dirNodeForActions !== null &&
    isFolder(dirNodeForActions) &&
    typeof dirNodeForActions.children?.["package.json"] === "number";

  React.useEffect(() => {
    setPath([]);
  }, [owner, repo, ref, debouncedFilter]);

  React.useEffect(() => {
    let cancelled = false;
    setLocsLoading(true);
    setLocsError(null);
    setLocsRes(null);
    const params = new URLSearchParams({
      owner,
      repo,
      ref,
      projectRoot: "."
    });
    if (debouncedFilter.trim()) {
      params.set("filter", debouncedFilter.trim());
    }
    void (async () => {
      try {
        const response = await fetch(`/api/github/repo-locs?${params.toString()}`, {
          headers: { Accept: "application/json" }
        });
        const data = (await response.json().catch(() => ({}))) as RepoLocsApiResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? t("newProject.pathExplorer.treeError"));
        }
        if (!cancelled) {
          setLocsRes(data);
        }
      } catch (e) {
        if (!cancelled) {
          setLocsError(e instanceof Error ? e.message : t("newProject.pathExplorer.treeError"));
        }
      } finally {
        if (!cancelled) setLocsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, ref, debouncedFilter, t]);

  const applyWorkspaceDir = (w: string) => {
    let nextProject = projectRootDir;
    if (!isAncestorOrEqualPath(w, nextProject)) {
      nextProject = w;
    }
    onWorkspaceRootChange(w);
    onProjectRootChange(nextProject);
  };

  const applyProjectDir = (p: string) => {
    let nextWorkspace = workspaceRootDir;
    if (!isAncestorOrEqualPath(nextWorkspace, p)) {
      nextWorkspace = ".";
    }
    onWorkspaceRootChange(nextWorkspace);
    onProjectRootChange(p);
  };

  const handleSetWorkspace = () => {
    applyWorkspaceDir(dirForActions);
  };

  const handleSetProject = () => {
    applyProjectDir(dirForActions);
  };

  const handleUsePackageJsonFolder = () => {
    applyProjectDir(dirForActions);
  };

  const breadcrumbRoot = repo;

  return (
    <div
      className={cn(
        "border-border/80 from-muted/10 to-card/30 rounded-xl border bg-linear-to-b shadow-sm",
        className
      )}
    >
      <div className="border-border/60 flex flex-wrap items-center gap-2 border-b bg-muted/15 px-3 py-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-wide">github</span>
        <span className="text-muted-foreground/50">/</span>
        <span className="font-mono text-xs font-medium">
          {owner}/{repo}
        </span>
        <span className="text-muted-foreground ml-auto font-mono text-[10px]">@{ref}</span>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <h3 className="text-foreground text-sm font-semibold">{t("newProject.pathExplorer.title")}</h3>
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{t("newProject.pathExplorer.subtitle")}</p>
        </div>

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("newProject.pathExplorer.filterPlaceholder")}
          className="font-mono text-xs"
          aria-label={t("newProject.pathExplorer.filterAria")}
        />

        <div className="bg-muted/30 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-[11px]">
          <span className="text-muted-foreground shrink-0 font-medium">{t("newProject.pathExplorer.selection")}</span>
          <code className="text-foreground max-w-[min(100%,14rem)] truncate rounded bg-background/80 px-1.5 py-0.5 font-mono">
            {t("newProject.pathExplorer.workspaceShort")} {workspaceRootDir}
          </code>
          <span className="text-muted-foreground/60" aria-hidden>
            ·
          </span>
          <code className="text-foreground max-w-[min(100%,14rem)] truncate rounded bg-background/80 px-1.5 py-0.5 font-mono">
            {t("newProject.pathExplorer.projectShort")} {projectRootDir}
          </code>
        </div>

        {locsLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
            {t("newProject.pathExplorer.scanning")}
          </div>
        ) : locsError ? (
          <p className="text-destructive text-sm" role="alert">
            {locsError}
          </p>
        ) : root ? (
          <>
            {locsRes?.truncated ? (
              <p className="border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-200 rounded-md border px-2 py-1.5 text-xs">
                {t("repoExplorer.partialResults", {
                  reason: locsRes.truncatedReason ?? t("repoExplorer.limitsReached")
                })}
              </p>
            ) : null}

            <div className="text-muted-foreground mb-1 flex flex-wrap items-center gap-1 font-mono text-xs break-all">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto min-h-0 px-1 py-0 font-mono text-xs"
                onClick={() => setPath([])}
              >
                {breadcrumbRoot}
              </Button>
              {path.map((seg, i) => (
                <React.Fragment key={`${i}-${seg}`}>
                  <ChevronRight className="size-3 shrink-0 opacity-40" aria-hidden />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-auto min-h-0 px-1 py-0 font-mono text-xs"
                    onClick={() => setPath(path.slice(0, i + 1))}
                  >
                    {seg}
                  </Button>
                </React.Fragment>
              ))}
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={handleSetWorkspace}>
                {t("newProject.pathExplorer.setWorkspace")}
              </Button>
              <Button type="button" variant="default" size="sm" className="gap-1.5" onClick={handleSetProject}>
                {t("newProject.pathExplorer.setProject")}
              </Button>
              {hasPackageJsonHere ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-primary/40"
                  onClick={handleUsePackageJsonFolder}
                >
                  <Package className="size-3.5" aria-hidden />
                  {t("newProject.pathExplorer.usePackageJson")}
                </Button>
              ) : null}
            </div>
            <p className="text-muted-foreground text-[11px] leading-snug">{t("newProject.pathExplorer.hint")}</p>

            <ScrollArea className="border-border/70 h-[min(18rem,42vh)] rounded-md border">
              <ul className="divide-border/60 divide-y p-0">
                {displayChildren
                  ? sortChildNames(displayChildren).map((name) => {
                      const child = displayChildren[name]!;
                      const folder = isFolder(child);
                      const selectedFileName = isFile ? path[path.length - 1] : undefined;
                      const rowActive = !folder && selectedFileName === name;
                      const childPath = [...parentPath, name];
                      const childRel = segmentsToDir(childPath);
                      const isWorkspaceHere = workspaceRootDir === childRel;
                      const isProjectHere = projectRootDir === childRel;
                      const isPackageJson = name === "package.json" && !folder;
                      return (
                        <li key={name}>
                          <div
                            className={cn(
                              "hover:bg-muted/60 flex w-full items-stretch gap-0 transition-colors",
                              rowActive && !folder && "bg-primary/10"
                            )}
                          >
                            <button
                              type="button"
                              className={cn(
                                "flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm",
                                folder ? "font-medium" : "font-normal"
                              )}
                              onClick={() => {
                                setPath([...parentPath, name]);
                              }}
                            >
                              {folder ? (
                                <Folder className="text-primary size-4 shrink-0 opacity-90" aria-hidden />
                              ) : (
                                <FileCode className="text-muted-foreground size-4 shrink-0" aria-hidden />
                              )}
                              <span className="min-w-0 flex-1 truncate font-mono text-xs">{name}</span>
                              <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                {isPackageJson ? (
                                  <Badge variant="secondary" className="font-mono text-[9px] font-normal">
                                    package.json
                                  </Badge>
                                ) : null}
                                {isWorkspaceHere ? (
                                  <Badge variant="outline" className="text-[9px] font-normal">
                                    {t("newProject.pathExplorer.badgeWorkspace")}
                                  </Badge>
                                ) : null}
                                {isProjectHere ? (
                                  <Badge className="text-[9px] font-normal">{t("newProject.pathExplorer.badgeProject")}</Badge>
                                ) : null}
                              </span>
                            </button>
                            {folder ? (
                              <div className="border-border/60 flex shrink-0 items-center gap-1 border-l pr-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-foreground h-8 min-w-11 px-2 text-[10px] font-semibold"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    applyWorkspaceDir(childRel);
                                  }}
                                  aria-label={t("newProject.pathExplorer.rowWorkspaceAria")}
                                >
                                  {t("newProject.pathExplorer.rowWorkspace")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-muted-foreground hover:text-foreground h-8 min-w-11 px-2 text-[10px] font-semibold"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    applyProjectDir(childRel);
                                  }}
                                  aria-label={t("newProject.pathExplorer.rowProjectAria")}
                                >
                                  {t("newProject.pathExplorer.rowProject")}
                                </Button>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })
                  : null}
                {!displayChildren || Object.keys(displayChildren).length === 0 ? (
                  <li className="text-muted-foreground px-3 py-6 text-center text-xs">{t("repoExplorer.noFiles")}</li>
                ) : null}
              </ul>
            </ScrollArea>
          </>
        ) : null}
      </div>
    </div>
  );
};
