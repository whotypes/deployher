import { hydrateRoot } from "react-dom/client";
import { PdploySidebar, type PdploySidebarProps } from "@/ui/PdploySidebar";

const rootEl = document.getElementById("pdploy-sidebar-hydrate-root");
const script = document.getElementById("pdploy-sidebar-props");

if (rootEl && script?.textContent) {
  try {
    const props = JSON.parse(script.textContent) as PdploySidebarProps;
    hydrateRoot(rootEl, <PdploySidebar {...props} />);
  } catch {
    console.error("pdploy: sidebar hydrate failed (invalid props json)");
  }
}
