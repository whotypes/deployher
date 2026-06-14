import { ExternalLink, FileTerminal } from "lucide-react";
import { useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "@/spa/routerCompat";
import { useWorkspaceChrome } from "@/spa/workspaceChromeContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { ProjectSiteGlyph } from "./client/ProjectSiteGlyph";

type FrameworkHint = "auto" | "nextjs" | "node" | "python" | "static";

export type ProjectListCurrentDeployment = {
  id: string;
  shortId: string;
  status: string;
  previewUrl: string | null;
  buildStrategy: string;
  serveStrategy: string;
  previewResolution: { code: string; detail?: string } | null;
  buildPreviewMode: "auto" | "static" | "server" | null;
  buildServerPreviewTarget: "isolated-runner" | null;
  createdAt: string;
  finishedAt: string | null;
};

type Project = {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  workspaceRootDir: string;
  projectRootDir: string;
  frameworkHint: FrameworkHint;
  previewMode: "auto" | "static" | "server";
  serverPreviewTarget: "isolated-runner";
  runtimeImageMode: "auto" | "platform" | "dockerfile";
  dockerfilePath: string | null;
  dockerBuildTarget: string | null;
  skipHostStrategyBuild: boolean;
  runtimeContainerPort: number;
  createdAt: string;
  updatedAt: string;
  currentDeploymentId: string | null;
  currentDeployment: ProjectListCurrentDeployment | null;
  siteIconUrl: string | null;
};

export type ProjectsPageData = {
  pathname: string;
  projects: Project[];
  user?: LayoutUser | null;
  csrfToken?: string;
  sidebarProjects: SidebarProjectSummary[];
  github: {
    linked: boolean;
    hasRepoAccess: boolean;
  };
};

const statusVariant = (status?: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "success":
      return "default";
    case "failed":
      return "destructive";
    case "building":
      return "outline";
    case "queued":
      return "secondary";
    default:
      return "secondary";
  }
};


const formatBuildDuration = (startIso: string, endIso: string | null, emDash: string): string => {
  if (!endIso) return emDash;
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return emDash;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m > 0) return `${m}m ${rs}s`;
  return `${rs}s`;
};

const failureHint = (dep: ProjectListCurrentDeployment): string | null => {
  if (dep.status !== "failed") return null;
  const r = dep.previewResolution;
  const raw = r?.detail?.trim() || r?.code?.trim() || null;
  return raw;
};

const truncateText = (text: string, maxLen: number): string => {
  const t = text.trim();
  if (t.length <= maxLen) return t;
  return t.slice(0, maxLen - 1).trimEnd() + "…";
};

const deploymentDetailHref = (deploymentId: string): string => `/deployments/${deploymentId}`;

const deploymentLogsHref = (deploymentId: string): string =>
  `${deploymentDetailHref(deploymentId)}#build-logs`;

type StatusBucket = "success" | "failed" | "building" | "queued" | "none";

const bucketForProject = (p: Project): StatusBucket => {
  const s = p.currentDeployment?.status?.toLowerCase();
  if (!s) return "none";
  if (s === "success" || s === "failed" || s === "building" || s === "queued") return s;
  return "none";
};

const ProjectsStatusBar = ({ projects }: { projects: Project[] }) => {
  const { t } = useTranslation();
  const n = projects.length;
  const counts: Record<StatusBucket, number> = {
    success: 0,
    failed: 0,
    building: 0,
    queued: 0,
    none: 0
  };
  for (const p of projects) {
    counts[bucketForProject(p)] += 1;
  }

  const segmentDefs: { key: StatusBucket; count: number; className: string; label: string }[] = [
    { key: "success", count: counts.success, className: "bg-emerald-500/90", label: t("projects.bucket.live") },
    { key: "failed", count: counts.failed, className: "bg-destructive/85", label: t("projects.bucket.failed") },
    { key: "building", count: counts.building, className: "bg-amber-500/85", label: t("projects.bucket.building") },
    { key: "queued", count: counts.queued, className: "bg-sky-500/80", label: t("projects.bucket.queued") },
    { key: "none", count: counts.none, className: "bg-muted-foreground/35", label: t("projects.bucket.none") }
  ];
  const segments = segmentDefs.filter((s) => s.count > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-sm text-muted-foreground">
        <span>
          <span className="tabular-nums text-foreground">{n}</span> {t("projects.wordProjects")}
        </span>
        <span>
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{counts.success}</span>{" "}
          {t("projects.wordLive")}
        </span>
        <span>
          <span className="tabular-nums text-destructive">{counts.failed}</span> {t("projects.wordFailed")}
        </span>
        <span>
          <span className="tabular-nums text-amber-600 dark:text-amber-400">{counts.building + counts.queued}</span>{" "}
          {t("projects.wordInFlight")}
        </span>
      </div>
      {n > 0 ? (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
          role="img"
          aria-label={t("projects.segmentAria", {
            summary: segments.map((s) => `${s.label} ${s.count}`).join(", ")
          })}
        >
          {segments.map((s) => (
            <div
              key={s.key}
              className={cn(s.className, "min-w-0 transition-[flex-grow]")}
              style={{ flexGrow: s.count, flexBasis: 0 }}
              title={`${s.label}: ${s.count}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};

const GitHubToolbarBadge = ({ github }: { github: ProjectsPageData["github"] }) => {
  const { t } = useTranslation();
  if (!github.linked) {
    return (
      <Button variant="outline" size="sm" className="h-9 text-sm" asChild>
        <Link to="/account">{t("projects.githubConnect")}</Link>
      </Button>
    );
  }
  if (!github.hasRepoAccess) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-9 border-amber-500/40 text-sm text-amber-700 dark:text-amber-400"
        asChild
      >
        <Link to="/account">{t("projects.githubLimited")}</Link>
      </Button>
    );
  }
  return (
    <span className="inline-flex h-9 items-center rounded-md border border-border/60 px-3 text-sm text-muted-foreground">
      {t("projects.githubBadge")}
    </span>
  );
};

const deploymentBuildTypeSummary = (dep: ProjectListCurrentDeployment, t: TFunction): string => {
  if (dep.buildStrategy === "unknown") {
    if (dep.status === "queued" || dep.status === "building") {
      return t("projects.resolvingBuildType");
    }
    return t("projects.unknownBuildType");
  }
  const buildLabel = (() => {
    switch (dep.buildStrategy) {
      case "node":
        return t("projects.nodeBuild");
      case "python":
        return t("projects.pythonBuild");
      case "static":
        return t("projects.staticBuild");
      default:
        return dep.buildStrategy;
    }
  })();
  return `${buildLabel} · ${dep.serveStrategy} ${t("projects.serveSuffix")}`;
};

const ProjectWorkspaceCard = ({ project }: { project: Project }) => {
  const { t, i18n } = useTranslation();
  const dep = project.currentDeployment;
  const hint = dep ? failureHint(dep) : null;
  const emDash = t("common.emDash");
  const duration =
    dep && dep.finishedAt ? formatBuildDuration(dep.createdAt, dep.finishedAt, emDash) : null;
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }),
    [locale]
  );
  const updatedLabel = dateFmt.format(new Date(project.updatedAt));

  const frameworkHintLabel = (hint: FrameworkHint) => t(`projects.framework.${hint}`);

  const statusLabel = (status: string) => {
    const s = status.toLowerCase();
    if (s === "building" || s === "queued" || s === "success" || s === "failed") {
      return t(`projects.status.${s}`);
    }
    return status;
  };

  return (
    <Card
      className={cn(
        "group/project-card dashboard-surface relative overflow-hidden border-border/80 shadow-none",
        "before:pointer-events-none before:absolute before:inset-y-5 before:left-0 before:z-1 before:w-[3px] before:rounded-r-full before:bg-linear-to-b before:from-primary/55 before:to-primary/15",
        "transition-[border-color,box-shadow] duration-300 ease-out",
        "hover:border-primary/25 hover:shadow-[0_32px_80px_-44px_rgba(0,0,0,0.82)]",
        "focus-within:border-primary/30 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
      )}
    >
      <CardContent className="relative p-5 md:p-6">
        <Link
          to={`/projects/${project.id}`}
          className="absolute inset-0 z-0 rounded-[inherit] outline-none ring-offset-background transition-colors hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={t("projects.openProjectAria", { name: project.name })}
        />
        <div className="relative z-10 space-y-5 pointer-events-none">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex min-w-0 items-start gap-3">
                <ProjectSiteGlyph
                  name={project.name}
                  siteIconUrl={project.siteIconUrl}
                  previewUrl={dep?.previewUrl ?? null}
                  className="size-11 shrink-0 rounded-lg ring-2 ring-border/55"
                  imgClassName="size-11 object-cover"
                  letterClassName="flex size-11 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground"
                />
                <div className="min-w-0 flex-1 pt-0.5">
                  <h2 className="text-pretty text-xl font-semibold leading-snug tracking-tight text-foreground sm:text-2xl">
                    {project.name}
                  </h2>
                  <a
                    href={project.repoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="pointer-events-auto mt-1.5 block truncate font-mono text-sm leading-normal text-muted-foreground no-underline transition-colors hover:text-foreground hover:underline"
                  >
                    {project.repoUrl.replace("https://github.com/", "")}
                  </a>
                </div>
              </div>
            </div>
            <time
              className="shrink-0 pt-1 text-right text-xs font-medium leading-tight text-muted-foreground sm:text-sm sm:leading-snug"
              dateTime={project.updatedAt}
            >
              {updatedLabel}
            </time>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="h-8 border-border/70 px-2.5 font-mono text-xs font-medium">
              {project.branch}
            </Badge>
            <div
              className="border-border/70 bg-muted/35 inline-flex h-8 min-w-30 max-w-[min(100%,14rem)] items-center truncate rounded-lg border px-3 text-xs font-semibold text-foreground"
              title={frameworkHintLabel(project.frameworkHint)}
              aria-label={t("projects.frameworkAria", { framework: frameworkHintLabel(project.frameworkHint) })}
            >
              {frameworkHintLabel(project.frameworkHint)}
            </div>
            {project.projectRootDir !== "." ? (
              <Badge variant="outline" className="h-8 px-2.5 font-mono text-xs font-medium">
                {project.projectRootDir}
              </Badge>
            ) : null}
          </div>

          <Separator className="bg-border/50" />

          {dep ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2.5 gap-y-2">
                <Link to={deploymentDetailHref(dep.id)} className="pointer-events-auto no-underline">
                  <Badge variant={statusVariant(dep.status)} className="px-2.5 py-1 text-sm font-medium">
                    {statusLabel(dep.status)}
                  </Badge>
                </Link>
                <Link
                  to={deploymentDetailHref(dep.id)}
                  className="pointer-events-auto font-mono text-sm text-muted-foreground no-underline transition-colors hover:text-foreground hover:underline"
                >
                  {dep.shortId}
                </Link>
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {deploymentBuildTypeSummary(dep, t)}
                {duration ? ` · ${duration}` : null}
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                {t("projects.started", { time: dateFmt.format(new Date(dep.createdAt)) })}
                {dep.finishedAt ? (
                  <>
                    {" "}
                    · {t("projects.finished", { time: dateFmt.format(new Date(dep.finishedAt)) })}
                  </>
                ) : dep.status === "building" || dep.status === "queued" ? (
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    {" "}
                    {t("projects.stillRunning")}
                  </span>
                ) : null}
              </p>
              {dep.status === "failed" && hint ? (
                <p className="line-clamp-2 text-sm leading-snug text-destructive" title={hint}>
                  {truncateText(hint, 280)}
                </p>
              ) : null}
              {dep.previewResolution?.code && dep.status !== "failed" ? (
                <p
                  className="truncate text-sm text-muted-foreground"
                  title={dep.previewResolution.detail ?? dep.previewResolution.code}
                >
                  {dep.previewResolution.detail ?? dep.previewResolution.code}
                </p>
              ) : null}
            </div>
          ) : (
            <Badge variant="secondary" className="h-8 px-3 text-sm font-medium">
              {t("projects.noDeploys")}
            </Badge>
          )}

          <div className="flex flex-wrap gap-2.5 pt-0.5">
            {dep && dep.status === "failed" ? (
              <Button variant="destructive" size="sm" className="pointer-events-auto h-9 gap-2 text-sm" asChild>
                <Link to={deploymentLogsHref(dep.id)}>
                  <FileTerminal className="size-4" aria-hidden />
                  {t("common.logs")}
                </Link>
              </Button>
            ) : null}
            {dep && dep.status === "success" && dep.previewUrl ? (
              <Button size="sm" className="pointer-events-auto h-9 gap-2 text-sm" asChild>
                <a href={dep.previewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" aria-hidden />
                  {t("common.preview")}
                </a>
              </Button>
            ) : null}
            {dep &&
            (dep.status === "building" ||
              dep.status === "queued" ||
              (dep.status === "success" && !dep.previewUrl)) ? (
              <Button variant="outline" size="sm" className="pointer-events-auto h-9 text-sm" asChild>
                <Link to={deploymentDetailHref(dep.id)}>{t("common.deployment")}</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const ProjectsPage = ({ data }: { data: ProjectsPageData }) => {
  const { t } = useTranslation();
  const chrome = useMemo(
    () => ({
      title: t("meta.titleWithApp", {
        page: t("projects.pageTitle"),
        appName: t("common.appName")
      }),
      breadcrumbs: [{ label: t("projects.pageTitle") }]
    }),
    [t]
  );
  useWorkspaceChrome(chrome);
  return (
    <>
      <div className="relative mb-8 space-y-5 overflow-hidden rounded-[calc(var(--radius)+0.25rem)] border border-border/70 bg-card/40 p-5 shadow-[0_24px_64px_-36px_rgba(0,0,0,0.85)] backdrop-blur-xl md:p-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/40 via-transparent to-color-mix(in_oklab,var(--chart-2)_25%,transparent)"
          aria-hidden
        />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-pretty text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
            {t("projects.pageTitle")}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <GitHubToolbarBadge github={data.github} />
            <Button size="default" className="h-10 px-5 text-sm font-medium" asChild>
              <Link to="/projects/new">{t("projects.addProject")}</Link>
            </Button>
          </div>
        </div>
        <ProjectsStatusBar projects={data.projects} />
      </div>

      {data.projects.length === 0 ? (
        <Card className="dashboard-surface border-border/80 shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("projects.empty")}{" "}
            <Link to="/projects/new" className="font-medium text-foreground no-underline hover:underline">
              {t("projects.emptyAdd")}
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
          {data.projects.map((project) => (
            <ProjectWorkspaceCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </>
  );
};
