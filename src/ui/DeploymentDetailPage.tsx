import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";

type Deployment = {
  id: string;
  shortId: string;
  projectId: string;
  artifactPrefix: string;
  status: string;
  serveStrategy: "static" | "server";
  buildPreviewMode: "auto" | "static" | "server" | null;
  buildServerPreviewTarget: "isolated-runner" | null;
  previewResolution: { code: string; detail?: string } | null;
  buildLogKey: string | null;
  previewUrl: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type Project = {
  id: string;
  name: string;
  currentDeploymentId: string | null;
};

export type DeploymentDetailData = {
  pathname: string;
  deployment: Deployment;
  project: Project;
  user?: LayoutUser | null;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
  sidebarFeaturedDeployment: SidebarFeaturedDeployment | null;
  runtimeLogsAvailable: boolean;
};

const DeploymentDetailPage = ({ data }: { data: DeploymentDetailData }) => (
  <Layout
    title={`Deployment ${data.deployment.shortId} · Deployher`}
    pathname={data.pathname}
    scriptSrc="/assets/deployment-detail-page.js"
    user={data.user ?? null}
    csrfToken={data.csrfToken}
    sidebarProjects={data.sidebarProjects}
    sidebarContext={{
      project: {
        id: data.project.id,
        name: data.project.name
      },
      deployment: data.sidebarFeaturedDeployment
    }}
    breadcrumbs={[
      { label: "Projects", href: "/projects" },
      { label: data.project.name, href: `/projects/${data.project.id}` },
      { label: data.deployment.shortId }
    ]}
  >
    <script
      type="application/json"
      id="deployment-detail-bootstrap"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c")
      }}
    />
    <div id="deployment-detail-client-root" />
  </Layout>
);

export const renderDeploymentDetailPage = (data: DeploymentDetailData) =>
  renderToReadableStream(<DeploymentDetailPage data={data} />);
