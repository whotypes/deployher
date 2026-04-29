import { useTranslation } from "react-i18next";
import { Link } from "@/spa/routerCompat";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "@/ui/layoutUser";
import { AppShell } from "./AppShell";
import { ProjectObservabilityPageClient } from "./client/ProjectObservabilityPageClient";
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

export const ProjectObservabilityPage = ({ data }: { data: ProjectObservabilityData }) => {
  const { t } = useTranslation();
  const { project } = data;
  const bootstrap = {
    projectId: project.id,
    projectName: project.name,
    runtimeLogs: data.runtimeLogs
  };

  return (
    <AppShell
      title={t("meta.observabilityTitle", { name: project.name, appName: t("common.appName") })}
      pathname={data.pathname}
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      sidebarContext={{
        project: { id: project.id, name: project.name },
        deployment: data.sidebarFeaturedDeployment
      }}
      breadcrumbs={[
        { label: t("common.projects"), href: "/projects" },
        { label: project.name, href: `/projects/${project.id}` },
        { label: t("projectObservability.pageHeading") }
      ]}
    >
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground hover:no-underline"
            aria-label={t("projectSettings.backToAria", { name: project.name })}
          >
            <FolderKanban className="size-4" aria-hidden />
            <span>{project.name}</span>
          </Link>
          <span className="text-border/80">/</span>
          <h1 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Activity className="size-4" aria-hidden />
            {t("projectObservability.pageHeading")}
          </h1>
        </div>
      </div>

      <p className="mb-6 max-w-2xl text-sm text-muted-foreground">
        {t("projectObservability.intro", { header: "X-Forwarded-For" })}
      </p>

      <div id="project-observability-root" className="space-y-8">
        <ProjectObservabilityPageClient bootstrap={bootstrap} />
      </div>
    </AppShell>
  );
};
