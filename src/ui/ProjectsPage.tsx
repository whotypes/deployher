import { ExternalLink, FileTerminal } from "lucide-react";
import { useMemo } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { AppShell } from "./AppShell";
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
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
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
      <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
        <Link to="/account">{t("projects.githubConnect")}</Link>
      </Button>
    );
  }
  if (!github.hasRepoAccess) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 border-amber-500/40 text-xs text-amber-700 dark:text-amber-400"
        asChild
      >
        <Link to="/account">{t("projects.githubLimited")}</Link>
      </Button>
    );
  }
  return (
    <span className="inline-flex h-8 items-center rounded-md border border-border/60 px-2.5 text-xs text-muted-foreground">
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
        "dashboard-surface relative border-border/80 shadow-none transition-colors hover:border-border",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
      )}
    >
      <CardContent className="relative p-4">
        <Link
          to={`/projects/${project.id}`}
          className="absolute inset-0 z-0 rounded-lg outline-none"
          aria-label={t("projects.openProjectAria", { name: project.name })}
        />
        <div className="relative z-10 space-y-3 pointer-events-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <ProjectSiteGlyph
                name={project.name}
                siteIconUrl={project.siteIconUrl}
                previewUrl={dep?.previewUrl ?? null}
              />
              <span className="truncate text-base font-semibold text-foreground">{project.name}</span>
            </div>
            <a
              href={project.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="pointer-events-auto mt-0.5 block truncate font-mono text-xs text-muted-foreground no-underline hover:text-foreground hover:underline"
            >
              {project.repoUrl.replace("https://github.com/", "")}
            </a>
          </div>
          <time className="shrink-0 text-right text-[0.65rem] text-muted-foreground tabular-nums" dateTime={project.updatedAt}>
            {updatedLabel}
          </time>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="font-mono text-[0.65rem]">
            {project.branch}
          </Badge>
          <div
            className="border-border/80 bg-background inline-flex h-7 min-w-24 max-w-48 items-center truncate rounded-md border px-2 text-[0.65rem] font-medium text-foreground"
            title={frameworkHintLabel(project.frameworkHint)}
            aria-label={t("projects.frameworkAria", { framework: frameworkHintLabel(project.frameworkHint) })}
          >
            {frameworkHintLabel(project.frameworkHint)}
          </div>
          {project.projectRootDir !== "." ? (
            <Badge variant="outline" className="font-mono text-[0.65rem]">
              {project.projectRootDir}
            </Badge>
          ) : null}
        </div>

        <Separator className="bg-border/60" />

        {dep ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Link to={deploymentDetailHref(dep.id)} className="pointer-events-auto no-underline">
                <Badge variant={statusVariant(dep.status)} className="gap-1 text-xs">
                  {statusLabel(dep.status)}
                </Badge>
              </Link>
              <Link
                to={deploymentDetailHref(dep.id)}
                className="pointer-events-auto font-mono text-xs text-muted-foreground no-underline hover:text-foreground hover:underline"
              >
                {dep.shortId}
              </Link>
            </div>
            <p className="text-xs text-muted-foreground">
              {deploymentBuildTypeSummary(dep, t)}
              {duration ? ` · ${duration}` : null}
            </p>
            <p className="text-[0.7rem] text-muted-foreground">
              {t("projects.started", { time: dateFmt.format(new Date(dep.createdAt)) })}
              {dep.finishedAt ? (
                <>
                  {" "}
                  · {t("projects.finished", { time: dateFmt.format(new Date(dep.finishedAt)) })}
                </>
              ) : dep.status === "building" || dep.status === "queued" ? (
                <span className="text-amber-600/90 dark:text-amber-400/90"> {t("projects.stillRunning")}</span>
              ) : null}
            </p>
            {dep.status === "failed" && hint ? (
              <p className="line-clamp-2 text-xs leading-snug text-destructive/90" title={hint}>
                {truncateText(hint, 280)}
              </p>
            ) : null}
            {dep.previewResolution?.code && dep.status !== "failed" ? (
              <p
                className="truncate text-[0.7rem] text-muted-foreground"
                title={dep.previewResolution.detail ?? dep.previewResolution.code}
              >
                {dep.previewResolution.detail ?? dep.previewResolution.code}
              </p>
            ) : null}
          </div>
        ) : (
          <Badge variant="secondary" className="w-fit text-xs">
            {t("projects.noDeploys")}
          </Badge>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {dep && dep.status === "failed" ? (
            <Button variant="destructive" size="sm" className="pointer-events-auto h-8 gap-1.5" asChild>
              <Link to={deploymentLogsHref(dep.id)}>
                <FileTerminal className="size-3.5" aria-hidden />
                {t("common.logs")}
              </Link>
            </Button>
          ) : null}
          {dep && dep.status === "success" && dep.previewUrl ? (
            <Button size="sm" className="pointer-events-auto h-8 gap-1.5" asChild>
              <a href={dep.previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" aria-hidden />
                {t("common.preview")}
              </a>
            </Button>
          ) : null}
          {dep &&
          (dep.status === "building" ||
            dep.status === "queued" ||
            (dep.status === "success" && !dep.previewUrl)) ? (
            <Button variant="outline" size="sm" className="pointer-events-auto h-8" asChild>
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
  return (
    <AppShell
      title={t("meta.titleWithApp", {
        page: t("projects.pageTitle"),
        appName: t("common.appName")
      })}
      pathname={data.pathname}
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      breadcrumbs={[{ label: t("projects.pageTitle") }]}
    >
      <div className="mb-6 space-y-4 rounded-lg border border-border/70 bg-card/20 p-4 md:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{t("projects.pageTitle")}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <GitHubToolbarBadge github={data.github} />
            <Button size="sm" asChild>
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
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {data.projects.map((project) => (
            <ProjectWorkspaceCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </AppShell>
  );
};
