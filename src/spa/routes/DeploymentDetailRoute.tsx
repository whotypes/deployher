import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@/spa/routerCompat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DeploymentDetailData } from "@/ui/DeploymentDetailPage";
import { DeploymentDetailPage } from "@/ui/DeploymentDetailPage";
import { ResourceNotFoundHero } from "@/ui/resource-not-found-hero";
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
    return <div className="text-destructive p-6">{t("routes.missingDeploymentId")}</div>;
  }
  if (notFound) {
    return (
      <ResourceNotFoundHero
        eyebrow={t("routes.deploymentNotFoundEyebrow")}
        title={t("routes.deploymentNotFoundTitle")}
        description={t("routes.deploymentNotFoundBody")}
        primaryCta={{ to: "/dashboard", label: t("routes.deploymentNotFoundCta") }}
        secondaryCta={{ to: "/projects", label: t("routes.deploymentNotFoundSecondaryCta") }}
      />
    );
  }
  if (error) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center p-6">
        <Card className="w-full max-w-md border-destructive/30">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">{t("common.fetchFailed")}</CardTitle>
            <CardDescription className="text-muted-foreground">{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => setDetailRefresh((n) => n + 1)}>
              {t("common.refresh")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return (
    <DeploymentDetailPage data={data} onRequestDeploymentRefetch={() => setDetailRefresh((n) => n + 1)} />
  );
};
