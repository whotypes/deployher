import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LoginRouteInner } from "@/ui/LoginPage";

export const LoginRoute = () => {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = t("meta.signInDocumentTitle", { appName: t("common.appName") });
  }, [t]);
  return <LoginRouteInner />;
};
