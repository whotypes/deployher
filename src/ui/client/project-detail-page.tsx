import { Suspense } from "react";
import { createRoot } from "react-dom/client";
import { parseGitHubRepoUrl } from "../../github";
import {
  ProjectDetailDeployTrigger,
  ProjectDetailHeroSitePreview,
  ProjectDetailSetCurrentRoot,
  type ProjectDetailBootstrap
} from "./ProjectDetailPageClient";
import { ProjectDeploymentsPanel } from "./ProjectDeploymentsPanel";
import { readBootstrapJson } from "./readBootstrapJson";
import { LazyRepoCodeExplorer } from "./repo-code-explorer-lazy";

const bootstrap = readBootstrapJson<ProjectDetailBootstrap>("project-detail-page-bootstrap", {
  projectId: "",
  repoUrl: "",
  branch: "",
  projectRootDir: ".",
  currentPreviewUrl: null,
  hasSuccessfulDeployment: false,
  siteMeta: null,
  deployments: [],
  currentDeploymentId: null
});
const { projectId } = bootstrap;
if (!projectId) {
  throw new Error("project-detail-page: missing projectId in bootstrap");
}

const mainRoot = document.getElementById("project-detail-deploy-main-root");
const deployMainLabel = bootstrap.hasSuccessfulDeployment ? "Re-deploy" : "Deploy";

if (mainRoot) {
  createRoot(mainRoot).render(<ProjectDetailDeployTrigger projectId={projectId} label={deployMainLabel} />);
}

const setCurrentRoot = document.getElementById("project-detail-set-current-root");
if (setCurrentRoot) {
  createRoot(setCurrentRoot).render(<ProjectDetailSetCurrentRoot projectId={projectId} />);
}

const heroPreviewRoot = document.getElementById("project-detail-hero-preview-root");
if (heroPreviewRoot && bootstrap.currentPreviewUrl && bootstrap.siteMeta) {
  createRoot(heroPreviewRoot).render(
    <ProjectDetailHeroSitePreview
      projectId={projectId}
      previewUrl={bootstrap.currentPreviewUrl}
      initial={bootstrap.siteMeta}
    />
  );
}

const deploymentsRoot = document.getElementById("project-detail-deployments-root");
const deploymentRows = bootstrap.deployments ?? [];
if (deploymentsRoot && deploymentRows.length > 0) {
  createRoot(deploymentsRoot).render(
    <ProjectDeploymentsPanel
      deployments={deploymentRows}
      currentDeploymentId={bootstrap.currentDeploymentId ?? null}
    />
  );
}

const explorerRoot = document.getElementById("project-detail-repo-explorer-root");
if (explorerRoot) {
  const spec = parseGitHubRepoUrl(bootstrap.repoUrl);
  if (spec && bootstrap.branch.trim()) {
    createRoot(explorerRoot).render(
      <Suspense
        fallback={
          <p className="text-muted-foreground text-sm" role="status">
            Loading repository browser…
          </p>
        }
      >
        <LazyRepoCodeExplorer
          owner={spec.owner}
          repo={spec.repo}
          ref={bootstrap.branch.trim()}
          projectRoot={bootstrap.projectRootDir.trim() === "" ? "." : bootstrap.projectRootDir.trim()}
        />
      </Suspense>
    );
  }
}
