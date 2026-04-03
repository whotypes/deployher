import { createRoot } from "react-dom/client";
import { LayoutPrefsMenu } from "./LayoutPrefsMenu";

const mount = document.getElementById("layout-prefs-mount");
if (mount) {
  createRoot(mount).render(<LayoutPrefsMenu />);
}
