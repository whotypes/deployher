"use client";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fetchWithCsrf } from "@/ui/client/fetchWithCsrf";
import type {
    LayoutUser,
    SidebarFeaturedDeployment,
    SidebarProjectDeploymentStatus,
    SidebarProjectSummary
} from "@/ui/layoutUser";
import {
    Activity,
    ChevronDown,
    CirclePlay,
    FolderKanban,
    LayoutDashboard,
    Loader2,
    LogOut,
    Rocket,
    Settings2,
    Shield,
    X,
    XCircle
} from "lucide-react";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

const SidebarProjectGlyph = ({
  name,
  siteIconUrl
}: {
  name: string;
  siteIconUrl: string | null;
}): ReactElement => {
  const [failed, setFailed] = useState(false);
  const letter = name.trim()[0]?.toUpperCase() ?? "?";
  const showImg = Boolean(siteIconUrl) && !failed;
  return (
    <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm">
      {showImg ? (
        <img
          src={siteIconUrl ?? ""}
          alt=""
          className="size-5 object-cover"
          width={20}
          height={20}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="flex size-5 items-center justify-center rounded-sm bg-sidebar-accent/50 text-[10px] font-semibold text-sidebar-foreground/90">
          {letter}
        </span>
      )}
    </span>
  );
};

export type DeployherSidebarProps = {
  pathname: string;
  user?: LayoutUser | null;
  sidebarProjects?: SidebarProjectSummary[];
  sidebarContext?: {
    project?: {
      id: string;
      name: string;
    } | null;
    deployment?: SidebarFeaturedDeployment | null;
  };
};

type NavLink = {
  href: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  match?: (pathname: string) => boolean;
};

type NavGroup = {
  label: string;
  items: NavLink[];
};

const navIsActive = (pathname: string, item: NavLink): boolean => {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

const subscribeShellCollapsed = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  const shell = document.getElementById("deployher-shell");
  if (!shell) return () => {};
  onChange();
  const observer = new MutationObserver(onChange);
  observer.observe(shell, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};

const getShellCollapsed = (): boolean => {
  if (typeof document === "undefined") return false;
  return document.getElementById("deployher-shell")?.classList.contains("sidebar-collapsed") ?? false;
};

const getServerCollapsed = () => false;

const useShellSidebarCollapsed = () =>
  useSyncExternalStore(subscribeShellCollapsed, getShellCollapsed, getServerCollapsed);

const CollapsedSidebarTooltip = ({ label, children }: { label: string; children: ReactElement }) => {
  const collapsed = useShellSidebarCollapsed();
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8} className="max-w-[min(20rem,calc(100vw-4rem))]">
        <span className="block truncate">{label}</span>
      </TooltipContent>
    </Tooltip>
  );
};

const sidebarProjectStatusDotClass = (status: SidebarProjectDeploymentStatus | null): string => {
  switch (status) {
    case "success":
      return "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)]";
    case "failed":
      return "bg-red-400 shadow-[0_0_10px_rgba(248,113,113,0.55)]";
    case "building":
      return "bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.55)]";
    case "queued":
      return "bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.55)]";
    default:
      return "bg-sidebar-foreground/30 shadow-none";
  }
};

const SidebarProjectStatusDot = ({ status }: { status: SidebarProjectDeploymentStatus | null }) => {
  const { t } = useTranslation();
  const aria =
    status === null
      ? t("sidebar.statusNoDeploy")
      : status === "success"
        ? t("sidebar.statusLive")
        : status === "failed"
          ? t("sidebar.statusFailed")
          : status === "building"
            ? t("sidebar.statusBuilding")
            : t("sidebar.statusQueued");
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full animate-pulse-slow",
        sidebarProjectStatusDotClass(status)
      )}
      aria-label={aria}
    />
  );
};

const SidebarGroupLabel = ({ children }: { children: string }) => (
  <p className="deployher-sidebar-label shrink-0 px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60 transition-[margin,opacity] duration-200 group-[.sidebar-collapsed]/shell:pointer-events-none group-[.sidebar-collapsed]/shell:-mt-6 group-[.sidebar-collapsed]/shell:opacity-0">
    {children}
  </p>
);

const SidebarLink = ({
  item,
  pathname,
  muted = false
}: {
  item: NavLink;
  pathname: string;
  muted?: boolean;
}) => {
  const active = navIsActive(pathname, item);
  const Icon = item.icon;
  return (
    <li data-slot="sidebar-menu-item">
      <CollapsedSidebarTooltip label={item.label}>
        <Link
          to={item.href}
          aria-current={active ? "page" : undefined}
          data-active={active ? "true" : "false"}
          data-slot="sidebar-menu-button"
          className={cn(
            "deployher-sidebar-link peer/menu-button flex items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,padding] duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground no-underline hover:no-underline group-[.sidebar-collapsed]/shell:size-8 group-[.sidebar-collapsed]/shell:justify-center group-[.sidebar-collapsed]/shell:p-2 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
            muted && !active ? "text-sidebar-foreground/80" : "text-sidebar-foreground"
          )}
        >
          {Icon ? <Icon className="shrink-0" aria-hidden /> : <span className="size-4 shrink-0" aria-hidden />}
          <span className="deployher-sidebar-label truncate group-[.sidebar-collapsed]/shell:sr-only">{item.label}</span>
        </Link>
      </CollapsedSidebarTooltip>
    </li>
  );
};

const WorkspaceProjectsRow = ({
  pathname,
  sidebarProjects,
  projectsNav,
  t
}: {
  pathname: string;
  sidebarProjects: SidebarProjectSummary[];
  projectsNav: NavLink;
  t: (key: string) => string;
}) => {
  const shellCollapsed = useShellSidebarCollapsed();
  const [nestOpen, setNestOpen] = useState(
    () => pathname === "/projects" || pathname.startsWith("/projects/")
  );

  useEffect(() => {
    setNestOpen(pathname === "/projects" || pathname.startsWith("/projects/"));
  }, [pathname]);

  const projectsActive = navIsActive(pathname, projectsNav);

  const ProjectsIcon = projectsNav.icon;

  if (shellCollapsed || sidebarProjects.length === 0) {
    return <SidebarLink item={projectsNav} pathname={pathname} />;
  }

  return (
    <li data-slot="sidebar-menu-item" className="list-none">
      <Collapsible open={nestOpen} onOpenChange={setNestOpen}>
        <div className="flex min-w-0 items-stretch gap-0.5">
          <CollapsedSidebarTooltip label={projectsNav.label}>
            <Link
              to={projectsNav.href}
              aria-current={projectsActive ? "page" : undefined}
              data-active={projectsActive ? "true" : "false"}
              data-slot="sidebar-menu-button"
              className={cn(
                "deployher-sidebar-link peer/menu-button flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,padding] duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground no-underline hover:no-underline data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
                projectsActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
              )}
            >
              {ProjectsIcon ? <ProjectsIcon className="shrink-0" aria-hidden /> : null}
              <span className="deployher-sidebar-label truncate">{projectsNav.label}</span>
            </Link>
          </CollapsedSidebarTooltip>
          <CollapsibleTrigger
            className={cn(
              "flex h-[inherit] min-h-9 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2 data-[state=open]:bg-sidebar-accent/60 [&>svg]:size-4"
            )}
            aria-label={nestOpen ? t("sidebar.collapseProjectList") : t("sidebar.expandProjectList")}
          >
            <ChevronDown
              className={cn("transition-transform duration-200", nestOpen ? "rotate-180" : "rotate-0")}
              aria-hidden
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div
            className="mt-1 flex flex-col gap-0.5 border-l-2 border-sidebar-border/90 pl-2.5 ml-2"
            role="list"
          >
            {sidebarProjects.map((p) => {
              const active =
                pathname === `/projects/${p.id}` || pathname.startsWith(`/projects/${p.id}/`);
              return (
                <Link
                  key={p.id}
                  to={`/projects/${p.id}`}
                  role="listitem"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 no-underline hover:no-underline",
                    active
                      ? "bg-sidebar-accent/70 font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/90"
                  )}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <SidebarProjectGlyph name={p.name} siteIconUrl={p.siteIconUrl} />
                    <span className="min-w-0 truncate">{p.name}</span>
                  </span>
                  <SidebarProjectStatusDot status={p.deploymentStatus} />
                </Link>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
};

const SidebarWorkspace = ({
  pathname,
  sidebarProjects,
  dashboardNav,
  projectsNav,
  healthNav,
  t
}: {
  pathname: string;
  sidebarProjects: SidebarProjectSummary[];
  dashboardNav: NavLink;
  projectsNav: NavLink;
  healthNav: NavLink;
  t: (key: string) => string;
}) => (
  <div>
    <SidebarGroupLabel>{t("nav.workspace")}</SidebarGroupLabel>
    <ul className="flex flex-col gap-1" data-slot="sidebar-menu">
      <SidebarLink item={dashboardNav} pathname={pathname} />
      <WorkspaceProjectsRow
        pathname={pathname}
        sidebarProjects={sidebarProjects}
        projectsNav={projectsNav}
        t={t}
      />
      <SidebarLink item={healthNav} pathname={pathname} />
    </ul>
  </div>
);

const SidebarGroup = ({ group, pathname, muted }: { group: NavGroup; pathname: string; muted?: boolean }) => (
  <div>
    <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
    <ul className="flex flex-col gap-1" data-slot="sidebar-menu">
      {group.items.map((item) => (
        <SidebarLink key={item.href} item={item} pathname={pathname} muted={muted} />
      ))}
    </ul>
  </div>
);

const SidebarProjectDeploy = ({ projectId }: { projectId: string }) => {
  const { t } = useTranslation();
  const collapsed = useShellSidebarCollapsed();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchWithCsrf(`/projects/${projectId}/deployments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? t("sidebar.failedCreateDeployment"));
      }
      if (data.id) {
        window.location.href = `/deployments/${data.id}`;
        return;
      }
      throw new Error(t("sidebar.deploymentNoId"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("sidebar.deployFailed"));
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? t("sidebar.deploying") : t("sidebar.deployThisProject");

  if (collapsed) {
    return (
      <div className="flex justify-center">
        <CollapsedSidebarTooltip label={label}>
          <button
            type="button"
            onClick={() => void handleDeploy()}
            disabled={busy}
            className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground outline-none ring-sidebar-ring transition-opacity hover:opacity-95 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60"
            aria-label={label}
          >
            <Rocket className="size-4 shrink-0" aria-hidden />
          </button>
        </CollapsedSidebarTooltip>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => void handleDeploy()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-sidebar-primary px-2 py-2 text-sm font-medium text-sidebar-primary-foreground outline-none ring-sidebar-ring transition-opacity hover:opacity-95 focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-60"
        aria-label={label}
      >
        <Rocket className="size-4 shrink-0" aria-hidden />
        <span>{busy ? t("sidebar.deploying") : t("sidebar.deploy")}</span>
      </button>
      {error ? (
        <p className="px-0.5 text-xs text-red-400/90" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const SidebarDeploymentRowIcon = ({ deployment }: { deployment: SidebarFeaturedDeployment }) => {
  if (deployment.sidebarRole === "failed") {
    return <XCircle className="size-4 shrink-0 text-red-400/90" aria-hidden />;
  }
  if (deployment.sidebarRole === "live") {
    return <CirclePlay className="size-4 shrink-0" aria-hidden />;
  }
  if (deployment.status === "building") {
    return <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />;
  }
  return <CirclePlay className="size-4 shrink-0 opacity-80" aria-hidden />;
};

const SidebarProjectCard = ({
  pathname,
  sidebarContext
}: {
  pathname: string;
  sidebarContext: NonNullable<DeployherSidebarProps["sidebarContext"]>;
}) => {
  const { t } = useTranslation();
  const project = sidebarContext.project;
  if (!project) return null;

  const settingsMatch = (
    p: string,
    section: "general" | "env" | "danger" | "observability"
  ) => {
    if (section === "general") return p === `/projects/${project.id}/settings`;
    if (section === "env") return p === `/projects/${project.id}/settings/env`;
    if (section === "observability") return p === `/projects/${project.id}/observability`;
    return p === `/projects/${project.id}/settings/danger`;
  };

  const subLinks: {
    href: string;
    label: string;
    section: "general" | "env" | "danger" | "observability";
  }[] = [
    { href: `/projects/${project.id}/observability`, label: t("sidebar.observability"), section: "observability" },
    { href: `/projects/${project.id}/settings`, label: t("sidebar.generalSettings"), section: "general" },
    { href: `/projects/${project.id}/settings/env`, label: t("sidebar.environmentVariables"), section: "env" },
    { href: `/projects/${project.id}/settings/danger`, label: t("sidebar.dangerZone"), section: "danger" }
  ];

  const deployment = sidebarContext.deployment;

  const deploymentSectionTitle = (d: SidebarFeaturedDeployment): string => {
    switch (d.sidebarRole) {
      case "live":
        return t("sidebar.liveDeployment");
      case "failed":
        return t("sidebar.lastFailedDeployment");
      case "in_progress":
        return t("sidebar.latestRun");
    }
  };

  return (
    <div className="rounded-lg border border-sidebar-border/90 bg-sidebar-accent/25 p-2 shadow-sm ring-1 ring-sidebar-border/40 group-[.sidebar-collapsed]/shell:border-0 group-[.sidebar-collapsed]/shell:bg-transparent group-[.sidebar-collapsed]/shell:p-0 group-[.sidebar-collapsed]/shell:shadow-none group-[.sidebar-collapsed]/shell:ring-0">
      <p className="deployher-sidebar-label mb-2 px-0.5 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60 group-[.sidebar-collapsed]/shell:sr-only">
        {t("sidebar.currentProject")}
      </p>
      <div className="space-y-2 group-[.sidebar-collapsed]/shell:space-y-1">
        <CollapsedSidebarTooltip label={project.name}>
          <Link
            to={`/projects/${project.id}`}
            aria-current={
              pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`)
                ? "page"
                : undefined
            }
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent/50 focus-visible:ring-2 no-underline hover:no-underline group-[.sidebar-collapsed]/shell:justify-center group-[.sidebar-collapsed]/shell:p-2"
          >
            <FolderKanban className="size-4 shrink-0 group-[.sidebar-collapsed]/shell:size-5" aria-hidden />
            <span className="deployher-sidebar-label truncate group-[.sidebar-collapsed]/shell:sr-only">{project.name}</span>
          </Link>
        </CollapsedSidebarTooltip>

        <SidebarProjectDeploy projectId={project.id} />
        <div className="group-[.sidebar-collapsed]/shell:hidden">
          <div className="flex flex-col gap-0.5 border-l-2 border-sidebar-border/80 pl-2.5">
            {subLinks.map((s) => {
              const active = settingsMatch(pathname, s.section);
              return (
                <Link
                  key={s.href}
                  to={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 no-underline hover:no-underline [&>svg]:size-3.5 [&>svg]:shrink-0",
                    s.section === "general" ? "font-medium" : "",
                    active
                      ? "bg-sidebar-accent/70 text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/85"
                  )}
                >
                  {s.section === "general" ? <Settings2 className="shrink-0" aria-hidden /> : null}
                  {s.section === "observability" ? <Activity className="shrink-0" aria-hidden /> : null}
                  <span className="truncate">{s.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {deployment ? (
          <div className="border-t border-sidebar-border/60 pt-2 group-[.sidebar-collapsed]/shell:hidden">
            <p className="mb-1 px-0.5 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
              {deploymentSectionTitle(deployment)}
            </p>
            <CollapsedSidebarTooltip
              label={t("sidebar.openDeployment", { shortId: deployment.shortId, status: deployment.status })}
            >
              <Link
                to={`/deployments/${deployment.id}`}
                aria-current={pathname === `/deployments/${deployment.id}` ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md p-2 text-sm outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2 no-underline hover:no-underline",
                  deployment.sidebarRole === "failed"
                    ? "text-red-300/95 hover:text-red-200"
                    : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
                )}
              >
                <SidebarDeploymentRowIcon deployment={deployment} />
                <span className="truncate">
                  {t("sidebar.runShortId", { shortId: deployment.shortId })}
                  {deployment.sidebarRole === "in_progress" ? (
                    <span className="ml-1 text-xs opacity-80">({deployment.status})</span>
                  ) : null}
                </span>
              </Link>
            </CollapsedSidebarTooltip>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export const DeployherSidebar = ({ pathname, user, sidebarProjects = [], sidebarContext }: DeployherSidebarProps) => {
  const { t } = useTranslation();

  const dashboardNav = useMemo(
    (): NavLink => ({
      href: "/dashboard",
      label: t("nav.dashboard"),
      icon: LayoutDashboard,
      match: (p) => p === "/dashboard" || p === "/home"
    }),
    [t]
  );

  const projectsNav = useMemo(
    (): NavLink => ({
      href: "/projects",
      label: t("nav.projects"),
      icon: FolderKanban,
      match: (p) => p === "/projects" || p.startsWith("/projects/")
    }),
    [t]
  );

  const healthNav = useMemo(
    (): NavLink => ({
      href: "/health",
      label: t("nav.systemHealth"),
      icon: Activity,
      match: (p) => p === "/health"
    }),
    [t]
  );

  const adminNav = useMemo(
    (): NavLink[] => [
      {
        href: "/admin",
        label: t("nav.adminWorkflow"),
        icon: Shield,
        match: (p) => p === "/admin" || p.startsWith("/admin/")
      }
    ],
    [t]
  );

  const adminGroups: NavGroup[] = useMemo(
    () => (user?.role === "operator" ? [{ label: t("nav.operations"), items: adminNav }] : []),
    [user?.role, adminNav, t]
  );

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        id="deployher-sidebar"
        data-mobile-open="false"
        data-slot="sidebar"
        className="fixed inset-y-0 left-0 z-40 flex h-svh w-(--sidebar-width) -translate-x-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-none transition-[transform,width] duration-200 ease-linear data-[mobile-open=true]:translate-x-0 md:z-30 md:translate-x-0 group-[.sidebar-collapsed]/shell:w-(--sidebar-width-icon)"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3 group-[.sidebar-collapsed]/shell:justify-center group-[.sidebar-collapsed]/shell:px-2">
          <CollapsedSidebarTooltip label={t("common.deployherBrand")}>
            <Link
              to="/dashboard"
              className="deployher-sidebar-brand flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-sidebar-foreground no-underline hover:no-underline hover:bg-sidebar-accent group-[.sidebar-collapsed]/shell:flex-none group-[.sidebar-collapsed]/shell:justify-center"
              aria-label={t("sidebar.deployherHome")}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-primary via-primary to-color-mix(in_oklab,var(--chart-2)_55%,var(--primary)) text-sm font-bold text-primary-foreground shadow-[0_0_24px_-4px_color-mix(in_oklab,var(--primary)_70%,transparent)] ring-1 ring-primary/40">
                d
              </span>
              <span className="deployher-sidebar-label truncate font-serif text-base font-semibold tracking-tight group-[.sidebar-collapsed]/shell:sr-only">
                {t("common.deployherBrand")}
              </span>
            </Link>
          </CollapsedSidebarTooltip>
          <button
            type="button"
            id="deployher-sidebar-close-mobile"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2 md:hidden"
            aria-label={t("sidebar.closeSidebar")}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="deployher-sidebar-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" data-slot="sidebar-content">
          <SidebarWorkspace
            pathname={pathname}
            sidebarProjects={sidebarProjects}
            dashboardNav={dashboardNav}
            projectsNav={projectsNav}
            healthNav={healthNav}
            t={t}
          />
          {sidebarContext ? <SidebarProjectCard pathname={pathname} sidebarContext={sidebarContext} /> : null}
          {adminGroups.map((group) => (
            <SidebarGroup key={group.label} group={group} pathname={pathname} muted />
          ))}
        </div>

        <div className="mt-auto shrink-0 border-t border-sidebar-border p-2" data-slot="sidebar-footer">
          {user ? (
            <>
              <CollapsedSidebarTooltip label={user.name ?? user.email}>
                <Link
                  to="/account"
                  className="deployher-sidebar-link mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground/90 outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 no-underline hover:no-underline group-[.sidebar-collapsed]/shell:justify-center"
                  aria-label={t("sidebar.accountLink")}
                >
                  {user.image ? (
                    <img src={user.image} alt="" width={28} height={28} className="size-7 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-medium">
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="deployher-sidebar-label min-w-0 truncate group-[.sidebar-collapsed]/shell:sr-only">
                    {user.name ?? user.email}
                  </span>
                </Link>
              </CollapsedSidebarTooltip>
              <form id="signout-form" method="post" action="/api/auth/sign-out" className="group-[.sidebar-collapsed]/shell:px-0">
                <CollapsedSidebarTooltip label={t("common.signOut")}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-[.sidebar-collapsed]/shell:justify-center"
                    aria-label={t("common.signOut")}
                  >
                    <LogOut className="size-4 shrink-0" aria-hidden />
                    <span className="deployher-sidebar-label group-[.sidebar-collapsed]/shell:sr-only">{t("common.signOut")}</span>
                  </button>
                </CollapsedSidebarTooltip>
              </form>
            </>
          ) : (
            <Link
              to="/login"
              className="flex items-center justify-center rounded-md bg-sidebar-primary px-2 py-2 text-sm font-medium text-sidebar-primary-foreground no-underline hover:no-underline hover:opacity-90"
            >
              {t("sidebar.signInCta")}
            </Link>
          )}
        </div>

        <button
          type="button"
          id="deployher-sidebar-rail"
          tabIndex={-1}
          title={t("sidebar.toggleSidebarRail")}
          aria-label={t("sidebar.toggleSidebarRail")}
          className="absolute inset-y-0 right-0 z-20 hidden w-3 cursor-ew-resize border-0 bg-transparent p-0 md:block group-[.sidebar-collapsed]/shell:cursor-e-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-sidebar-border"
        />
      </aside>
    </TooltipProvider>
  );
};
