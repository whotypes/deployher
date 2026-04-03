import { createRoot } from "react-dom/client";
import { ProjectsPageClient, type ProjectsPageClientProps } from "./ProjectsPageClient";

const parseBootstrap = (): ProjectsPageClientProps => {
  const el = document.getElementById("projects-page-bootstrap");
  if (!el?.textContent?.trim()) {
    return { hasRepoAccess: false, githubLinked: false };
  }
  try {
    const raw = JSON.parse(el.textContent) as Partial<ProjectsPageClientProps>;
    return {
      hasRepoAccess: Boolean(raw.hasRepoAccess),
      githubLinked: Boolean(raw.githubLinked)
    };
  } catch {
    return { hasRepoAccess: false, githubLinked: false };
  }
};

const rootEl = document.getElementById("projects-client-root");
if (rootEl) {
  const props = parseBootstrap();
  createRoot(rootEl).render(<ProjectsPageClient {...props} />);
}
