import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardPage } from "@/ui/DashboardPage";
import type { DashboardData } from "@/ui/DashboardPage";
import { fetchJson } from "../api";

export const DashboardRoute = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = t("meta.titleWithApp", { page: t("dashboard.pageTitle"), appName: t("common.appName") });
  }, [t]);

  useEffect(() => {
    fetchJson<DashboardData>("/api/workspace/dashboard")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [t]);

  if (error) {
    return <div className="text-destructive p-6">{error}</div>;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <DashboardPage data={data} />;
};
