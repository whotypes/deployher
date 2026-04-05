import { createRoot } from "react-dom/client";
import type { ProjectSettingsData } from "../ProjectSettingsPage";
import { ProjectSettingsPageClient } from "./ProjectSettingsPageClient";
import { readBootstrapJson } from "./readBootstrapJson";

const bootstrap = readBootstrapJson<ProjectSettingsData | null>("project-settings-bootstrap", null);
const root = document.getElementById("project-settings-client-root");

if (root && bootstrap) {
  createRoot(root).render(<ProjectSettingsPageClient data={bootstrap} />);
}
