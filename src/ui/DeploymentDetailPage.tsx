import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "@/ui/layoutUser";
import { useWorkspaceChrome } from "@/spa/workspaceChromeContext";
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
  const chrome = useMemo(
    () => {
      const row = data.sidebarProjects.find((p) => p.id === data.project.id);
      return {
      title: t("meta.deploymentTitle", { shortId: data.deployment.shortId, appName: t("common.appName") }),
      breadcrumbs: [
        { label: t("common.projects"), href: "/projects" },
        { label: data.project.name, href: `/projects/${data.project.id}` },
        { label: data.deployment.shortId }
      ],
      sidebarContext: {
        project: {
          id: data.project.id,
          name: data.project.name,
          siteIconUrl: row?.siteIconUrl ?? null,
          previewUrl: row?.previewUrl ?? null
        },
        deployment: data.sidebarFeaturedDeployment
      }
      };
    },
    [
      t,
      data.deployment.shortId,
      data.project.id,
      data.project.name,
      data.sidebarFeaturedDeployment,
      data.sidebarProjects
    ]
  );
  useWorkspaceChrome(chrome);
  return (
    <div id="deployment-detail-client-root">
      <DeploymentDetailPageClient
        initialData={data}
        onRequestDeploymentRefetch={onRequestDeploymentRefetch}
      />
    </div>
  );
};
