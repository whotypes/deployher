import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { ScrollText, Settings } from "lucide-react";
import { pickFeaturedDeploymentFromSortedDesc } from "@/lib/sidebarFeaturedDeployment";

type Deployment = {
  id: string;
  shortId: string;
  projectId: string;
  artifactPrefix: string;
  status: string;
  serveStrategy: "static" | "server";
  buildPreviewMode: "auto" | "static" | "server" | null;
  buildLogKey: string | null;
  previewUrl: string | null;
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
  frameworkHint: "auto" | "nextjs" | "node" | "python" | "static";
  previewMode: "auto" | "static" | "server";
  serverPreviewTarget: "isolated-runner";
  runtimeImageMode: "auto" | "platform" | "dockerfile";
  dockerfilePath: string | null;
  dockerBuildTarget: string | null;
  skipHostStrategyBuild: boolean;
  runtimeContainerPort: number;
  installCommand: string | null;
  buildCommand: string | null;
  createdAt: string;
  updatedAt: string;
  currentDeploymentId: string | null;
  siteIconUrl: string | null;
  siteOgImageUrl: string | null;
  siteMetaFetchedAt: string | null;
  siteMetaError: string | null;
};

export type ProjectDetailData = {
  pathname: string;
  project: Project;
  deployments: Deployment[];
  currentPreviewUrl: string | null;
  runtimeLogsAvailable: boolean;
  user?: LayoutUser | null;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
};

const statusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "success": return "default";
    case "failed": return "destructive";
    case "building": return "outline";
    case "queued": return "secondary";
    default: return "secondary";
  }
};

const deploymentPreviewLabel = (deployment: Deployment): string => {
  if (deployment.buildPreviewMode === "server" || deployment.buildPreviewMode === "static") {
    return deployment.buildPreviewMode;
  }
  return deployment.serveStrategy;
};

const ProjectDetailPage = ({ data }: { data: ProjectDetailData }) => {
  const currentDeployment =
    data.project.currentDeploymentId !== null
      ? data.deployments.find((d) => d.id === data.project.currentDeploymentId) ?? null
      : null;

  return (
  <Layout
    title={`${data.project.name} · Deployher`}
    pathname={data.pathname}
    scriptSrc="/assets/project-detail-page.js"
    user={data.user ?? null}
    sidebarProjects={data.sidebarProjects}
    sidebarContext={{
      project: {
        id: data.project.id,
        name: data.project.name
      },
      deployment: pickFeaturedDeploymentFromSortedDesc(
        data.deployments.map((d) => ({
          id: d.id,
          shortId: d.shortId,
          status: d.status
        }))
      )
    }}
    csrfToken={data.csrfToken}
    breadcrumbs={[
      { label: "Projects", href: "/projects" },
      { label: data.project.name }
    ]}
  >
    <div
      id="notification"
      aria-live="polite"
      className="hidden fixed top-17 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg"
    />
    <script
      type="application/json"
      id="project-detail-page-bootstrap"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          projectId: data.project.id,
          repoUrl: data.project.repoUrl,
          branch: data.project.branch,
          projectRootDir: data.project.projectRootDir,
          currentPreviewUrl: data.currentPreviewUrl,
          hasSuccessfulDeployment: data.deployments.some((d) => d.status === "success"),
          siteMeta:
            data.currentPreviewUrl !== null
              ? {
                  siteIconUrl: data.project.siteIconUrl,
                  siteOgImageUrl: data.project.siteOgImageUrl,
                  siteMetaFetchedAt: data.project.siteMetaFetchedAt,
                  siteMetaError: data.project.siteMetaError
                }
              : null,
          deployments: data.deployments.map((d) => ({
            id: d.id,
            shortId: d.shortId,
            status: d.status,
            serveStrategy: d.serveStrategy,
            buildPreviewMode: d.buildPreviewMode,
            previewUrl: d.previewUrl,
            createdAt: d.createdAt
          })),
          currentDeploymentId: data.project.currentDeploymentId
        }).replace(/</g, "\\u003c")
      }}
    />

    <div className="relative mb-8 overflow-hidden rounded-lg border border-border/80 border-l-4 border-l-primary/70 bg-card/30 shadow-sm ring-1 ring-black/5 dark:ring-white/5">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/40 via-transparent to-transparent"
        aria-hidden
      />
      <div className="dashboard-surface relative flex flex-col gap-6 overflow-hidden rounded-none border-0 shadow-none p-5 lg:flex-row lg:items-stretch lg:gap-8 md:p-6">
        {data.currentPreviewUrl ? (
          <div className="w-full shrink-0 lg:max-w-[min(100%,440px)] xl:max-w-[min(100%,480px)]">
            <div className="aspect-16/10 w-full">
              <div id="project-detail-hero-preview-root" className="size-full min-w-0" />
            </div>
          </div>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-5">
          <div className="min-w-0 space-y-4">
            <div>
              <p className="eyebrow-label mb-2">{currentDeployment ? "Current deployment" : "Project"}</p>
              <h1 className="font-serif truncate text-3xl font-semibold tracking-tight md:text-4xl">{data.project.name}</h1>
              <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                {data.project.repoUrl.replace(/^https:\/\/github\.com\//, "")}
              </p>
            </div>
            <dl className="grid gap-3 text-sm">
              {data.currentPreviewUrl ? (
                <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Preview</dt>
                  <dd className="min-w-0 truncate font-mono text-xs">
                    <a
                      href={data.currentPreviewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-foreground font-medium no-underline hover:underline"
                    >
                      {data.currentPreviewUrl}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Branch</dt>
                <dd className="min-w-0 truncate font-mono text-xs">
                  <code>{data.project.branch}</code>
                </dd>
              </div>
              {currentDeployment ? (
                <>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Deployment</dt>
                    <dd className="min-w-0">
                      <a
                        href={`/deployments/${currentDeployment.id}`}
                        className="font-mono text-xs font-medium no-underline hover:underline"
                      >
                        {currentDeployment.shortId}
                      </a>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(currentDeployment.status)}>{currentDeployment.status}</Badge>
                      <Badge variant="outline" className="font-normal">
                        {deploymentPreviewLabel(currentDeployment)}
                      </Badge>
                    </dd>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1">
                    <dt className="text-muted-foreground">Created</dt>
                    <dd className="text-xs text-muted-foreground tabular-nums">
                      {new Date(currentDeployment.createdAt).toLocaleString()}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/projects/${data.project.id}/settings`} aria-label="Project settings">
                <Settings className="mr-1.5 size-4" aria-hidden />
                Settings
              </a>
            </Button>
            {data.runtimeLogsAvailable &&
            currentDeployment?.serveStrategy === "server" &&
            currentDeployment.status === "success" ? (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`/projects/${data.project.id}/observability#runtime-logs`}
                  aria-label="Runtime logs for current deployment"
                >
                  <ScrollText className="mr-1.5 size-4" aria-hidden />
                  Runtime logs
                </a>
              </Button>
            ) : null}
            {data.currentPreviewUrl ? (
              <Button variant="outline" asChild>
                <a href={data.currentPreviewUrl} target="_blank" rel="noopener noreferrer">
                  Visit
                </a>
              </Button>
            ) : null}
            <div className="contents" id="project-detail-deploy-main-root" />
            <div id="project-detail-set-current-root" />
          </div>
        </div>
      </div>

      <Accordion type="single" collapsible className="border-t border-border/60 bg-muted/20 px-5 md:px-6">
        <AccordionItem value="project-details" className="border-0">
          <AccordionTrigger className="py-3.5 text-sm font-medium hover:no-underline">
            Project details &amp; configuration
          </AccordionTrigger>
          <AccordionContent className="space-y-5 pb-5">
            <p className="text-xs text-muted-foreground">
              Values below are read-only on this page. Env vars for deploys live in project settings.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button variant="default" size="sm" className="justify-center gap-2 sm:justify-start" asChild>
                <a href={`/projects/${data.project.id}/settings`}>
                  <Settings className="size-4" aria-hidden />
                  Edit general &amp; build
                </a>
              </Button>
              <Button variant="outline" size="sm" className="justify-center sm:justify-start" asChild>
                <a href={`/projects/${data.project.id}/settings/env`}>Edit environment variables</a>
              </Button>
            </div>
            <div className="overflow-hidden rounded-md border border-border/80">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="w-36 text-muted-foreground font-medium">Repository</TableCell>
                    <TableCell>
                      <a
                        href={data.project.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="no-underline hover:underline"
                      >
                        {data.project.repoUrl.replace("https://github.com/", "")}
                      </a>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Branch</TableCell>
                    <TableCell>{data.project.branch}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Workspace Root</TableCell>
                    <TableCell>
                      <code>{data.project.workspaceRootDir}</code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Project Root</TableCell>
                    <TableCell>
                      <code>{data.project.projectRootDir}</code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Framework</TableCell>
                    <TableCell>{data.project.frameworkHint === "auto" ? "Auto-detect" : data.project.frameworkHint}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Preview Type</TableCell>
                    <TableCell className="capitalize">
                      {data.project.previewMode === "auto" ? "Auto-detect" : data.project.previewMode}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Server Target</TableCell>
                    <TableCell>Isolated runner</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Runtime Image</TableCell>
                    <TableCell className="capitalize">{data.project.runtimeImageMode}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Dockerfile</TableCell>
                    <TableCell>
                      <code>{data.project.dockerfilePath ?? "Dockerfile"}</code>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Docker Target</TableCell>
                    <TableCell>{data.project.dockerBuildTarget ?? "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Host Build</TableCell>
                    <TableCell>
                      {data.project.skipHostStrategyBuild ? "Skipped (Dockerfile-only)" : "Run strategy build"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Preview Port</TableCell>
                    <TableCell>{data.project.runtimeContainerPort}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Created</TableCell>
                    <TableCell>{new Date(data.project.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-muted-foreground font-medium">Updated</TableCell>
                    <TableCell>{new Date(data.project.updatedAt).toLocaleString()}</TableCell>
                  </TableRow>
                  {data.currentPreviewUrl ? (
                    <TableRow>
                      <TableCell className="text-muted-foreground font-medium">Preview URL</TableCell>
                      <TableCell>
                        <a
                          href={data.currentPreviewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="no-underline hover:underline"
                        >
                          {data.currentPreviewUrl}
                        </a>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>

    <div className="min-w-0 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deployments</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.deployments.length === 0 ? (
            <p className="text-muted-foreground text-sm px-6 pb-4">No deployments yet. Click &quot;Deploy&quot; to create one.</p>
          ) : (
            <div id="project-detail-deployments-root" className="min-w-0" />
          )}
        </CardContent>
      </Card>

      <div id="project-detail-repo-explorer-root" className="min-w-0" />
    </div>
  </Layout>
  );
};

export const renderProjectDetailPage = (data: ProjectDetailData) =>
  renderToReadableStream(<ProjectDetailPage data={data} />);
