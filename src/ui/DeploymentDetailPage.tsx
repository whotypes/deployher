import type { ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server";
import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BuildLogTerminal } from "@/components/ui/build-log-terminal";
import { Separator } from "@/components/ui/separator";
import { buildDeploymentPipelineHtml } from "@/lib/deploymentPipeline";
import { cn } from "@/lib/utils";

type Deployment = {
  id: string;
  shortId: string;
  projectId: string;
  artifactPrefix: string;
  status: string;
  serveStrategy: "static" | "server";
  buildPreviewMode: "auto" | "static" | "server" | null;
  buildServerPreviewTarget: "isolated-runner" | "trusted-local-docker" | null;
  previewResolution: { code: string; detail?: string } | null;
  buildLogKey: string | null;
  previewUrl: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type Project = {
  id: string;
  name: string;
};

export type DeploymentDetailData = {
  pathname: string;
  deployment: Deployment;
  project: Project;
  user?: LayoutUser | null;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
  sidebarFeaturedDeployment: SidebarFeaturedDeployment | null;
};

const previewModeLabel = (mode: Deployment["buildPreviewMode"]): string => {
  if (mode === "auto") return "Auto-detect";
  return mode ?? "—";
};

const serverTargetLabel = (target: Deployment["buildServerPreviewTarget"]): string => {
  if (target === "isolated-runner") return "Isolated runner";
  if (target === "trusted-local-docker") return "Trusted local Docker";
  return "—";
};

const displayServeStrategy = (deployment: Deployment): "static" | "server" => {
  if (deployment.buildPreviewMode === "server" || deployment.buildPreviewMode === "static") {
    return deployment.buildPreviewMode;
  }
  return deployment.serveStrategy;
};

const formatDuration = (startIso: string, endIso: string | null): string => {
  if (!endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m > 0) return `${m}m ${rs}s`;
  return `${rs}s`;
};

const formatDetailTimestamp = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
};

const statusBadgeLabel = (status: string): string => {
  const s = status.toLowerCase();
  if (s === "building") return "Building";
  if (s === "queued") return "Queued";
  if (s === "success") return "Live";
  if (s === "failed") return "Build failed";
  return status;
};

const statusBadgePresentation = (
  status: string
): { variant: "default" | "secondary" | "destructive" | "outline"; className?: string } => {
  const s = status.toLowerCase();
  if (s === "success") {
    return {
      variant: "default",
      className:
        "rounded border-0 bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-500/25"
    };
  }
  if (s === "failed") {
    return {
      variant: "destructive",
      className:
        "rounded border-0 bg-destructive/15 text-[color-mix(in_oklab,var(--destructive)_88%,white)] ring-1 ring-destructive/30"
    };
  }
  if (s === "building") {
    return {
      variant: "outline",
      className:
        "rounded border-amber-500/35 bg-amber-500/10 text-amber-100 ring-1 ring-amber-500/20"
    };
  }
  if (s === "queued") {
    return {
      variant: "secondary",
      className: "rounded border-border/60 bg-secondary/80 text-secondary-foreground"
    };
  }
  return { variant: "secondary" };
};

const DeploymentPipeline = ({ status }: { status: string }) => (
  <div
    id="deployment-pipeline"
    className="flex w-full min-w-0 items-start"
    role="list"
    aria-label="Build pipeline"
    dangerouslySetInnerHTML={{ __html: buildDeploymentPipelineHtml(status) }}
  />
);

const MetaRow = ({
  k,
  children,
  mono
}: {
  k: string;
  children: ReactNode;
  mono?: boolean;
}) => (
  <div className="flex items-start justify-between gap-3 border-b border-border/50 py-2.5 last:border-b-0">
    <span className="text-xs text-muted-foreground">{k}</span>
    <span
      className={cn(
        "max-w-[58%] text-right text-xs font-medium text-foreground",
        mono && "font-mono text-[0.65rem] leading-snug"
      )}
    >
      {children}
    </span>
  </div>
);

const DeploymentDetailPage = ({ data }: { data: DeploymentDetailData }) => {
  const isActive = data.deployment.status === "queued" || data.deployment.status === "building";
  const isSuccess = data.deployment.status === "success";
  const isFailed = data.deployment.status === "failed";
  const badgePres = statusBadgePresentation(data.deployment.status);
  const effectiveServeStrategy = displayServeStrategy(data.deployment);
  const showResolvedDetails =
    data.deployment.buildPreviewMode === "auto" || data.deployment.buildPreviewMode === null;
  const previewBlockedReason =
    isSuccess && effectiveServeStrategy === "server"
      ? data.deployment.buildServerPreviewTarget === "trusted-local-docker"
        ? "Server preview uses trusted local Docker and requires local Docker preview support on this pdploy instance."
        : "Server preview requires an isolated runner with RUNNER_PREVIEW_ENABLED and RUNNER_URL configured."
      : null;

  const failureSummary = isFailed
    ? (data.deployment.previewResolution?.detail ??
        data.deployment.previewResolution?.code ??
        null)
    : null;

  return (
    <Layout
      title={`Deployment ${data.deployment.shortId} · pdploy`}
      pathname={data.pathname}
      scriptSrc="/assets/deployment-detail-page.js"
      user={data.user ?? null}
      csrfToken={data.csrfToken}
      sidebarProjects={data.sidebarProjects}
      sidebarContext={{
        project: {
          id: data.project.id,
          name: data.project.name
        },
        deployment: data.sidebarFeaturedDeployment
      }}
      breadcrumbs={[
        { label: "Projects", href: "/projects" },
        { label: data.project.name, href: `/projects/${data.project.id}` },
        { label: data.deployment.shortId }
      ]}
    >
      <input type="hidden" id="deployment-id" value={data.deployment.id} />
      <input type="hidden" id="preview-url" value={data.deployment.previewUrl ?? ""} />

      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                id="status-badge"
                data-deployment-status={data.deployment.status}
                variant={badgePres.variant}
                className={cn(
                  "gap-1.5 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.12em]",
                  badgePres.className
                )}
              >
                <span
                  id="status-badge-dot"
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    isSuccess && "bg-emerald-400",
                    isFailed && "bg-[color-mix(in_oklab,var(--destructive)_80%,white)]",
                    data.deployment.status === "building" && "bg-amber-300",
                    data.deployment.status === "queued" && "bg-chart-3"
                  )}
                  aria-hidden
                />
                <span id="status-badge-label">{statusBadgeLabel(data.deployment.status)}</span>
              </Badge>
              {isActive ? (
                <div
                  id="building-indicator"
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Loader2 className="size-3.5 animate-spin text-amber-200/90" aria-hidden />
                  <span>Streaming logs…</span>
                </div>
              ) : null}
            </div>
            <h1 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {data.project.name}
            </h1>
            <p className="text-muted-foreground text-sm">
              Deployment{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground text-xs">
                {data.deployment.shortId}
              </code>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={`/projects/${data.project.id}`}>View project</a>
            </Button>
            <Button variant="secondary" size="sm" className="gap-1.5" asChild>
              <a href={`/projects/${data.project.id}`}>
                <RotateCcw className="size-3.5" aria-hidden />
                Redeploy
              </a>
            </Button>
            {isActive ? (
              <Button id="cancel-deployment-btn" variant="destructive" size="sm" type="button">
                Cancel build
              </Button>
            ) : null}
            <div id="preview-section">
              {isSuccess && data.deployment.previewUrl ? (
                <Button size="sm" asChild>
                  <a
                    href={data.deployment.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit preview
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </header>

        <div
          className={cn(
            "grid gap-0 border-t border-border/70 pt-6",
            "md:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)]"
          )}
        >
          <aside className="border-border/70 md:border-r md:pr-6 pb-6 md:pb-0">
            <p id="deployment-settings" className="scroll-mt-24 mb-3 text-xs leading-relaxed text-muted-foreground">
              This page is for this run only.{" "}
              <a
                href={`/projects/${data.project.id}/settings`}
                className="font-medium text-primary no-underline hover:underline"
              >
                Project settings
              </a>{" "}
              cover repo, branch, and environment for new deployments.
            </p>
            <p className="text-muted-foreground mb-3 text-[0.65rem] font-semibold uppercase tracking-[0.14em]">
              Build pipeline
            </p>
            <DeploymentPipeline status={data.deployment.status} />
            <Separator className="my-5 bg-border/60" />
            <p className="text-muted-foreground mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em]">
              Details
            </p>
            <div className="flex flex-col">
              <MetaRow k="Deployment ID" mono>
                {data.deployment.shortId}
              </MetaRow>
              <MetaRow k="Project">
                <a
                  href={`/projects/${data.project.id}`}
                  className="text-primary font-medium no-underline hover:underline"
                >
                  {data.project.name}
                </a>
              </MetaRow>
              <MetaRow k="Preview type">{previewModeLabel(data.deployment.buildPreviewMode)}</MetaRow>
              {showResolvedDetails ? (
                <MetaRow k="Resolved">{data.deployment.serveStrategy}</MetaRow>
              ) : null}
              <MetaRow k="Runner">{serverTargetLabel(data.deployment.buildServerPreviewTarget)}</MetaRow>
              {showResolvedDetails ? (
                <MetaRow k="Resolution">
                  {data.deployment.previewResolution?.detail ??
                    data.deployment.previewResolution?.code ??
                    "—"}
                </MetaRow>
              ) : null}
              <MetaRow k="Duration">
                {formatDuration(data.deployment.createdAt, data.deployment.finishedAt)}
              </MetaRow>
              <MetaRow k="Created" mono>
                {formatDetailTimestamp(data.deployment.createdAt)}
              </MetaRow>
              <div
                id="finished-row"
                className={cn(!data.deployment.finishedAt && "hidden")}
              >
                <MetaRow k="Finished" mono>
                  <span id="finished-time">
                    {data.deployment.finishedAt
                      ? formatDetailTimestamp(data.deployment.finishedAt)
                      : ""}
                  </span>
                </MetaRow>
              </div>
              {isSuccess && data.deployment.previewUrl ? (
                <MetaRow k="URL" mono>
                  <a
                    href={data.deployment.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary break-all no-underline hover:underline"
                  >
                    {data.deployment.previewUrl}
                  </a>
                </MetaRow>
              ) : null}
              {previewBlockedReason ? (
                <MetaRow k="Preview status">
                  <span className="text-muted-foreground font-normal">{previewBlockedReason}</span>
                </MetaRow>
              ) : null}
            </div>
          </aside>

          <section
            id="build-logs"
            className="flex scroll-mt-28 flex-col gap-4 pt-6 md:pl-6 md:pt-0"
          >
            {isFailed ? (
              <Alert
                variant="destructive"
                className="rounded-xl border-destructive/40 bg-destructive/10 [&>svg]:top-4"
              >
                <AlertCircle className="size-4" />
                <AlertTitle className="text-[0.8125rem] font-semibold tracking-wide">
                  {failureSummary || "Build failed"}
                </AlertTitle>
                {!failureSummary ? (
                  <AlertDescription className="text-destructive/90">
                    See the build output below for the full log.
                  </AlertDescription>
                ) : (
                  <AlertDescription className="text-destructive/85">
                    See the build output below for context and stack traces.
                  </AlertDescription>
                )}
              </Alert>
            ) : null}

            <div className="space-y-2">
              <p className="text-muted-foreground px-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.18em]">
                Build output
              </p>
              <BuildLogTerminal logPath={`${data.deployment.artifactPrefix}/build.log`}>
                <pre
                  id="log-output"
                  className={cn(
                    "kinetic-log-output log-output relative z-1 max-h-[min(24rem,55vh)] min-h-[10rem]",
                    "overflow-auto rounded-none border-0 bg-zinc-950/40 px-4 py-3 font-mono text-[0.7rem] leading-[1.75]",
                    "text-zinc-200 selection:bg-primary/30 selection:text-foreground"
                  )}
                >
                  {data.deployment.status === "queued"
                    ? "Build queued. Logs will appear when a worker picks up the job.\n"
                    : data.deployment.status === "building"
                      ? "Streaming build logs...\n"
                      : !isActive && data.deployment.buildLogKey
                        ? "Loading logs...\n"
                        : !isActive
                          ? "No logs available yet.\n"
                          : "Connecting...\n"}
                </pre>
              </BuildLogTerminal>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export const renderDeploymentDetailPage = (data: DeploymentDetailData) =>
  renderToReadableStream(<DeploymentDetailPage data={data} />);
