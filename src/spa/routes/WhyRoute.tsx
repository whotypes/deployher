import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { WhyPage } from "@/ui/WhyPage";

export const WhyRoute = () => {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t("meta.whyDocumentTitle", { appName: t("common.appName") });
  }, [t]);
  return <WhyPage />;
};
