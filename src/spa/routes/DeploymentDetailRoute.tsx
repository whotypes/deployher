import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@/spa/routerCompat";
import type { DeploymentDetailData } from "@/ui/DeploymentDetailPage";
import { DeploymentDetailPage } from "@/ui/DeploymentDetailPage";
import {
  WorkspaceDeploymentNotFoundHero,
  WorkspaceFetchErrorCard,
  WorkspaceRouteMessage
} from "../workspaceRouteChrome";
import { FetchJsonError, fetchJson } from "../api";

export const DeploymentDetailRoute = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DeploymentDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);

  useEffect(() => {
    if (!id) return;
    document.title = t("meta.deploymentFallbackTitle", { appName: t("common.appName") });
  }, [id, t]);

  useEffect(() => {
    if (!id) return;
    setNotFound(false);
    setError(null);
    fetchJson<DeploymentDetailData>(`/api/ui/deployments/${encodeURIComponent(id)}/detail`)
      .then(setData)
      .catch((e: unknown) => {
        if (e instanceof FetchJsonError && e.status === 404) {
          setNotFound(true);
          return;
        }
        setError(e instanceof Error ? e.message : t("common.fetchFailed"));
      });
  }, [id, detailRefresh, t]);

  useEffect(() => {
    if (!notFound) return;
    document.title = t("meta.deploymentNotFoundDocumentTitle", { appName: t("common.appName") });
  }, [notFound, t]);

  if (!id) {
    return <WorkspaceRouteMessage variant="destructive" message={t("routes.missingDeploymentId")} />;
  }
  if (notFound) {
    return (
      <WorkspaceDeploymentNotFoundHero
        eyebrow={t("routes.deploymentNotFoundEyebrow")}
        title={t("routes.deploymentNotFoundTitle")}
        description={t("routes.deploymentNotFoundBody")}
        primaryCta={{ to: "/dashboard", label: t("routes.deploymentNotFoundCta") }}
        secondaryCta={{ to: "/projects", label: t("routes.deploymentNotFoundSecondaryCta") }}
      />
    );
  }
  if (error) {
    return <WorkspaceFetchErrorCard error={error} onRetry={() => setDetailRefresh((n) => n + 1)} />;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return (
    <DeploymentDetailPage data={data} onRequestDeploymentRefetch={() => setDetailRefresh((n) => n + 1)} />
  );
};
