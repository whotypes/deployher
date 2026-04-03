import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Settings } from "lucide-react";
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
  serverPreviewTarget: "isolated-runner" | "trusted-local-docker";
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
};

export type ProjectDetailData = {
  pathname: string;
  project: Project;
  deployments: Deployment[];
  currentPreviewUrl: string | null;
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

const ProjectDetailPage = ({ data }: { data: ProjectDetailData }) => (
  <Layout
    title={`${data.project.name} · pdploy`}
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
    <input type="hidden" id="project-id" value={data.project.id} />

    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-semibold">{data.project.name}</h1>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <a href={`/projects/${data.project.id}/settings`} aria-label="Project settings">
            <Settings className="size-4 mr-1.5" aria-hidden />
            Settings
          </a>
        </Button>
        {data.currentPreviewUrl ? (
          <Button variant="outline" asChild>
            <a href={data.currentPreviewUrl} target="_blank" rel="noopener noreferrer">
              Visit
            </a>
          </Button>
        ) : null}
        <Button id="deploy-btn" type="button">Deploy</Button>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Info</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="w-36 text-muted-foreground font-medium">Repository</TableCell>
                  <TableCell>
                    <a href={data.project.repoUrl} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline">
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
                  <TableCell><code>{data.project.workspaceRootDir}</code></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground font-medium">Project Root</TableCell>
                  <TableCell><code>{data.project.projectRootDir}</code></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground font-medium">Framework</TableCell>
                  <TableCell>{data.project.frameworkHint === "auto" ? "Auto-detect" : data.project.frameworkHint}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground font-medium">Preview Type</TableCell>
                  <TableCell className="capitalize">{data.project.previewMode === "auto" ? "Auto-detect" : data.project.previewMode}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground font-medium">Server Target</TableCell>
                  <TableCell>{data.project.serverPreviewTarget === "isolated-runner" ? "Isolated runner" : "Trusted local Docker"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground font-medium">Runtime Image</TableCell>
                  <TableCell className="capitalize">{data.project.runtimeImageMode}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground font-medium">Dockerfile</TableCell>
                  <TableCell><code>{data.project.dockerfilePath ?? "Dockerfile"}</code></TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground font-medium">Docker Target</TableCell>
                  <TableCell>{data.project.dockerBuildTarget ?? "—"}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground font-medium">Host Build</TableCell>
                  <TableCell>{data.project.skipHostStrategyBuild ? "Skipped (Dockerfile-only)" : "Run strategy build"}</TableCell>
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
                      <a href={data.currentPreviewUrl} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline">
                        {data.currentPreviewUrl}
                      </a>
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Deployments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {data.deployments.length === 0 ? (
              <p className="text-muted-foreground text-sm px-6 pb-4">No deployments yet. Click "Deploy" to create one.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Preview</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.deployments.map((deployment) => (
                    <TableRow key={deployment.id}>
                      <TableCell>
                        <a href={`/deployments/${deployment.id}`} className="font-mono text-sm no-underline hover:underline">
                          {deployment.shortId}
                        </a>
                        {deployment.id === data.project.currentDeploymentId ? (
                          <Badge variant="secondary" className="ml-2 text-[0.625rem]">current</Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(deployment.status)}>{deployment.status}</Badge>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {deploymentPreviewLabel(deployment)}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(deployment.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {deployment.status === "success" && deployment.previewUrl ? (
                          <Button variant="outline" size="sm" asChild>
                            <a href={deployment.previewUrl} target="_blank" rel="noopener noreferrer">
                              Visit
                            </a>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Deploy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Uses environment variables from project settings (Postgres). Edit them under Environment Variables before
              deploying if you need to change keys or values.
            </p>
            <Button id="deploy-btn-sidebar" type="button" className="w-full">Deploy Now</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Project Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a href={`/projects/${data.project.id}/settings`}>
                <Settings className="size-4" aria-hidden />
                General &amp; Build Config
              </a>
            </Button>
            <Button variant="outline" className="w-full justify-start gap-2" asChild>
              <a href={`/projects/${data.project.id}/settings/env`}>
                Environment Variables
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </Layout>
);

export const renderProjectDetailPage = (data: ProjectDetailData) =>
  renderToReadableStream(<ProjectDetailPage data={data} />);
