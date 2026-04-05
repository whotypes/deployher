import { hydrateRoot } from "react-dom/client";
import { DeployherSidebar, type DeployherSidebarProps } from "@/ui/DeployherSidebar";

const rootEl = document.getElementById("deployher-sidebar-hydrate-root");
const script = document.getElementById("deployher-sidebar-props");

if (rootEl && script?.textContent) {
  try {
    const props = JSON.parse(script.textContent) as DeployherSidebarProps;
    hydrateRoot(rootEl, <DeployherSidebar {...props} />);
  } catch {
    console.error("deployher: sidebar hydrate failed (invalid props json)");
  }
}
