import * as React from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, FileCode, Folder, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Locs, LocsChild } from "@/lib/githubRepoLocs";
import { highlightRepoFilePreview } from "@/lib/prismRepoPreview";
import { joinRepoContentPath } from "@/lib/repoFrameworkHints";

export type RepoLocsApiResponse = {
  locs: Locs;
  truncated: boolean;
  truncatedReason?: string;
};

export type RepoFileApiResponse = {
  path: string;
  content: string;
};

export type RepoCodeExplorerProps = {
  owner: string;
  repo: string;
  ref: string;
  projectRoot: string;
  title?: string;
  className?: string;
};

const isFolder = (child: LocsChild): child is Locs => typeof child !== "number";

const formatNumber = (n: number): string => new Intl.NumberFormat().format(n);

const renderLocShare = (loc: number, total: number): string => {
  if (total <= 0) return formatNumber(loc);
  return `${formatNumber(loc)} (${((100 * loc) / total).toFixed(1)}%)`;
};

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

const getLocsValue = (child: LocsChild): number => (isFolder(child) ? child.loc : child);

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

export const RepoCodeExplorer = ({
  owner,
  repo,
  ref,
  projectRoot,
  title,
  className
}: RepoCodeExplorerProps): React.ReactElement => {
  const { t } = useTranslation();
  const displayTitle = title ?? t("repoExplorer.defaultTitle");
  const [filter, setFilter] = React.useState("");
  const debouncedFilter = useDebouncedValue(filter, 500);
  const [path, setPath] = React.useState<string[]>([]);
  const [selectedLang, setSelectedLang] = React.useState<string | null>(null);
  const [locsRes, setLocsRes] = React.useState<RepoLocsApiResponse | null>(null);
  const [locsError, setLocsError] = React.useState<string | null>(null);
  const [locsLoading, setLocsLoading] = React.useState(false);
  const [fileContent, setFileContent] = React.useState<string | null>(null);
  const [fileLoading, setFileLoading] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const root = locsRes?.locs ?? null;
  const atNode = drillPath(root, path);
  const isFile = atNode !== null && !isFolder(atNode);
  const parentPath = isFile ? path.slice(0, -1) : path;
  const parentNode = drillPath(root, parentPath);
  const displayChildren =
    parentNode !== null && isFolder(parentNode) ? parentNode.children : undefined;

  React.useEffect(() => {
    setPath([]);
    setSelectedLang(null);
    setFileContent(null);
    setFileError(null);
  }, [owner, repo, ref, projectRoot, debouncedFilter]);

  React.useEffect(() => {
    let cancelled = false;
    setLocsLoading(true);
    setLocsError(null);
    setLocsRes(null);
    const params = new URLSearchParams({
      owner,
      repo,
      ref,
      projectRoot: projectRoot.trim() === "" ? "." : projectRoot.trim()
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
          throw new Error(data.error ?? t("repoExplorer.lineCountsFailed"));
        }
        if (!cancelled) {
          setLocsRes(data);
        }
      } catch (e) {
        if (!cancelled) {
          setLocsError(e instanceof Error ? e.message : t("repoExplorer.loadRepoFailed"));
        }
      } finally {
        if (!cancelled) setLocsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, ref, projectRoot, debouncedFilter, t]);

  const relFilePath = path.length ? path.join("/") : "";

  React.useEffect(() => {
    if (!isFile || !relFilePath) {
      setFileContent(null);
      setFileError(null);
      return;
    }
    const rootNorm =
      projectRoot.trim() === "" || projectRoot.trim() === "." ? "" : projectRoot.trim();
    const fullPath = rootNorm ? joinRepoContentPath(rootNorm, relFilePath) : relFilePath;
    let cancelled = false;
    setFileLoading(true);
    setFileError(null);
    setFileContent(null);
    void (async () => {
      try {
        const params = new URLSearchParams({
          owner,
          repo,
          ref,
          path: fullPath
        });
        const response = await fetch(`/api/github/repo-file?${params.toString()}`, {
          headers: { Accept: "application/json" }
        });
        const data = (await response.json().catch(() => ({}))) as RepoFileApiResponse & { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? t("repoExplorer.fileLoadFailed"));
        }
        if (!cancelled) {
          setFileContent(data.content);
        }
      } catch (e) {
        if (!cancelled) {
          setFileError(e instanceof Error ? e.message : t("repoExplorer.fileLoadFailed"));
        }
      } finally {
        if (!cancelled) setFileLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, repo, ref, projectRoot, isFile, relFilePath, t]);

  const prismBlock = React.useMemo(() => {
    if (!isFile || fileContent === null || relFilePath === "") {
      return null;
    }
    try {
      const { html, lang } = highlightRepoFilePreview(fileContent, relFilePath);
      return { ok: true as const, html, lang };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : t("repoExplorer.syntaxHighlightFailed")
      };
    }
  }, [fileContent, isFile, relFilePath, t]);

  const totalSiblingLocs: number =
    displayChildren !== undefined
      ? Object.values(displayChildren).reduce<number>((sum, child) => sum + getLocsValue(child), 0)
      : 0;

  const currentLocs: Locs | null =
    isFile && parentNode !== null && isFolder(parentNode)
      ? parentNode
      : atNode !== null && isFolder(atNode)
        ? atNode
        : root;

  const langEntries =
    currentLocs?.locByLangs !== undefined
      ? Object.entries(currentLocs.locByLangs).sort((a, b) => b[1] - a[1])
      : [];

  const langTotal = langEntries.reduce((s, [, n]) => s + n, 0);

  const breadcrumbRoot = projectRoot === "." || projectRoot === "" ? repo : `${repo} (${projectRoot})`;

  return (
    <div
      className={cn(
        "border-border/80 rounded-xl border bg-card/40 shadow-sm backdrop-blur-[2px]",
        className
      )}
    >
      <div className="border-border/60 flex flex-wrap items-center gap-2 border-b bg-muted/20 px-3 py-2">
        <span className="text-muted-foreground font-mono text-[10px] tracking-wide">github</span>
        <span className="text-muted-foreground/50">/</span>
        <span className="font-mono text-xs font-medium">
          {owner}/{repo}
        </span>
        <span className="text-muted-foreground ml-auto font-mono text-[10px]">@{ref}</span>
      </div>

      <div className="space-y-3 p-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-foreground text-sm font-semibold">{displayTitle}</h3>
          <p className="text-muted-foreground text-xs">{t("repoExplorer.intro")}</p>
        </div>

        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("repoExplorer.pathFilterPlaceholder")}
          className="font-mono text-xs"
          aria-label={t("repoExplorer.pathFilterAria")}
        />

        {locsLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t("repoExplorer.scanning")}
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

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex min-h-[220px] flex-col gap-1">
                <p className="text-muted-foreground text-xs font-medium">{t("repoExplorer.files")}</p>
                <ScrollArea className="border-border/70 h-[min(22rem,50vh)] rounded-md border">
                  <ul className="divide-border/60 divide-y p-0">
                    {displayChildren && totalSiblingLocs !== undefined
                      ? sortChildNames(displayChildren).map((name) => {
                          const child = displayChildren[name]!;
                          const folder = isFolder(child);
                          const loc = getLocsValue(child);
                          const selectedFileName = isFile ? path[path.length - 1] : undefined;
                          const rowActive = folder ? false : selectedFileName === name;
                          let langBar = 0;
                          if (selectedLang && folder && isFolder(child) && currentLocs?.locByLangs?.[selectedLang]) {
                            const langTotalForBar = currentLocs.locByLangs[selectedLang]!;
                            langBar =
                              langTotalForBar > 0
                                ? ((child.locByLangs?.[selectedLang] ?? 0) / langTotalForBar) * 100
                                : 0;
                          }
                          return (
                            <li key={name}>
                              <button
                                type="button"
                                className={cn(
                                  "hover:bg-muted/60 flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors",
                                  folder ? "font-medium" : "font-normal",
                                  rowActive && "bg-primary/10"
                                )}
                                style={
                                  langBar > 0
                                    ? {
                                        backgroundImage:
                                          "linear-gradient(to right, hsl(var(--primary) / 0.14), hsl(var(--primary) / 0.14))",
                                        backgroundSize: `${Math.min(langBar, 100)}% 100%`,
                                        backgroundRepeat: "no-repeat"
                                      }
                                    : undefined
                                }
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
                                <span className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">
                                  {renderLocShare(loc, totalSiblingLocs)}
                                </span>
                              </button>
                            </li>
                          );
                        })
                      : null}
                    {!displayChildren || Object.keys(displayChildren).length === 0 ? (
                      <li className="text-muted-foreground px-3 py-6 text-center text-xs">{t("repoExplorer.noFiles")}</li>
                    ) : null}
                  </ul>
                </ScrollArea>
              </div>

              <div className="flex min-h-[220px] flex-col gap-1">
                {isFile ? (
                  <>
                    <p className="text-muted-foreground text-xs font-medium">{t("repoExplorer.preview")}</p>
                    <div className="border-border/70 bg-background flex h-[min(22rem,50vh)] flex-col overflow-hidden rounded-md border">
                      <div className="border-border/60 border-b px-2 py-1.5 font-mono text-xs text-muted-foreground">
                        {relFilePath}
                      </div>
                      {fileLoading ? (
                        <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-xs">
                          <Loader2 className="size-4 animate-spin" />
                          {t("repoExplorer.loading")}
                        </div>
                      ) : fileError ? (
                        <p className="text-destructive p-3 text-xs">{fileError}</p>
                      ) : fileContent !== null ? (
                        prismBlock?.ok ? (
                          <ScrollArea className="flex-1">
                            <div className="repo-code-explorer-prism text-xs leading-relaxed grid max-w-full grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2 p-2">
                              <div
                                className="text-muted-foreground select-none pt-0.5 text-right font-mono tabular-nums"
                                aria-hidden
                              >
                                {fileContent.split("\n").map((_, i) => (
                                  <div key={i}>{i + 1}</div>
                                ))}
                              </div>
                              <pre className="m-0 min-w-0 overflow-x-auto border-0 bg-transparent p-0 font-mono">
                                <code
                                  className={`language-${prismBlock.lang}`}
                                  dangerouslySetInnerHTML={{ __html: prismBlock.html }}
                                />
                              </pre>
                            </div>
                          </ScrollArea>
                        ) : (
                          <ScrollArea className="flex-1">
                            <div className="space-y-0 p-2 font-mono text-xs leading-relaxed">
                              {prismBlock && !prismBlock.ok ? (
                                <p className="text-muted-foreground mb-2 text-xs">{prismBlock.error}</p>
                              ) : null}
                              {fileContent.split("\n").map((line, i) => (
                                <div key={i} className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
                                  <span className="text-muted-foreground select-none text-right tabular-nums">
                                    {i + 1}
                                  </span>
                                  <span className="whitespace-pre-wrap break-all">{line || " "}</span>
                                </div>
                              ))}
                            </div>
                          </ScrollArea>
                        )
                      ) : null}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground text-xs font-medium">
                      {t("repoExplorer.linesOfCode")}
                      {currentLocs !== null && currentLocs.loc !== undefined
                        ? ` (${formatNumber(currentLocs.loc)})`
                        : ""}
                    </p>
                    <ScrollArea className="border-border/70 h-[min(22rem,50vh)] rounded-md border">
                      <ul className="divide-border/60 divide-y p-0">
                        {langEntries.map(([lang, loc]) => (
                          <li key={lang}>
                            <button
                              type="button"
                              className={cn(
                                "hover:bg-muted/60 flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm",
                                selectedLang === lang && "bg-muted/80"
                              )}
                              onClick={() =>
                                setSelectedLang((prev) => (prev === lang ? null : lang))
                              }
                            >
                              <span className="min-w-0 flex-1 truncate text-xs">{lang}</span>
                              <span className="text-muted-foreground shrink-0 font-mono text-[10px] tabular-nums">
                                {renderLocShare(loc, langTotal)}
                              </span>
                            </button>
                          </li>
                        ))}
                        {langEntries.length === 0 ? (
                          <li className="text-muted-foreground px-3 py-6 text-center text-xs">
                            {t("repoExplorer.noLanguageBreakdown")}
                          </li>
                        ) : null}
                      </ul>
                    </ScrollArea>
                  </>
                )}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};
