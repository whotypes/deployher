"use client";

import { useTranslation } from "react-i18next";
import type { WorkspaceDashboardCharts } from "@/lib/workspaceDashboardMetrics";

export const DashboardPageClient = ({
  bootstrap,
}: {
  bootstrap: WorkspaceDashboardCharts;
}) => {
  const { t } = useTranslation();

  const successRateLabel =
    bootstrap.successRate != null
      ? `${Math.round(bootstrap.successRate * 100)}%`
      : t("common.emDash");
  const terminalTotal =
    bootstrap.terminalInRange.success + bootstrap.terminalInRange.failed;

  return (
    <div
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      aria-label={t("dashboard.charts.summaryAria")}
    >
      <div className="dashboard-signal">
        <span>{t("dashboard.charts.successRate7d")}</span>
        <strong>{successRateLabel}</strong>
      </div>
      <div className="dashboard-signal">
        <span>{t("dashboard.charts.terminal7d")}</span>
        <strong>
          <span className="text-emerald-400">
            {bootstrap.terminalInRange.success}
          </span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-red-400">
            {bootstrap.terminalInRange.failed}
          </span>
        </strong>
      </div>
      <div className="dashboard-signal">
        <span>{t("dashboard.charts.queued")}</span>
        <strong>{bootstrap.backlog.queued}</strong>
      </div>
      <div className="dashboard-signal">
        <span>{t("dashboard.charts.building")}</span>
        <strong>{bootstrap.backlog.building}</strong>
        <small>{terminalTotal} terminal</small>
      </div>
    </div>
  );
};
