import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ChevronRight, Menu, PanelLeft, Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { DeployherSidebar } from "@/ui/DeployherSidebar";
import { initLayout } from "@/ui/client/layoutInit";
import { LayoutPrefsMenu } from "@/ui/client/LayoutPrefsMenu";
import { ProjectSwitcher } from "@/ui/client/ProjectSwitcher";
import type {
  LayoutUser,
  SidebarFeaturedDeployment,
  SidebarProjectSummary
} from "@/ui/layoutUser";

export type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "@/ui/layoutUser";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type AppShellProps = {
  title: string;
  pathname: string;
  children: ReactNode;
  user?: LayoutUser | null;
  breadcrumbs?: BreadcrumbItem[];
  sidebarProjects?: SidebarProjectSummary[];
  sidebarContext?: {
    project?: {
      id: string;
      name: string;
    } | null;
    deployment?: SidebarFeaturedDeployment | null;
  };
};

export const AppShell = ({
  title,
  pathname,
  children,
  user,
  breadcrumbs = [],
  sidebarProjects,
  sidebarContext
}: AppShellProps) => {
  const { t } = useTranslation();

  useEffect(() => {
    initLayout();
  }, [pathname]);

  return (
    <div
      id="deployher-shell"
      data-sidebar="expanded"
      className="group/sidebar-wrapper group/shell flex min-h-svh w-full"
      style={
        {
          "--sidebar-width": "16rem",
          "--sidebar-width-icon": "3rem"
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        id="deployher-sidebar-backdrop"
        className="fixed inset-0 z-30 hidden bg-black/60 md:hidden"
        aria-label={t("shell.closeMenu")}
      />

      <div
        aria-hidden
        className="hidden shrink-0 transition-[width] duration-200 ease-linear md:block md:w-(--sidebar-width) group-[.sidebar-collapsed]/shell:w-(--sidebar-width-icon)"
        data-slot="sidebar-gap"
      />

      <DeployherSidebar
        pathname={pathname}
        user={user}
        sidebarProjects={sidebarProjects}
        sidebarContext={sidebarContext}
      />

      <div className="relative flex min-w-0 flex-1 flex-col bg-background" data-slot="sidebar-inset">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/75 px-3 backdrop-blur-xl supports-backdrop-filter:bg-background/50 md:px-4">
          <button
            type="button"
            id="deployher-sidebar-open-mobile"
            className="flex h-9 w-9 items-center justify-center rounded-md text-foreground outline-none ring-ring hover:bg-accent focus-visible:ring-2 md:hidden"
            aria-label={t("shell.openMenu")}
            aria-expanded="false"
            aria-controls="deployher-sidebar"
          >
            <Menu className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            id="deployher-sidebar-toggle-desktop"
            className="hidden size-9 items-center justify-center rounded-md text-muted-foreground outline-none ring-ring hover:bg-accent hover:text-foreground focus-visible:ring-2 md:flex"
            aria-label={t("shell.toggleSidebar")}
          >
            <PanelLeft className="size-4" aria-hidden />
          </button>
          <Separator orientation="vertical" className="mr-1 hidden h-6 md:block" />
          <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div id="project-switcher-mount" className="shrink-0">
                <ProjectSwitcher
                  input={{
                    pathname,
                    sidebarProjects,
                    sidebarContext
                  }}
                />
              </div>
              <nav className="flex min-w-0 items-center gap-1 text-sm text-muted-foreground" aria-label={t("shell.breadcrumb")}>
                {breadcrumbs.length === 0 ? (
                  <span className="truncate text-foreground">{title.replace(new RegExp(`\\s*·\\s*${t("common.appName")}\\s*$`, "i"), "")}</span>
                ) : (
                  breadcrumbs.map((crumb, i) => {
                    const isLast = i === breadcrumbs.length - 1;
                    return (
                      <span key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1">
                        {i > 0 ? <ChevronRight className="size-3.5 shrink-0 opacity-60" aria-hidden /> : null}
                        {crumb.href && !isLast ? (
                          <Link
                            to={crumb.href}
                            className="truncate text-muted-foreground no-underline hover:no-underline hover:text-foreground"
                          >
                            {crumb.label}
                          </Link>
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
              <Link
                to="/projects/new"
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground no-underline shadow-[0_12px_36px_-16px_color-mix(in_oklab,var(--primary)_90%,black)] ring-1 ring-primary/30 transition-[opacity,transform] duration-200 hover:no-underline hover:opacity-95 active:scale-[0.98]"
              >
                <Plus className="size-4" aria-hidden />
                <span className="hidden sm:inline">{t("shell.newProject")}</span>
              </Link>
              <div id="layout-prefs-mount" className="flex shrink-0">
                <LayoutPrefsMenu />
              </div>
            </div>
          </div>
        </header>

        <main id="deployher-main" className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};
