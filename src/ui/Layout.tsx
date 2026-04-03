import type { ReactNode } from "react";
import { ChevronRight, Menu, PanelLeft, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { PdploySidebar } from "@/ui/PdploySidebar";
import type {
  LayoutUser,
  SidebarFeaturedDeployment,
  SidebarProjectDeploymentStatus,
  SidebarProjectSummary
} from "@/ui/layoutUser";

export type {
  LayoutUser,
  SidebarFeaturedDeployment,
  SidebarProjectDeploymentStatus,
  SidebarProjectSummary
} from "@/ui/layoutUser";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type LayoutProps = {
  title: string;
  /** request path for sidebar active state, e.g. /projects/abc or /deployments/xyz */
  pathname: string;
  children: ReactNode;
  scripts?: string;
  scriptSrc?: string;
  user?: LayoutUser | null;
  breadcrumbs?: BreadcrumbItem[];
  csrfToken?: string;
  sidebarProjects?: SidebarProjectSummary[];
  sidebarContext?: {
    project?: {
      id: string;
      name: string;
    } | null;
    deployment?: SidebarFeaturedDeployment | null;
  };
};

const SIDEBAR_STATE_BOOTSTRAP = `
(function () {
  try {
    var shell = document.getElementById("pdploy-shell");
    if (!shell) return;
    var collapsed;
    try {
      var stored = localStorage.getItem("pdploy-sidebar-collapsed");
      if (stored !== null) collapsed = stored === "1";
    } catch (_) {}
    if (typeof collapsed === "undefined") {
      var open = null;
      var match = document.cookie.match(/(?:^|; )sidebar_state=([^;]*)/);
      if (match && match[1]) {
        var v = decodeURIComponent(match[1]).trim().toLowerCase();
        if (v === "true") open = true;
        else if (v === "false") open = false;
      }
      collapsed = open === null ? false : !open;
    }
    if (collapsed) shell.classList.add("sidebar-collapsed");
    else shell.classList.remove("sidebar-collapsed");
    shell.setAttribute("data-sidebar", collapsed ? "collapsed" : "expanded");
  } catch (_) {}
})();
`.trim();

export const Layout = ({
  title,
  pathname,
  children,
  scripts,
  scriptSrc,
  user,
  breadcrumbs = [],
  csrfToken,
  sidebarProjects,
  sidebarContext
}: LayoutProps) => (
  <html lang="en" className="dark">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <meta name="theme-color" content="#151922" />
      {csrfToken ? <meta name="csrf-token" content={csrfToken} /> : null}
      <title>{title}</title>
      <link rel="stylesheet" href="/assets/app.css" />
    </head>
    <body className="bg-background text-foreground min-h-svh">
      <a
        href="#pdploy-main"
        className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <div
        id="pdploy-shell"
        data-sidebar="expanded"
        className="group/sidebar-wrapper group/shell flex min-h-svh w-full"
        style={
          {
            "--sidebar-width": "16rem",
            "--sidebar-width-icon": "3rem"
          } as React.CSSProperties
        }
      >
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_STATE_BOOTSTRAP }} />
        <button
          type="button"
          id="pdploy-sidebar-backdrop"
          className="fixed inset-0 z-30 hidden bg-black/60 md:hidden"
          aria-label="Close menu"
        />

        <div
          aria-hidden
          className="hidden shrink-0 transition-[width] duration-200 ease-linear md:block md:w-(--sidebar-width) group-[.sidebar-collapsed]/shell:w-(--sidebar-width-icon)"
          data-slot="sidebar-gap"
        />

        <div id="pdploy-sidebar-hydrate-root">
          <PdploySidebar
            pathname={pathname}
            user={user}
            sidebarProjects={sidebarProjects}
            sidebarContext={sidebarContext}
          />
        </div>
        <script
          type="application/json"
          id="pdploy-sidebar-props"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({ pathname, user, sidebarProjects, sidebarContext }).replace(/</g, "\\u003c")
          }}
        />

        <div className="relative flex min-w-0 flex-1 flex-col bg-background" data-slot="sidebar-inset">
          <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur-xl supports-backdrop-filter:bg-background/55 md:px-4">
            <button
              type="button"
              id="pdploy-sidebar-open-mobile"
              className="flex h-9 w-9 items-center justify-center rounded-md text-foreground outline-none ring-ring hover:bg-accent focus-visible:ring-2 md:hidden"
              aria-label="Open menu"
              aria-expanded="false"
              aria-controls="pdploy-sidebar"
            >
              <Menu className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              id="pdploy-sidebar-toggle-desktop"
              className="hidden size-9 items-center justify-center rounded-md text-muted-foreground outline-none ring-ring hover:bg-accent hover:text-foreground focus-visible:ring-2 md:flex"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="size-4" aria-hidden />
            </button>
            <Separator orientation="vertical" className="mr-1 hidden h-6 md:block" />
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="topbar-chip hidden md:inline-flex">
                  <span className="size-2 rounded-full bg-primary shadow-[0_0_18px_color-mix(in_oklab,var(--primary)_75%,transparent)]" aria-hidden />
                  Deploy Control
                </span>
                <nav className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground" aria-label="Breadcrumb">
                  {breadcrumbs.length === 0 ? (
                    <span className="truncate text-foreground">{title.replace(/\s*·\s*pdploy\s*$/i, "")}</span>
                  ) : (
                    breadcrumbs.map((crumb, i) => {
                      const isLast = i === breadcrumbs.length - 1;
                      return (
                        <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
                          {i > 0 ? <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden /> : null}
                          {crumb.href && !isLast ? (
                            <a
                              href={crumb.href}
                              className="truncate text-muted-foreground no-underline hover:no-underline hover:text-foreground"
                            >
                              {crumb.label}
                            </a>
                          ) : (
                            <span className={`truncate ${isLast ? "font-medium text-foreground" : ""}`}>{crumb.label}</span>
                          )}
                        </span>
                      );
                    })
                  )}
                </nav>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <a
                  href="/projects#new"
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground no-underline shadow-[0_10px_30px_-18px_color-mix(in_oklab,var(--primary)_85%,black)] transition-colors hover:no-underline hover:opacity-95"
                >
                  <Plus className="size-4" aria-hidden />
                  <span className="hidden sm:inline">New Project</span>
                </a>
                <div id="layout-prefs-mount" className="flex shrink-0" />
              </div>
            </div>
          </header>

          <main id="pdploy-main" className="flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>

      <script src="/assets/sidebar-hydrate.js" type="module" />
      <script src="/assets/layout.js" type="module" />
      <script src="/assets/layout-prefs-menu.js" type="module" />
      {scriptSrc ? <script src={scriptSrc} type="module" /> : null}
      {scripts ? <script>{scripts}</script> : null}
    </body>
  </html>
);
