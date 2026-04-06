import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminExamplesPageData } from "@/ui/AdminExamplesPage";
import { AdminExamplesPage } from "@/ui/AdminExamplesPage";
import { fetchJson } from "../api";

export const AdminRoute = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<AdminExamplesPageData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = t("meta.adminExamplesTitle");
  }, [t]);

  useEffect(() => {
    fetchJson<AdminExamplesPageData>("/api/ui/admin/examples")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [t]);

  if (error === "Forbidden") {
    return <div className="text-muted-foreground p-6">{t("admin.accessDenied")}</div>;
  }
  if (error) {
    return <div className="text-destructive p-6">{error}</div>;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <AdminExamplesPage data={data} />;
};
