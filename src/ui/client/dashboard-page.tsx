import { createRoot } from "react-dom/client";
import type { WorkspaceDashboardCharts } from "@/lib/workspaceDashboardMetrics";
import { DashboardPageClient } from "./DashboardPageClient";
import { readBootstrapJson } from "./readBootstrapJson";

const emptyCharts: WorkspaceDashboardCharts = {
  rangeDays: 7,
  deployBuckets: [],
  trafficBuckets: [],
  backlog: { queued: 0, building: 0 },
  terminalInRange: { success: 0, failed: 0 },
  successRate: null
};

const bootstrap = readBootstrapJson<WorkspaceDashboardCharts>("dashboard-charts-bootstrap", emptyCharts);

const root = document.getElementById("dashboard-charts-root");

if (root) {
  createRoot(root).render(<DashboardPageClient bootstrap={bootstrap} />);
}
