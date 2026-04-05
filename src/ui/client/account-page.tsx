import { createRoot } from "react-dom/client";
import { AccountDeleteSection, AccountWorkspacePreferences } from "./AccountPageClient";
import { readBootstrapJson } from "./readBootstrapJson";

type AccountBootstrap = {
  hasRepoAccess: boolean;
};

const bootstrap = readBootstrapJson<AccountBootstrap>("account-page-bootstrap", { hasRepoAccess: false });

const workspaceRoot = document.getElementById("account-workspace-root");
const deleteRoot = document.getElementById("account-delete-root");

if (workspaceRoot) {
  createRoot(workspaceRoot).render(
    <AccountWorkspacePreferences hasRepoAccess={bootstrap.hasRepoAccess} />
  );
}
if (deleteRoot) {
  createRoot(deleteRoot).render(<AccountDeleteSection />);
}
