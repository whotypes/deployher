import { createRoot } from "react-dom/client";
import type { DeploymentDetailData } from "../DeploymentDetailPage";
import { DeploymentDetailPageClient } from "./DeploymentDetailPageClient";
import { readBootstrapJson } from "./readBootstrapJson";

const bootstrap = readBootstrapJson<DeploymentDetailData | null>("deployment-detail-bootstrap", null);
const root = document.getElementById("deployment-detail-client-root");

if (root && bootstrap) {
  createRoot(root).render(<DeploymentDetailPageClient initialData={bootstrap} />);
}
