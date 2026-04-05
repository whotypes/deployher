import { ExternalLink, FileTerminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
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

const statusLabel = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "building") return "Building";
  if (s === "queued") return "Queued";
  if (s === "success") return "Live";
  if (s === "failed") return "Failed";
  return status;
};

const frameworkHintLabel = (hint: FrameworkHint): string => {
  switch (hint) {
    case "auto":
      return "Auto";
    case "nextjs":
      return "Next.js";
    case "node":
      return "Node";
    case "python":
      return "Python";
    case "static":
      return "Static";
    default:
      return hint;
  }
};

const buildStrategyLabel = (strategy: string): string => {
  switch (strategy) {
    case "node":
      return "Node build";
    case "python":
      return "Python build";
    case "static":
      return "Static build";
    default:
      return strategy;
  }
};

const deploymentBuildTypeSummary = (dep: ProjectListCurrentDeployment): string => {
  if (dep.buildStrategy === "unknown") {
    if (dep.status === "queued" || dep.status === "building") {
      return "Resolving build type…";
    }
    return "Unknown build type";
  }
  return `${buildStrategyLabel(dep.buildStrategy)} · ${dep.serveStrategy} serve`;
};

const formatBuildDuration = (startIso: string, endIso: string | null): string => {
  if (!endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return "—";
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
    { key: "success", count: counts.success, className: "bg-emerald-500/90", label: "Live" },
    { key: "failed", count: counts.failed, className: "bg-destructive/85", label: "Failed" },
    { key: "building", count: counts.building, className: "bg-amber-500/85", label: "Building" },
    { key: "queued", count: counts.queued, className: "bg-sky-500/80", label: "Queued" },
    { key: "none", count: counts.none, className: "bg-muted-foreground/35", label: "No deploy" }
  ];
  const segments = segmentDefs.filter((s) => s.count > 0);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="tabular-nums text-foreground">{n}</span> projects
        </span>
        <span>
          <span className="tabular-nums text-emerald-600 dark:text-emerald-400">{counts.success}</span> live
        </span>
        <span>
          <span className="tabular-nums text-destructive">{counts.failed}</span> failed
        </span>
        <span>
          <span className="tabular-nums text-amber-600 dark:text-amber-400">{counts.building + counts.queued}</span>{" "}
          in flight
        </span>
      </div>
      {n > 0 ? (
        <div
          className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
          role="img"
          aria-label={`Deployment status mix: ${segments.map((s) => `${s.label} ${s.count}`).join(", ")}`}
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
  if (!github.linked) {
    return (
      <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
        <a href="/account">GitHub · connect</a>
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
        <a href="/account">GitHub · limited access</a>
      </Button>
    );
  }
  return (
    <span className="inline-flex h-8 items-center rounded-md border border-border/60 px-2.5 text-xs text-muted-foreground">
      GitHub
    </span>
  );
};

const ProjectWorkspaceCard = ({ project }: { project: Project }) => {
  const dep = project.currentDeployment;
  const hint = dep ? failureHint(dep) : null;
  const duration = dep && dep.finishedAt ? formatBuildDuration(dep.createdAt, dep.finishedAt) : null;
  const updatedLabel = new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(project.updatedAt));

  return (
    <Card
      className={cn(
        "dashboard-surface relative border-border/80 shadow-none transition-colors hover:border-border",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
      )}
    >
      <CardContent className="relative p-4">
        <a
          href={`/projects/${project.id}`}
          className="absolute inset-0 z-0 rounded-lg outline-none"
          aria-label={`Open project ${project.name}`}
        />
        <div className="relative z-10 space-y-3 pointer-events-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <ProjectSiteGlyph name={project.name} siteIconUrl={project.siteIconUrl} />
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

        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="font-mono text-[0.65rem]">
            {project.branch}
          </Badge>
          <Badge variant="secondary" className="text-[0.65rem] font-normal">
            {frameworkHintLabel(project.frameworkHint)}
          </Badge>
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
              <a href={deploymentDetailHref(dep.id)} className="pointer-events-auto no-underline">
                <Badge variant={statusVariant(dep.status)} className="gap-1 text-xs">
                  {statusLabel(dep.status)}
                </Badge>
              </a>
              <a
                href={deploymentDetailHref(dep.id)}
                className="pointer-events-auto font-mono text-xs text-muted-foreground no-underline hover:text-foreground hover:underline"
              >
                {dep.shortId}
              </a>
            </div>
            <p className="text-xs text-muted-foreground">
              {deploymentBuildTypeSummary(dep)}
              {duration ? ` · ${duration}` : null}
            </p>
            <p className="text-[0.7rem] text-muted-foreground">
              Started{" "}
              {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(dep.createdAt)
              )}
              {dep.finishedAt ? (
                <>
                  {" "}
                  · Finished{" "}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                    new Date(dep.finishedAt)
                  )}
                </>
              ) : dep.status === "building" || dep.status === "queued" ? (
                <span className="text-amber-600/90 dark:text-amber-400/90"> · Still running</span>
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
            No deploys
          </Badge>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          {dep && dep.status === "failed" ? (
            <Button variant="destructive" size="sm" className="pointer-events-auto h-8 gap-1.5" asChild>
              <a href={deploymentLogsHref(dep.id)}>
                <FileTerminal className="size-3.5" aria-hidden />
                Logs
              </a>
            </Button>
          ) : null}
          {dep && dep.status === "success" && dep.previewUrl ? (
            <Button size="sm" className="pointer-events-auto h-8 gap-1.5" asChild>
              <a href={dep.previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" aria-hidden />
                Preview
              </a>
            </Button>
          ) : null}
          {dep &&
          (dep.status === "building" ||
            dep.status === "queued" ||
            (dep.status === "success" && !dep.previewUrl)) ? (
            <Button variant="outline" size="sm" className="pointer-events-auto h-8" asChild>
              <a href={deploymentDetailHref(dep.id)}>Deployment</a>
            </Button>
          ) : null}
        </div>
        </div>
      </CardContent>
    </Card>
  );
};

const ProjectsPage = ({ data }: { data: ProjectsPageData }) => (
  <Layout
    title="Projects · Deployher"
    pathname={data.pathname}
    user={data.user ?? null}
    csrfToken={data.csrfToken}
    sidebarProjects={data.sidebarProjects}
    breadcrumbs={[{ label: "Projects" }]}
  >
    <div className="mb-6 space-y-4 rounded-lg border border-border/70 bg-card/20 p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Projects</h1>
        <div className="flex flex-wrap items-center gap-2">
          <GitHubToolbarBadge github={data.github} />
          <Button size="sm" asChild>
            <a href="/projects/new">Add project</a>
          </Button>
        </div>
      </div>
      <ProjectsStatusBar projects={data.projects} />
    </div>

    {data.projects.length === 0 ? (
      <Card className="dashboard-surface border-border/80 shadow-none">
        <CardContent className="p-6 text-sm text-muted-foreground">
          No projects yet.{" "}
          <a href="/projects/new" className="font-medium text-foreground no-underline hover:underline">
            Add one
          </a>
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
  </Layout>
);

export const renderProjectsPage = (data: ProjectsPageData) => renderToReadableStream(<ProjectsPage data={data} />);
