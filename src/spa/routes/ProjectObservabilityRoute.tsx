import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@/spa/routerCompat";
import type { ProjectObservabilityData } from "@/ui/ProjectObservabilityPage";
import { ProjectObservabilityPage } from "@/ui/ProjectObservabilityPage";
import {
  WorkspaceFetchErrorCard,
  WorkspaceProjectNotFoundHero,
  WorkspaceRouteMessage
} from "../workspaceRouteChrome";
import { FetchJsonError, fetchJson } from "../api";

export const ProjectObservabilityRoute = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ProjectObservabilityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!id) return;
    document.title = t("meta.observabilityFallbackTitle", { appName: t("common.appName") });
  }, [id, t]);

  useEffect(() => {
    if (!id) return;
    setNotFound(false);
    setError(null);
    fetchJson<ProjectObservabilityData>(`/api/ui/projects/${encodeURIComponent(id)}/observability`)
      .then(setData)
      .catch((e: unknown) => {
        if (e instanceof FetchJsonError && e.status === 404) {
          setNotFound(true);
          return;
        }
        setError(e instanceof Error ? e.message : t("common.fetchFailed"));
      });
  }, [id, refresh, t]);

  useEffect(() => {
    if (!notFound) return;
    document.title = t("meta.projectNotFoundDocumentTitle", { appName: t("common.appName") });
  }, [notFound, t]);

  if (!id) {
    return <WorkspaceRouteMessage variant="destructive" message={t("routes.missingProjectId")} />;
  }
  if (notFound) {
    return (
      <WorkspaceProjectNotFoundHero
        eyebrow={t("routes.projectNotFoundEyebrow")}
        title={t("routes.projectNotFoundTitle")}
        description={t("routes.projectNotFoundBody")}
        primaryCta={{ to: "/dashboard", label: t("routes.projectNotFoundCta") }}
        secondaryCta={{ to: "/projects", label: t("routes.projectNotFoundSecondaryCta") }}
      />
    );
  }
  if (error) {
    return <WorkspaceFetchErrorCard error={error} onRetry={() => setRefresh((n) => n + 1)} />;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <ProjectObservabilityPage data={data} />;
};
