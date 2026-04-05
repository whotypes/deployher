import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Activity, FolderKanban } from "lucide-react";

type Project = {
  id: string;
  name: string;
};

export type ProjectRuntimeLogsSsr = {
  available: boolean;
  deploymentId: string | null;
  deploymentShortId: string | null;
  eligible: boolean;
};

export type ProjectObservabilityData = {
  pathname: string;
  project: Project;
  user?: LayoutUser | null;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
  sidebarFeaturedDeployment: SidebarFeaturedDeployment | null;
  runtimeLogs: ProjectRuntimeLogsSsr;
};

const ProjectObservabilityPage = ({ data }: { data: ProjectObservabilityData }) => {
  const { project } = data;
  return (
    <Layout
      title={`Observability · ${project.name} · Deployher`}
      pathname={data.pathname}
      scriptSrc="/assets/project-observability-page.js"
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      sidebarContext={{
        project: { id: project.id, name: project.name },
        deployment: data.sidebarFeaturedDeployment
      }}
      csrfToken={data.csrfToken}
      breadcrumbs={[
        { label: "Projects", href: "/projects" },
        { label: project.name, href: `/projects/${project.id}` },
        { label: "Observability" }
      ]}
    >
      <script
        type="application/json"
        id="project-observability-bootstrap"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            projectId: project.id,
            projectName: project.name,
            runtimeLogs: data.runtimeLogs
          }).replace(/</g, "\\u003c")
        }}
      />

      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <a
            href={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground hover:no-underline"
            aria-label={`Back to ${project.name}`}
          >
            <FolderKanban className="size-4" aria-hidden />
            <span>{project.name}</span>
          </a>
          <span className="text-border/80">/</span>
          <h1 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Activity className="size-4" aria-hidden />
            Observability
          </h1>
        </div>
      </div>

      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        Preview traffic is sampled (see sample rate on the traffic card). Client IPs use the{" "}
        <span className="font-mono text-xs">X-Forwarded-For</span> header only when{" "}
        <span className="font-mono text-xs">OBSERVABILITY_TRUST_PROXY</span> is enabled.
      </p>

      <div id="project-observability-root" className="space-y-8" />
    </Layout>
  );
};

export const renderProjectObservabilityPage = (data: ProjectObservabilityData) =>
  renderToReadableStream(<ProjectObservabilityPage data={data} />);
