import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { HealthData } from "@/health/HealthPage";
import { HealthPage } from "@/health/HealthPage";
import { fetchJson } from "../api";

export const HealthRoute = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = t("meta.healthTitle", { appName: t("common.appName") });
  }, [t]);

  useEffect(() => {
    fetchJson<HealthData>("/api/ui/health-page")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [t]);

  if (error) {
    return <div className="text-destructive p-6">{error}</div>;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <HealthPage data={data} />;
};
