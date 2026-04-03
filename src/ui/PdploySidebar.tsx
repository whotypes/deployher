"use client";

import { useEffect, useState, useSyncExternalStore, type ReactElement } from "react";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchWithCsrf } from "@/ui/client/fetchWithCsrf";
import { cn } from "@/lib/utils";
import type {
  LayoutUser,
  SidebarFeaturedDeployment,
  SidebarProjectDeploymentStatus,
  SidebarProjectSummary
} from "@/ui/layoutUser";

export type PdploySidebarProps = {
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

const dashboardNav: NavLink = {
  href: "/dashboard",
  label: "Dashboard",
  icon: LayoutDashboard,
  match: (pathname) => pathname === "/dashboard" || pathname === "/home"
};

const projectsNav: NavLink = {
  href: "/projects",
  label: "Projects",
  icon: FolderKanban,
  match: (pathname) => pathname === "/projects" || pathname.startsWith("/projects/")
};

const healthNav: NavLink = {
  href: "/health",
  label: "System Health",
  icon: Activity,
  match: (pathname) => pathname === "/health"
};

const adminNav: NavLink[] = [
  {
    href: "/admin",
    label: "Admin Workflow",
    icon: Shield,
    match: (pathname) => pathname === "/admin" || pathname.startsWith("/admin/")
  }
];

const navIsActive = (pathname: string, item: NavLink): boolean => {
  if (item.match) return item.match(pathname);
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};

const subscribeShellCollapsed = (onChange: () => void) => {
  if (typeof document === "undefined") return () => {};
  const shell = document.getElementById("pdploy-shell");
  if (!shell) return () => {};
  onChange();
  const observer = new MutationObserver(onChange);
  observer.observe(shell, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};

const getShellCollapsed = (): boolean => {
  if (typeof document === "undefined") return false;
  return document.getElementById("pdploy-shell")?.classList.contains("sidebar-collapsed") ?? false;
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

const sidebarProjectStatusAriaLabel = (status: SidebarProjectDeploymentStatus | null): string => {
  if (status === null) return "No current deployment status";
  if (status === "success") return "Live";
  if (status === "failed") return "Failed";
  if (status === "building") return "Building";
  return "Queued";
};

const SidebarProjectStatusDot = ({ status }: { status: SidebarProjectDeploymentStatus | null }) => (
  <span
    className={cn(
      "size-1.5 shrink-0 rounded-full animate-pulse-slow",
      sidebarProjectStatusDotClass(status)
    )}
    aria-label={sidebarProjectStatusAriaLabel(status)}
  />
);

const SidebarGroupLabel = ({ children }: { children: string }) => (
  <p className="pdploy-sidebar-label shrink-0 px-2 pb-1 pt-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60 transition-[margin,opacity] duration-200 group-[.sidebar-collapsed]/shell:pointer-events-none group-[.sidebar-collapsed]/shell:-mt-6 group-[.sidebar-collapsed]/shell:opacity-0">
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
        <a
          href={item.href}
          aria-current={active ? "page" : undefined}
          data-active={active ? "true" : "false"}
          data-slot="sidebar-menu-button"
          className={cn(
            "pdploy-sidebar-link peer/menu-button flex items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,padding] duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground no-underline hover:no-underline group-[.sidebar-collapsed]/shell:size-8 group-[.sidebar-collapsed]/shell:justify-center group-[.sidebar-collapsed]/shell:p-2 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
            muted && !active ? "text-sidebar-foreground/80" : "text-sidebar-foreground"
          )}
        >
          {Icon ? <Icon className="shrink-0" aria-hidden /> : <span className="size-4 shrink-0" aria-hidden />}
          <span className="pdploy-sidebar-label truncate group-[.sidebar-collapsed]/shell:sr-only">{item.label}</span>
        </a>
      </CollapsedSidebarTooltip>
    </li>
  );
};

const WorkspaceProjectsRow = ({
  pathname,
  sidebarProjects
}: {
  pathname: string;
  sidebarProjects: SidebarProjectSummary[];
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
            <a
              href={projectsNav.href}
              aria-current={projectsActive ? "page" : undefined}
              data-active={projectsActive ? "true" : "false"}
              data-slot="sidebar-menu-button"
              className={cn(
                "pdploy-sidebar-link peer/menu-button flex min-w-0 flex-1 items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,padding] duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground no-underline hover:no-underline data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
                projectsActive ? "text-sidebar-accent-foreground" : "text-sidebar-foreground"
              )}
            >
              {ProjectsIcon ? <ProjectsIcon className="shrink-0" aria-hidden /> : null}
              <span className="pdploy-sidebar-label truncate">{projectsNav.label}</span>
            </a>
          </CollapsedSidebarTooltip>
          <CollapsibleTrigger
            className={cn(
              "flex h-[inherit] min-h-9 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2 data-[state=open]:bg-sidebar-accent/60 [&>svg]:size-4"
            )}
            aria-label={nestOpen ? "Collapse project list" : "Expand project list"}
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
                <a
                  key={p.id}
                  href={`/projects/${p.id}`}
                  role="listitem"
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-w-0 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 no-underline hover:no-underline",
                    active
                      ? "bg-sidebar-accent/70 font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/90"
                  )}
                >
                  <span className="min-w-0 truncate">{p.name}</span>
                  <SidebarProjectStatusDot status={p.deploymentStatus} />
                </a>
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
  sidebarProjects
}: {
  pathname: string;
  sidebarProjects: SidebarProjectSummary[];
}) => (
  <div>
    <SidebarGroupLabel>Workspace</SidebarGroupLabel>
    <ul className="flex flex-col gap-1" data-slot="sidebar-menu">
      <SidebarLink item={dashboardNav} pathname={pathname} />
      <WorkspaceProjectsRow pathname={pathname} sidebarProjects={sidebarProjects} />
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
        throw new Error(data.error ?? "Failed to create deployment");
      }
      if (data.id) {
        window.location.href = `/deployments/${data.id}`;
        return;
      }
      throw new Error("Deployment started but no id returned");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
    } finally {
      setBusy(false);
    }
  };

  const label = busy ? "Deploying…" : "Deploy this project";

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
        <span>{busy ? "Deploying…" : "Deploy"}</span>
      </button>
      {error ? (
        <p className="px-0.5 text-xs text-red-400/90" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
};

const sidebarDeploymentSectionTitle = (d: SidebarFeaturedDeployment): string => {
  switch (d.sidebarRole) {
    case "live":
      return "Live deployment";
    case "failed":
      return "Last failed deployment";
    case "in_progress":
      return "Latest run";
  }
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
  sidebarContext: NonNullable<PdploySidebarProps["sidebarContext"]>;
}) => {
  const project = sidebarContext.project;
  if (!project) return null;

  const settingsMatch = (p: string, section: "general" | "env" | "danger") => {
    if (section === "general") return p === `/projects/${project.id}/settings`;
    if (section === "env") return p === `/projects/${project.id}/settings/env`;
    return p === `/projects/${project.id}/settings/danger`;
  };

  const subLinks: { href: string; label: string; section: "general" | "env" | "danger" }[] = [
    { href: `/projects/${project.id}/settings`, label: "General Settings", section: "general" },
    { href: `/projects/${project.id}/settings/env`, label: "Environment Variables", section: "env" },
    { href: `/projects/${project.id}/settings/danger`, label: "Danger Zone", section: "danger" }
  ];

  const deployment = sidebarContext.deployment;

  return (
    <div className="rounded-lg border border-sidebar-border/90 bg-sidebar-accent/25 p-2 shadow-sm ring-1 ring-sidebar-border/40 group-[.sidebar-collapsed]/shell:border-0 group-[.sidebar-collapsed]/shell:bg-transparent group-[.sidebar-collapsed]/shell:p-0 group-[.sidebar-collapsed]/shell:shadow-none group-[.sidebar-collapsed]/shell:ring-0">
      <p className="pdploy-sidebar-label mb-2 px-0.5 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/60 group-[.sidebar-collapsed]/shell:sr-only">
        Current project
      </p>
      <div className="space-y-2 group-[.sidebar-collapsed]/shell:space-y-1">
        <CollapsedSidebarTooltip label={project.name}>
          <a
            href={`/projects/${project.id}`}
            aria-current={
              pathname === `/projects/${project.id}` || pathname.startsWith(`/projects/${project.id}/`)
                ? "page"
                : undefined
            }
            className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent/50 focus-visible:ring-2 no-underline hover:no-underline group-[.sidebar-collapsed]/shell:justify-center group-[.sidebar-collapsed]/shell:p-2"
          >
            <FolderKanban className="size-4 shrink-0 group-[.sidebar-collapsed]/shell:size-5" aria-hidden />
            <span className="pdploy-sidebar-label truncate group-[.sidebar-collapsed]/shell:sr-only">{project.name}</span>
          </a>
        </CollapsedSidebarTooltip>

        <SidebarProjectDeploy projectId={project.id} />
        <div className="group-[.sidebar-collapsed]/shell:hidden">
          <div className="flex flex-col gap-0.5 border-l-2 border-sidebar-border/80 pl-2.5">
            {subLinks.map((s) => {
              const active = settingsMatch(pathname, s.section);
              return (
                <a
                  key={s.href}
                  href={s.href}
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
                  <span className="truncate">{s.label}</span>
                </a>
              );
            })}
          </div>
        </div>

        {deployment ? (
          <div className="border-t border-sidebar-border/60 pt-2 group-[.sidebar-collapsed]/shell:hidden">
            <p className="mb-1 px-0.5 text-[10px] font-medium uppercase tracking-wider text-sidebar-foreground/50">
              {sidebarDeploymentSectionTitle(deployment)}
            </p>
            <CollapsedSidebarTooltip
              label={`Open deployment ${deployment.shortId} (${deployment.status})`}
            >
              <a
                href={`/deployments/${deployment.id}`}
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
                  Run {deployment.shortId}
                  {deployment.sidebarRole === "in_progress" ? (
                    <span className="ml-1 text-xs opacity-80">({deployment.status})</span>
                  ) : null}
                </span>
              </a>
            </CollapsedSidebarTooltip>
          </div>
        ) : null}
      </div>
    </div>
  );
};

const buildAdminGroups = (pathname: string, user: LayoutUser | null | undefined): NavGroup[] =>
  user?.role === "operator" ? [{ label: "Operations", items: adminNav }] : [];

export const PdploySidebar = ({ pathname, user, sidebarProjects = [], sidebarContext }: PdploySidebarProps) => {
  const adminGroups = buildAdminGroups(pathname, user);

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        id="pdploy-sidebar"
        data-mobile-open="false"
        data-slot="sidebar"
        className="fixed inset-y-0 left-0 z-40 flex h-svh w-(--sidebar-width) -translate-x-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-none transition-[transform,width] duration-200 ease-linear data-[mobile-open=true]:translate-x-0 md:z-30 md:translate-x-0 group-[.sidebar-collapsed]/shell:w-(--sidebar-width-icon)"
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3 group-[.sidebar-collapsed]/shell:justify-center group-[.sidebar-collapsed]/shell:px-2">
          <CollapsedSidebarTooltip label="pdploy">
            <a
              href="/dashboard"
              className="pdploy-sidebar-brand flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold text-sidebar-foreground no-underline hover:no-underline hover:bg-sidebar-accent group-[.sidebar-collapsed]/shell:flex-none group-[.sidebar-collapsed]/shell:justify-center"
              aria-label="pdploy home"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground text-xs font-bold">
                p
              </span>
              <span className="pdploy-sidebar-label truncate group-[.sidebar-collapsed]/shell:sr-only">pdploy</span>
            </a>
          </CollapsedSidebarTooltip>
          <button
            type="button"
            id="pdploy-sidebar-close-mobile"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent focus-visible:ring-2 md:hidden"
            aria-label="Close sidebar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="pdploy-sidebar-scroll flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2" data-slot="sidebar-content">
          <SidebarWorkspace pathname={pathname} sidebarProjects={sidebarProjects} />
          {sidebarContext ? <SidebarProjectCard pathname={pathname} sidebarContext={sidebarContext} /> : null}
          {adminGroups.map((group) => (
            <SidebarGroup key={group.label} group={group} pathname={pathname} muted />
          ))}
        </div>

        <div className="mt-auto shrink-0 border-t border-sidebar-border p-2" data-slot="sidebar-footer">
          {user ? (
            <>
              <CollapsedSidebarTooltip label={user.name ?? user.email}>
                <a
                  href="/account"
                  className="pdploy-sidebar-link mb-1 flex items-center gap-2 rounded-md px-2 py-2 text-sm text-sidebar-foreground/90 outline-none ring-sidebar-ring transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 no-underline hover:no-underline group-[.sidebar-collapsed]/shell:justify-center"
                  aria-label="Account"
                >
                  {user.image ? (
                    <img src={user.image} alt="" width={28} height={28} className="size-7 shrink-0 rounded-md object-cover" />
                  ) : (
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-xs font-medium">
                      {(user.name ?? user.email).charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="pdploy-sidebar-label min-w-0 truncate group-[.sidebar-collapsed]/shell:sr-only">
                    {user.name ?? user.email}
                  </span>
                </a>
              </CollapsedSidebarTooltip>
              <form id="signout-form" method="post" action="/api/auth/sign-out" className="group-[.sidebar-collapsed]/shell:px-0">
                <CollapsedSidebarTooltip label="Sign out">
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-[.sidebar-collapsed]/shell:justify-center"
                    aria-label="Sign out"
                  >
                    <LogOut className="size-4 shrink-0" aria-hidden />
                    <span className="pdploy-sidebar-label group-[.sidebar-collapsed]/shell:sr-only">Sign out</span>
                  </button>
                </CollapsedSidebarTooltip>
              </form>
            </>
          ) : (
            <a
              href="/login"
              className="flex items-center justify-center rounded-md bg-sidebar-primary px-2 py-2 text-sm font-medium text-sidebar-primary-foreground no-underline hover:no-underline hover:opacity-90"
            >
              Sign in
            </a>
          )}
        </div>

        <button
          type="button"
          id="pdploy-sidebar-rail"
          tabIndex={-1}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          className="absolute inset-y-0 right-0 z-20 hidden w-3 cursor-ew-resize border-0 bg-transparent p-0 md:block group-[.sidebar-collapsed]/shell:cursor-e-resize after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent after:transition-colors hover:after:bg-sidebar-border"
        />
      </aside>
    </TooltipProvider>
  );
};
