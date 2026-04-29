import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { fetchWithCsrf } from "./fetchWithCsrf";
import { showPageToast } from "./pageNotifications";
import { useProjectGlyphImage } from "./useProjectGlyphImage";

export type ProjectDetailSiteMetaBootstrap = {
  siteIconUrl: string | null;
  siteOgImageUrl: string | null;
  siteMetaFetchedAt: string | null;
  siteMetaError: string | null;
};

export type ProjectDeploymentRowBootstrap = {
  id: string;
  shortId: string;
  status: string;
  serveStrategy: "static" | "server";
  buildPreviewMode: "auto" | "static" | "server" | null;
  previewUrl: string | null;
  createdAt: string;
};

export type ProjectDetailBootstrap = {
  projectId: string;
  projectName: string;
  repoUrl: string;
  branch: string;
  projectRootDir: string;
  currentPreviewUrl: string | null;
  /** true if this project has at least one deployment that finished successfully */
  hasSuccessfulDeployment: boolean;
  siteMeta: ProjectDetailSiteMetaBootstrap | null;
  currentDeploymentId?: string | null;
};

type SiteMetadataRefreshOk = {
  ok: true;
  siteIconUrl: string | null;
  siteOgImageUrl: string | null;
  siteMetaFetchedAt: string;
};

type ApiErrorBody = { error?: string };

const notify = (message: string, variant: "success" | "error"): void => {
  const notification = document.getElementById("notification");
  if (!notification) return;
  showPageToast(notification, message, variant);
};

export const ProjectDetailSetCurrentRoot = ({
  projectId
}: {
  projectId: string;
}): React.ReactElement | null => {
  const { t } = useTranslation();
  const [pendingDeploymentId, setPendingDeploymentId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const onDocClick = (ev: MouseEvent): void => {
      const target = ev.target;
      if (!(target instanceof Element)) return;
      const el = target.closest("[data-set-current-deployment]");
      if (!el) return;
      const depId = el.getAttribute("data-set-current-deployment")?.trim();
      if (!depId) return;
      ev.preventDefault();
      void (async () => {
        setPendingDeploymentId(depId);
        try {
          const response = await fetchWithCsrf(`/api/projects/${projectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ currentDeploymentId: depId })
          });
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          if (!response.ok) {
            throw new Error(payload.error ?? t("projectDetail.updateCurrentFailed"));
          }
          notify(t("projectDetail.setCurrentSuccess"), "success");
          window.setTimeout(() => {
            window.location.reload();
          }, 400);
        } catch (err) {
          notify(err instanceof Error ? err.message : t("projectDetail.setCurrentFailed"), "error");
        } finally {
          setPendingDeploymentId(null);
        }
      })();
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [projectId, t]);

  React.useEffect(() => {
    document.querySelectorAll<HTMLElement>("[data-set-current-deployment]").forEach((node) => {
      if (node instanceof HTMLButtonElement) {
        node.disabled = pendingDeploymentId !== null;
      } else {
        node.toggleAttribute("data-pending-set-current", pendingDeploymentId !== null);
        node.setAttribute("aria-disabled", pendingDeploymentId !== null ? "true" : "false");
        node.classList.toggle("pointer-events-none", pendingDeploymentId !== null);
        node.classList.toggle("opacity-50", pendingDeploymentId !== null);
      }
    });
  }, [pendingDeploymentId]);

  return null;
};

export const ProjectDetailHeroSitePreview = ({
  projectId,
  projectName,
  previewUrl,
  initial
}: {
  projectId: string;
  projectName: string;
  previewUrl: string;
  initial: ProjectDetailSiteMetaBootstrap;
}): React.ReactElement => {
  const { t } = useTranslation();
  const [siteIconUrl, setSiteIconUrl] = React.useState<string | null>(initial.siteIconUrl);
  const [siteOgImageUrl, setSiteOgImageUrl] = React.useState<string | null>(initial.siteOgImageUrl);
  const [siteMetaFetchedAt, setSiteMetaFetchedAt] = React.useState<string | null>(initial.siteMetaFetchedAt);
  const [siteMetaError, setSiteMetaError] = React.useState<string | null>(initial.siteMetaError);
  const [refreshing, setRefreshing] = React.useState(false);
  const [ogLoadFailed, setOgLoadFailed] = React.useState(false);

  const { activeSrc, showImg, handleImgError, letter } = useProjectGlyphImage(
    projectName,
    siteIconUrl,
    previewUrl
  );

  const ogProxySrc = `/api/projects/${projectId}/site-metadata/preview-image?kind=og`;

  React.useEffect(() => {
    setOgLoadFailed(false);
  }, [ogProxySrc, siteOgImageUrl]);

  const runRefresh = React.useCallback(async (): Promise<void> => {
    setRefreshing(true);
    try {
      const response = await fetchWithCsrf(`/api/projects/${projectId}/site-metadata/refresh`, {
        method: "POST"
      });
      const raw = (await response.json().catch(() => ({}))) as SiteMetadataRefreshOk | ApiErrorBody;
      if (!response.ok) {
        const message =
          "error" in raw && typeof raw.error === "string" ? raw.error : t("projectDetail.siteMetaRefreshFailed");
        setSiteMetaError(message);
        return;
      }
      if ("ok" in raw && raw.ok === true) {
        setSiteIconUrl(raw.siteIconUrl ?? null);
        setSiteOgImageUrl(raw.siteOgImageUrl ?? null);
        setSiteMetaFetchedAt(raw.siteMetaFetchedAt ?? null);
        setSiteMetaError(null);
      }
    } catch {
      setSiteMetaError(t("projectDetail.siteMetaRefreshFailed"));
    } finally {
      setRefreshing(false);
    }
  }, [projectId, t]);

  return (
    <div className="relative size-full min-w-0">
      <a
        href={previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("projectDetail.openLivePreview")}
        className="group relative flex size-full overflow-hidden rounded-lg border border-border/80 bg-muted/25 shadow-sm ring-1 ring-black/5 dark:ring-white/10"
      >
        {!ogLoadFailed ? (
          <img
            src={ogProxySrc}
            alt=""
            className="size-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
            onError={() => setOgLoadFailed(true)}
          />
        ) : (
          <div className="flex size-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {refreshing ? t("projectDetail.fetchingPreviewImage") : t("projectDetail.noOgImage")}
          </div>
        )}
      </a>
      <span
        className="absolute left-3 top-3 z-10 flex size-9 items-center justify-center overflow-hidden rounded-md border border-border bg-background shadow-sm"
        aria-hidden
      >
        {showImg ? (
          <img
            src={activeSrc ?? ""}
            alt=""
            width={36}
            height={36}
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
            onError={handleImgError}
          />
        ) : (
          <span className="flex size-full items-center justify-center rounded-md bg-primary/20 text-xs font-semibold text-primary">
            {letter}
          </span>
        )}
      </span>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        disabled={refreshing}
        onClick={() => void runRefresh()}
        className="absolute right-2 top-2 z-20 size-9 border border-border/80 bg-background/90 shadow-sm backdrop-blur-sm"
        aria-label={refreshing ? t("projectDetail.refreshingSiteMeta") : t("projectDetail.refreshSiteMeta")}
        title={t("projectDetail.refreshSiteMeta")}
      >
        <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
      </Button>
      {siteMetaError && ogLoadFailed ? (
        <p className="mt-2 text-xs text-destructive" role="status">
          {siteMetaError}
        </p>
      ) : null}
      {siteMetaFetchedAt && !siteMetaError ? (
        <p className="mt-1.5 text-[0.65rem] text-muted-foreground tabular-nums">
          {t("projectDetail.siteMetaUpdated", { time: new Date(siteMetaFetchedAt).toLocaleString() })}
        </p>
      ) : null}
    </div>
  );
};

export const ProjectDetailDeployTrigger = ({
  projectId,
  label,
  className
}: {
  projectId: string;
  label: string;
  className?: string;
}): React.ReactElement => {
  const { t } = useTranslation();
  const [pending, setPending] = React.useState(false);

  const handleDeploy = async (): Promise<void> => {
    if (!projectId || pending) return;
    setPending(true);
    try {
      const response = await fetchWithCsrf(`/projects/${projectId}/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? t("projectDetail.deployCreateFailed"));
      }
      notify(t("projectDetail.deploymentStartedToast"), "success");
      window.setTimeout(() => {
        window.location.href = `/deployments/${data.id ?? ""}`;
      }, 500);
    } catch (err) {
      notify(err instanceof Error ? err.message : t("projectDetail.deployCreateFailed"), "error");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button type="button" disabled={pending} className={className} onClick={() => void handleDeploy()}>
      {label}
    </Button>
  );
};
