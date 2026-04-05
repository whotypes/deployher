import { createRoot } from "react-dom/client";
import type { HealthData } from "../../health/HealthPage";
import { HealthPageClient } from "./HealthPageClient";
import { readBootstrapJson } from "./readBootstrapJson";

const bootstrap = readBootstrapJson<HealthData | null>("health-page-bootstrap", null);
const root = document.getElementById("health-client-root");

if (root && bootstrap) {
  createRoot(root).render(<HealthPageClient initialData={bootstrap} />);
}
