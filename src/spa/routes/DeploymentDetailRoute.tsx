import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { DeploymentDetailData } from "@/ui/DeploymentDetailPage";
import { DeploymentDetailPage } from "@/ui/DeploymentDetailPage";
import { fetchJson } from "../api";

export const DeploymentDetailRoute = () => {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<DeploymentDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    document.title = t("meta.deploymentFallbackTitle", { appName: t("common.appName") });
  }, [id, t]);

  useEffect(() => {
    if (!id) return;
    fetchJson<DeploymentDetailData>(`/api/ui/deployments/${encodeURIComponent(id)}/detail`)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [id, t]);

  if (!id) {
    return <div className="text-destructive p-6">{t("routes.missingDeploymentId")}</div>;
  }
  if (error) {
    return <div className="text-destructive p-6">{error}</div>;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <DeploymentDetailPage data={data} />;
};
