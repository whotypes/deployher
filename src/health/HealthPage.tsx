import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { LayoutUser, SidebarProjectSummary } from "../ui/layoutUser";
import { useWorkspaceChrome } from "@/spa/workspaceChromeContext";
import { HealthPageClient } from "../ui/client/HealthPageClient";

export type HealthData = {
  pathname?: string;
  status: "ok" | "degraded" | "down";
  environment: string;
  uptimeSeconds: number;
  startedAt: string;
  now: string;
  bunVersion: string;
  hostname: string;
  port: number;
  pid: number;
  pendingRequests: number;
  pendingWebSockets: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  domains: {
    dev: string;
    prod: string;
  };
  user?: LayoutUser | null;
  sidebarProjects?: SidebarProjectSummary[];
};

export const HealthPage = ({ data }: { data: HealthData }) => {
  const { t } = useTranslation();
  const chrome = useMemo(
    () => ({
      title: t("meta.healthTitle", { appName: t("common.appName") }),
      breadcrumbs: [
        { label: t("dashboard.pageTitle"), href: "/dashboard" },
        { label: t("health.breadcrumb") }
      ]
    }),
    [t]
  );
  useWorkspaceChrome(chrome);
  return <HealthPageClient initialData={data} />;
};
