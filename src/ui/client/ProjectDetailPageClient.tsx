import { Button } from "@/components/ui/button";
import { RefreshCw, UploadCloud } from "lucide-react";
import * as React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { navigateSpa } from "@/spa/spaNavigationBridge";
import { fetchWithCsrf } from "./fetchWithCsrf";
import { gatherDroppedStaticFiles } from "./gatherDroppedStaticFiles";
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
  showPageToast(message, variant);
};

export const ProjectDetailSetCurrentRoot = ({
  projectId,
  onAfterSetCurrent
}: {
  projectId: string;
  onAfterSetCurrent?: () => void;
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
            onAfterSetCurrent?.();
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
  }, [projectId, t, onAfterSetCurrent]);

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
        const id = data.id ?? "";
        if (id) navigateSpa(`/deployments/${id}`);
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

export const ProjectStaticBundleDropZone = ({
  projectId,
  onUploaded
}: {
  projectId: string;
  onUploaded?: () => void;
}): React.ReactElement => {
  const { t } = useTranslation();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const dragDepthRef = React.useRef(0);
  const busyRef = React.useRef(false);
  const [dragActive, setDragActive] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const runUpload = React.useCallback(
    async (gathered: { relativePath: string; file: File }[]): Promise<void> => {
      if (!gathered.length) return;
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const form = new FormData();
        for (const { relativePath, file } of gathered) {
          form.append("bundle", file, relativePath);
        }
        const response = await fetchWithCsrf(`/api/projects/${projectId}/deployments/static-upload`, {
          method: "POST",
          body: form
        });
        const data = (await response.json().catch(() => ({}))) as {
          id?: string;
          error?: string;
        };
        if (!response.ok) {
          throw new Error(data.error ?? t("projectDetail.staticUploadFailed"));
        }
        notify(t("projectDetail.staticUploadSuccess"), "success");
        onUploaded?.();
        window.setTimeout(() => {
          const id = data.id ?? "";
          if (id) navigateSpa(`/deployments/${id}`);
        }, 400);
      } catch (err) {
        notify(err instanceof Error ? err.message : t("projectDetail.staticUploadFailed"), "error");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [onUploaded, projectId, t]
  );

  const handleDragEnter = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current += 1;
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDragActive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (e: React.DragEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDragActive(false);
    void (async () => {
      const gathered = await gatherDroppedStaticFiles(e.dataTransfer);
      await runUpload(gathered);
    })();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const list = e.target.files;
    if (!list?.length) return;
    const gathered: { relativePath: string; file: File }[] = [];
    for (const file of [...list]) {
      const rel =
        typeof file.webkitRelativePath === "string" && file.webkitRelativePath.trim()
          ? file.webkitRelativePath.trim().replace(/\\/g, "/")
          : file.name;
      gathered.push({ relativePath: rel, file });
    }
    e.target.value = "";
    void runUpload(gathered);
  };

  return (
    <div className="relative w-full min-w-0">
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        multiple
        {...{ webkitdirectory: "" }}
        onChange={handleFileInputChange}
        aria-hidden
      />
      <div
        role="button"
        tabIndex={0}
        aria-disabled={busy}
        aria-label={t("projectDetail.staticUploadAria")}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-[border-color,background-color,box-shadow] duration-200 ease-out sm:py-6",
          dragActive
            ? "border-primary bg-primary/5 shadow-[0_0_0_3px_hsl(var(--primary)/0.12)]"
            : "border-muted-foreground/35 bg-muted/15 hover:border-muted-foreground/55 hover:bg-muted/25",
          busy && "pointer-events-none opacity-60"
        )}
        onClick={() => {
          if (busy) return;
          inputRef.current?.click();
        }}
        onKeyDown={handleKeyDown}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <UploadCloud
          className={cn(
            "size-9 shrink-0 transition-transform duration-200 ease-out",
            dragActive ? "scale-110 text-primary" : "text-muted-foreground"
          )}
          aria-hidden
        />
        <div className="space-y-1">
          <p className="text-sm font-medium leading-snug text-foreground">
            {busy ? t("projectDetail.staticUploadBusy") : t("projectDetail.staticUploadTitle")}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("projectDetail.staticUploadHint")}</p>
        </div>
      </div>
    </div>
  );
};
