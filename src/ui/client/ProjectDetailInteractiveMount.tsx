import { Suspense, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { parseGitHubRepoUrl } from "../../github";
import {
  ProjectDetailDeployTrigger,
  ProjectDetailHeroSitePreview,
  ProjectDetailSetCurrentRoot,
  type ProjectDetailBootstrap
} from "./ProjectDetailPageClient";
import { LazyRepoCodeExplorer } from "./repo-code-explorer-lazy";

type Props = { bootstrap: ProjectDetailBootstrap };

export const ProjectDetailInteractiveMount = ({ bootstrap }: Props) => {
  const siteMeta = bootstrap.siteMeta;
  const siteIconUrl = siteMeta?.siteIconUrl ?? "";
  const siteOgImageUrl = siteMeta?.siteOgImageUrl ?? "";
  const siteMetaFetchedAt = siteMeta?.siteMetaFetchedAt ?? "";
  const siteMetaError = siteMeta?.siteMetaError ?? "";

  useEffect(() => {
    const roots: Root[] = [];
    const { projectId } = bootstrap;
    if (!projectId) {
      return () => {
        roots.forEach((r) => {
          try {
            r.unmount();
          } catch {
            /* ignore */
          }
        });
      };
    }

    const deployMainLabel = bootstrap.hasSuccessfulDeployment ? "Re-deploy" : "Deploy";

    const mainRoot = document.getElementById("project-detail-deploy-main-root");
    if (mainRoot) {
      const r = createRoot(mainRoot);
      r.render(<ProjectDetailDeployTrigger projectId={projectId} label={deployMainLabel} />);
      roots.push(r);
    }

    const setCurrentRoot = document.getElementById("project-detail-set-current-root");
    if (setCurrentRoot) {
      const r = createRoot(setCurrentRoot);
      r.render(<ProjectDetailSetCurrentRoot projectId={projectId} />);
      roots.push(r);
    }

    const heroPreviewRoot = document.getElementById("project-detail-hero-preview-root");
    if (heroPreviewRoot && bootstrap.currentPreviewUrl && bootstrap.siteMeta) {
      const r = createRoot(heroPreviewRoot);
      r.render(
        <ProjectDetailHeroSitePreview
          projectId={projectId}
          projectName={bootstrap.projectName}
          previewUrl={bootstrap.currentPreviewUrl}
          initial={bootstrap.siteMeta}
        />
      );
      roots.push(r);
    }

    const explorerRoot = document.getElementById("project-detail-repo-explorer-root");
    if (explorerRoot) {
      const spec = parseGitHubRepoUrl(bootstrap.repoUrl);
      if (spec && bootstrap.branch.trim()) {
        const r = createRoot(explorerRoot);
        r.render(
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
              previewBaseUrl={bootstrap.currentPreviewUrl ?? undefined}
            />
          </Suspense>
        );
        roots.push(r);
      }
    }

    return () => {
      roots.forEach((r) => {
        try {
          r.unmount();
        } catch {
          /* ignore */
        }
      });
    };
  }, [
    bootstrap.projectId,
    bootstrap.projectName,
    bootstrap.repoUrl,
    bootstrap.branch,
    bootstrap.projectRootDir,
    bootstrap.currentPreviewUrl,
    bootstrap.hasSuccessfulDeployment,
    siteIconUrl,
    siteOgImageUrl,
    siteMetaFetchedAt,
    siteMetaError
  ]);

  return null;
};
