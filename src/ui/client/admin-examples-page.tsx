import { createRoot } from "react-dom/client";
import {
  AdminExamplesPageClient,
  type AdminBuildSettings,
  type AdminExampleRow
} from "./AdminExamplesPageClient";
import { readBootstrapJson } from "./readBootstrapJson";

type AdminBootstrap = {
  examples: AdminExampleRow[];
  buildSettings: AdminBuildSettings;
};

const bootstrap = readBootstrapJson<AdminBootstrap>("admin-page-bootstrap", {
  examples: [],
  buildSettings: { memory: "", cpus: "", accountMaxConcurrent: 1 }
});

const root = document.getElementById("admin-client-root");
if (root) {
  createRoot(root).render(
    <AdminExamplesPageClient
      initialExamples={bootstrap.examples}
      initialBuildSettings={bootstrap.buildSettings}
    />
  );
}
