import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { ProjectSettingsData } from "@/ui/ProjectSettingsPage";
import { ProjectSettingsPage } from "@/ui/ProjectSettingsPage";
import { fetchJson } from "../api";

const sectionPath = (section: "general" | "env" | "danger"): string => {
  switch (section) {
    case "general":
      return "general";
    case "env":
      return "env";
    case "danger":
      return "danger";
    default:
      return "general";
  }
};

export const ProjectSettingsRoute = ({
  section
}: {
  section: "general" | "env" | "danger";
}) => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProjectSettingsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    document.title = t("meta.settingsFallbackTitle", { appName: t("common.appName") });
  }, [id, t]);

  useEffect(() => {
    if (!id) return;
    const path = sectionPath(section);
    fetchJson<ProjectSettingsData>(`/api/ui/projects/${encodeURIComponent(id)}/settings/${path}`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [id, section, t]);

  if (!id) {
    return <div className="text-destructive p-6">{t("routes.missingProjectId")}</div>;
  }
  if (error) {
    return <div className="text-destructive p-6">{error}</div>;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <ProjectSettingsPage data={data} />;
};
