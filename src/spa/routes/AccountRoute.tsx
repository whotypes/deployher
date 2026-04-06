import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AccountPageData } from "@/ui/AccountPage";
import { AccountPage } from "@/ui/AccountPage";
import { fetchJson } from "../api";

export const AccountRoute = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<AccountPageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = t("meta.titleWithApp", { page: t("account.pageTitle"), appName: t("common.appName") });
  }, [t]);

  useEffect(() => {
    fetchJson<AccountPageData>("/api/ui/account")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [t]);

  if (error) {
    return <div className="text-destructive p-6">{error}</div>;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <AccountPage data={data} />;
};
