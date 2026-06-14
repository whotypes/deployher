import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { useWorkspaceChrome } from "@/spa/workspaceChromeContext";
import { AdminExamplesPageClient } from "./client/AdminExamplesPageClient";

type BuildSettings = {
  memory: string;
  cpus: string;
  accountMaxConcurrent: number;
};

type ExampleDeployment = {
  id: string;
  shortId: string;
  status: "queued" | "building" | "success" | "failed";
  createdAt: string;
  finishedAt: string | null;
  previewUrl: string | null;
};

type ExampleRow = {
  name: string;
  projectId: string | null;
  latestDeployment: ExampleDeployment | null;
};

export type AdminExamplesPageData = {
  pathname: string;
  user?: LayoutUser | null;
  examples: ExampleRow[];
  buildSettings: BuildSettings;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
};

export const AdminExamplesPage = ({ data }: { data: AdminExamplesPageData }) => {
  const { t } = useTranslation();
  const chrome = useMemo(
    () => ({
      title: t("meta.adminExamplesTitle"),
      breadcrumbs: [{ label: t("dashboard.admin") }]
    }),
    [t]
  );
  useWorkspaceChrome(chrome);
  return (
    <>
      <AdminExamplesPageClient
        initialExamples={data.examples}
        initialBuildSettings={data.buildSettings}
      />
    </>
  );
};
