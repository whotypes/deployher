import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminExamplesPageData } from "@/ui/AdminExamplesPage";
import { AdminExamplesPage } from "@/ui/AdminExamplesPage";
import { WorkspaceAdminAccessDenied, WorkspaceFetchErrorCard } from "../workspaceRouteChrome";
import { fetchJson } from "../api";

export const AdminRoute = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<AdminExamplesPageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adminRefresh, setAdminRefresh] = useState(0);

  useEffect(() => {
    document.title = t("meta.adminExamplesTitle");
  }, [t]);

  useEffect(() => {
    setError(null);
    fetchJson<AdminExamplesPageData>("/api/ui/admin/examples")
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : t("common.fetchFailed")));
  }, [t, adminRefresh]);

  if (error === "Forbidden") {
    return <WorkspaceAdminAccessDenied />;
  }
  if (error) {
    return <WorkspaceFetchErrorCard error={error} onRetry={() => setAdminRefresh((n) => n + 1)} />;
  }
  if (!data) {
    return <div className="text-muted-foreground p-6">{t("common.loading")}</div>;
  }
  return <AdminExamplesPage data={data} />;
};
