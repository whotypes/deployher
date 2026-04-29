import { useTranslation } from "react-i18next";
import { ResourceNotFoundHero } from "./resource-not-found-hero";

export const NotFoundPage = () => {
  const { t } = useTranslation();
  return (
    <ResourceNotFoundHero
      eyebrow={t("notFound.eyebrow")}
      title={t("notFound.title")}
      description={t("notFound.body")}
      primaryCta={{
        to: "/dashboard",
        label: t("notFound.backDashboard"),
        ariaLabel: t("notFound.goDashboardAria")
      }}
      secondaryCta={{
        to: "/projects",
        label: t("notFound.browseProjects"),
        ariaLabel: t("notFound.browseProjectsAria")
      }}
    />
  );
};
