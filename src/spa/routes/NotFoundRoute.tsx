import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NotFoundPage } from "@/ui/NotFoundPage";

export const NotFoundRoute = () => {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t("meta.notFoundDocumentTitle", { appName: t("common.appName") });
  }, [t]);
  return <NotFoundPage />;
};
