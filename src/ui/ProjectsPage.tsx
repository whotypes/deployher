import { ExternalLink, FileTerminal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";

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
  buildServerPreviewTarget: "isolated-runner" | "trusted-local-docker" | null;
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
  serverPreviewTarget: "isolated-runner" | "trusted-local-docker";
  runtimeImageMode: "auto" | "platform" | "dockerfile";
  dockerfilePath: string | null;
  dockerBuildTarget: string | null;
  skipHostStrategyBuild: boolean;
  runtimeContainerPort: number;
  createdAt: string;
  updatedAt: string;
  currentDeploymentId: string | null;
  currentDeployment: ProjectListCurrentDeployment | null;
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
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <p>
          <span className="text-muted-foreground">Projects </span>
          <span className="font-semibold tabular-nums text-foreground">{n}</span>
        </p>
        <p>
          <span className="text-muted-foreground">Live </span>
          <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
            {counts.success}
          </span>
        </p>
        <p>
          <span className="text-muted-foreground">Need attention </span>
          <span className="font-semibold tabular-nums text-destructive">{counts.failed}</span>
        </p>
        <p>
          <span className="text-muted-foreground">In flight </span>
          <span className="font-semibold tabular-nums text-amber-600 dark:text-amber-400">
            {counts.building + counts.queued}
          </span>
        </p>
      </div>
      {n > 0 ? (
        <div
          className="flex h-2 w-full overflow-hidden rounded-full bg-muted/60"
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

const ProjectsPage = ({ data }: { data: ProjectsPageData }) => (
  <Layout
    title="Projects · pdploy"
    pathname={data.pathname}
    scriptSrc="/assets/projects-page.js"
    user={data.user ?? null}
    csrfToken={data.csrfToken}
    sidebarProjects={data.sidebarProjects}
    breadcrumbs={[{ label: "Projects" }]}
  >
    <script
      type="application/json"
      id="projects-page-bootstrap"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          hasRepoAccess: data.github.hasRepoAccess,
          githubLinked: data.github.linked
        })
      }}
    />
    <div
      id="notification"
      aria-live="polite"
      className="top-17 fixed right-4 z-50 hidden rounded-md px-4 py-3 text-sm font-medium shadow-lg"
    />

    <div className="mb-2">
      <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
        Latest deployment per project, quick links to logs and previews, and what went wrong when a build
        fails.
      </p>
    </div>

    <ProjectsStatusBar projects={data.projects} />

    <div className="flex flex-col gap-8">
      <div className="min-w-0 flex-1">
        <Card>
          <CardContent className="p-0">
            {data.projects.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                No projects yet.{" "}
                <a href="#new" className="font-medium text-foreground">
                  Create one
                </a>
                .
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[9rem]">Project</TableHead>
                    <TableHead className="hidden min-w-[7rem] lg:table-cell">Branch &amp; stack</TableHead>
                    <TableHead className="min-w-[10rem]">Current deploy</TableHead>
                    <TableHead className="hidden min-w-[12rem] xl:table-cell">Details</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.projects.map((project) => {
                    const dep = project.currentDeployment;
                    const hint = dep ? failureHint(dep) : null;
                    const duration =
                      dep && dep.finishedAt ? formatBuildDuration(dep.createdAt, dep.finishedAt) : null;

                    return (
                      <TableRow key={project.id}>
                        <TableCell className="min-w-0 align-top">
                          <div className="flex min-w-0 flex-col gap-1">
                            <a
                              href={`/projects/${project.id}`}
                              className="min-w-0 truncate font-medium no-underline hover:underline"
                            >
                              {project.name}
                            </a>
                            <a
                              href={project.repoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block min-w-0 truncate text-xs text-muted-foreground no-underline hover:underline"
                            >
                              {project.repoUrl.replace("https://github.com/", "")}
                            </a>
                            <div className="flex flex-wrap gap-1 lg:hidden">
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
                          </div>
                        </TableCell>
                        <TableCell className="hidden align-top lg:table-cell">
                          <div className="flex flex-col gap-1.5">
                            <Badge variant="outline" className="w-fit font-mono text-[0.7rem]">
                              {project.branch}
                            </Badge>
                            <div className="flex flex-wrap gap-1">
                              <Badge variant="secondary" className="text-[0.65rem] font-normal">
                                {frameworkHintLabel(project.frameworkHint)}
                              </Badge>
                              {project.projectRootDir !== "." ? (
                                <Badge variant="outline" className="font-mono text-[0.65rem]">
                                  {project.projectRootDir}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-0 align-top">
                          {dep ? (
                            <div className="flex min-w-0 flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <a href={deploymentDetailHref(dep.id)} className="no-underline">
                                  <Badge variant={statusVariant(dep.status)} className="gap-1">
                                    {statusLabel(dep.status)}
                                  </Badge>
                                </a>
                                <a
                                  href={deploymentDetailHref(dep.id)}
                                  className="font-mono text-[0.7rem] text-muted-foreground no-underline hover:text-foreground hover:underline"
                                >
                                  {dep.shortId}
                                </a>
                              </div>
                              <p className="text-[0.7rem] leading-snug text-muted-foreground">
                                {deploymentBuildTypeSummary(dep)}
                                {duration ? ` · ${duration}` : null}
                              </p>
                              {dep.status === "failed" && hint ? (
                                <p
                                  className="line-clamp-2 text-[0.75rem] leading-snug text-destructive/90"
                                  title={hint}
                                >
                                  {truncateText(hint, 220)}
                                </p>
                              ) : null}
                            </div>
                          ) : (
                            <Badge variant="secondary">No deploys</Badge>
                          )}
                        </TableCell>
                        <TableCell className="hidden max-w-[16rem] align-top xl:table-cell">
                          {dep ? (
                            <ul className="space-y-1 text-[0.7rem] text-muted-foreground">
                              <li>
                                <span className="text-foreground/80">Started </span>
                                {new Intl.DateTimeFormat(undefined, {
                                  dateStyle: "medium",
                                  timeStyle: "short"
                                }).format(new Date(dep.createdAt))}
                              </li>
                              {dep.finishedAt ? (
                                <li>
                                  <span className="text-foreground/80">Finished </span>
                                  {new Intl.DateTimeFormat(undefined, {
                                    dateStyle: "medium",
                                    timeStyle: "short"
                                  }).format(new Date(dep.finishedAt))}
                                </li>
                              ) : dep.status === "building" || dep.status === "queued" ? (
                                <li className="text-amber-600/90 dark:text-amber-400/90">Still running</li>
                              ) : null}
                              {dep.previewResolution?.code && dep.status !== "failed" ? (
                                <li className="truncate" title={dep.previewResolution.detail ?? dep.previewResolution.code}>
                                  {dep.previewResolution.detail ?? dep.previewResolution.code}
                                </li>
                              ) : null}
                            </ul>
                          ) : (
                            <span className="text-[0.7rem] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col items-end gap-2">
                            {dep && dep.status === "failed" ? (
                              <Button variant="destructive" size="sm" className="h-8 gap-1.5" asChild>
                                <a href={deploymentLogsHref(dep.id)}>
                                  <FileTerminal className="size-3.5" aria-hidden />
                                  Open logs
                                </a>
                              </Button>
                            ) : null}
                            {dep && dep.status === "success" && dep.previewUrl ? (
                              <Button size="sm" className="h-8 gap-1.5" asChild>
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
                              <Button variant="outline" size="sm" className="h-8" asChild>
                                <a href={deploymentDetailHref(dep.id)}>Deployment</a>
                              </Button>
                            ) : null}
                            {!dep ? (
                              <Button variant="outline" size="sm" className="h-8" asChild>
                                <a href={`/projects/${project.id}`}>Open</a>
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="hidden align-top text-right text-sm text-muted-foreground sm:table-cell">
                          {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
                            new Date(project.updatedAt)
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div id="projects-client-root" className="hidden" aria-hidden="true" />
    </div>
  </Layout>
);

export const renderProjectsPage = (data: ProjectsPageData) => renderToReadableStream(<ProjectsPage data={data} />);
