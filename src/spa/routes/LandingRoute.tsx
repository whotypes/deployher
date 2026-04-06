import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LandingPage } from "@/ui/LandingPage";
import { fetchJson } from "../api";

export const LandingRoute = () => {
  const { t } = useTranslation();
  const [authenticated, setAuthenticated] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    document.title = t("meta.landingDocumentTitle");
  }, [t]);

  useEffect(() => {
    fetchJson<{ authenticated: boolean }>("/api/ui/landing")
      .then((j) => setAuthenticated(j.authenticated))
      .catch(() => setAuthenticated(false))
      .finally(() => setReady(true));
  }, []);

  if (!ready) {
    return (
      <div className="bg-background text-foreground flex min-h-svh items-center justify-center">{t("common.loading")}</div>
    );
  }

  return <LandingPage authenticated={authenticated} />;
};
