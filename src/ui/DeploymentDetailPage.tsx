import { useTranslation } from "react-i18next";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "@/ui/layoutUser";
import { AppShell } from "./AppShell";
import { DeploymentDetailPageClient } from "./client/DeploymentDetailPageClient";

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
  /** Server + runtime image + runner configured; user can warm the isolated preview container. */
  previewEnsureAvailable: boolean;
};

export const DeploymentDetailPage = ({
  data,
  onRequestDeploymentRefetch
}: {
  data: DeploymentDetailData;
  onRequestDeploymentRefetch?: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <AppShell
      title={t("meta.deploymentTitle", { shortId: data.deployment.shortId, appName: t("common.appName") })}
      pathname={data.pathname}
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      sidebarContext={{
        project: {
          id: data.project.id,
          name: data.project.name
        },
        deployment: data.sidebarFeaturedDeployment
      }}
      breadcrumbs={[
        { label: t("common.projects"), href: "/projects" },
        { label: data.project.name, href: `/projects/${data.project.id}` },
        { label: data.deployment.shortId }
      ]}
    >
      <div id="deployment-detail-client-root">
        <DeploymentDetailPageClient
          initialData={data}
          onRequestDeploymentRefetch={onRequestDeploymentRefetch}
        />
      </div>
    </AppShell>
  );
};
