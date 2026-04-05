import { createRoot } from "react-dom/client";
import { NewProjectPageClient, type NewProjectPageClientProps } from "./NewProjectPageClient";
import { readBootstrapJson } from "./readBootstrapJson";

const rootEl = document.getElementById("new-project-client-root");
if (rootEl) {
  const raw = readBootstrapJson<Partial<NewProjectPageClientProps>>("new-project-page-bootstrap", {});
  const props: NewProjectPageClientProps = {
    hasRepoAccess: Boolean(raw.hasRepoAccess),
    githubLinked: Boolean(raw.githubLinked)
  };
  createRoot(rootEl).render(<NewProjectPageClient {...props} />);
}
