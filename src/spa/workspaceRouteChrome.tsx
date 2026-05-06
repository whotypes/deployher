import type { ComponentProps } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResourceNotFoundHero } from "@/ui/resource-not-found-hero";
import { useWorkspaceChrome } from "./workspaceChromeContext";

export const WorkspaceProjectNotFoundHero = (props: ComponentProps<typeof ResourceNotFoundHero>) => {
  const { t } = useTranslation();
  const chrome = useMemo(
    () => ({
      title: t("meta.projectNotFoundDocumentTitle", { appName: t("common.appName") }),
      breadcrumbs: [
        { label: t("common.projects"), href: "/projects" },
        { label: t("routes.projectNotFoundTitle") }
      ]
    }),
    [t]
  );
  useWorkspaceChrome(chrome);
  return <ResourceNotFoundHero {...props} />;
};

export const WorkspaceDeploymentNotFoundHero = (props: ComponentProps<typeof ResourceNotFoundHero>) => {
  const { t } = useTranslation();
  const chrome = useMemo(
    () => ({
      title: t("meta.deploymentNotFoundDocumentTitle", { appName: t("common.appName") }),
      breadcrumbs: [
        { label: t("common.projects"), href: "/projects" },
        { label: t("routes.deploymentNotFoundTitle") }
      ]
    }),
    [t]
  );
  useWorkspaceChrome(chrome);
  return <ResourceNotFoundHero {...props} />;
};

export const WorkspaceFetchErrorCard = ({
  error,
  onRetry
}: {
  error: string;
  onRetry: () => void;
}) => {
  const { t } = useTranslation();
  const chrome = useMemo(
    () => ({
      title: t("common.fetchFailed"),
      breadcrumbs: [{ label: t("common.fetchFailed") }]
    }),
    [t]
  );
  useWorkspaceChrome(chrome);
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <Card className="w-full max-w-md border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg text-destructive">{t("common.fetchFailed")}</CardTitle>
          <CardDescription className="text-muted-foreground">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onRetry}>
            {t("common.refresh")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export const WorkspaceRouteMessage = ({
  variant,
  message
}: {
  variant: "destructive" | "muted";
  message: string;
}) => {
  const chrome = useMemo(
    () => ({
      title: message,
      breadcrumbs: [{ label: message }]
    }),
    [message]
  );
  useWorkspaceChrome(chrome);
  const className =
    variant === "destructive" ? "text-destructive p-6" : "text-muted-foreground p-6";
  return <div className={className}>{message}</div>;
};

export const WorkspaceAdminAccessDenied = () => {
  const { t } = useTranslation();
  const chrome = useMemo(
    () => ({
      title: t("admin.accessDenied"),
      breadcrumbs: [{ label: t("admin.accessDenied") }]
    }),
    [t]
  );
  useWorkspaceChrome(chrome);
  return <div className="text-muted-foreground p-6">{t("admin.accessDenied")}</div>;
};
