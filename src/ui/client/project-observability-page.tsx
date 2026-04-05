import { createRoot } from "react-dom/client";
import {
  ProjectObservabilityPageClient,
  type ProjectObservabilityBootstrap
} from "./ProjectObservabilityPageClient";
import { readBootstrapJson } from "./readBootstrapJson";

const bootstrap = readBootstrapJson<ProjectObservabilityBootstrap>(
  "project-observability-bootstrap",
  {
    projectId: "",
    projectName: "",
    runtimeLogs: {
      available: false,
      deploymentId: null,
      deploymentShortId: null,
      eligible: false
    }
  }
);

const root = document.getElementById("project-observability-root");

if (root && bootstrap.projectId) {
  createRoot(root).render(<ProjectObservabilityPageClient bootstrap={bootstrap} />);
}
