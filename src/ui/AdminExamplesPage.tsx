import { useTranslation } from "react-i18next";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { AppShell } from "./AppShell";
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
  return (
    <AppShell
      title={t("meta.adminExamplesTitle")}
      pathname={data.pathname}
      user={data.user ?? null}
      breadcrumbs={[{ label: t("dashboard.admin") }]}
      sidebarProjects={data.sidebarProjects}
    >
      <div
        id="notification"
        aria-live="polite"
        className="hidden fixed top-17 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg"
      />
      <AdminExamplesPageClient
        initialExamples={data.examples}
        initialBuildSettings={data.buildSettings}
      />
    </AppShell>
  );
};
