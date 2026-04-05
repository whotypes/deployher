import { createRoot } from "react-dom/client";
import { ProjectSwitcher } from "./ProjectSwitcher";

const mount = document.getElementById("project-switcher-mount");
if (mount) {
  createRoot(mount).render(<ProjectSwitcher />);
}
