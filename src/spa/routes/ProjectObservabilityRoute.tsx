import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@/spa/routerCompat";
import type { ProjectObservabilityData } from "@/ui/ProjectObservabilityPage";
import { ProjectObservabilityPage } from "@/ui/ProjectObservabilityPage";
import { fetchJson } from "../api";

export const ProjectObservabilityRoute = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProjectObservabilityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    document.title = t("meta.observabilityFallbackTitle", { appName: t("common.appName") });
  }, [id, t]);

  useEffect(() => {
    if (!id) return;
    fetchJson<ProjectObservabilityData>(`/api/ui/projects/${encodeURIComponent(id)}/observability`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [id, t]);

  if (!id) {
    return <div className="text-destructive p-6">{t("routes.missingProjectId")}</div>;
  }
  if (error) {
    return <div className="text-destructive p-6">{error}</div>;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <ProjectObservabilityPage data={data} />;
};
