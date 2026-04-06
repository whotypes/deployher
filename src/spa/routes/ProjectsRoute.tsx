import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ProjectsPageData } from "@/ui/ProjectsPage";
import { ProjectsPage } from "@/ui/ProjectsPage";
import { fetchJson } from "../api";

export const ProjectsRoute = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<ProjectsPageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = t("meta.titleWithApp", { page: t("projects.pageTitle"), appName: t("common.appName") });
  }, [t]);

  useEffect(() => {
    fetchJson<ProjectsPageData>("/api/ui/projects-page")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [t]);

  if (error) {
    return <div className="text-destructive p-6">{error}</div>;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <ProjectsPage data={data} />;
};
