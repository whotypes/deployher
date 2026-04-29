import type { ComponentType } from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "@/spa/routerCompat";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "@/ui/layoutUser";
import { AppShell } from "./AppShell";
import { ProjectSettingsPageClient } from "./client/ProjectSettingsPageClient";
import { FolderKanban, KeyRound, Settings, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Project = {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  workspaceRootDir: string;
  projectRootDir: string;
  frameworkHint: "auto" | "nextjs" | "node" | "python" | "static";
  previewMode: "auto" | "static" | "server";
  serverPreviewTarget: "isolated-runner";
  runtimeImageMode: "auto" | "platform" | "dockerfile";
  dockerfilePath: string | null;
  dockerBuildTarget: string | null;
  skipHostStrategyBuild: boolean;
  runtimeContainerPort: number;
  installCommand: string | null;
  buildCommand: string | null;
  createdAt: string;
  updatedAt: string;
  currentDeploymentId: string | null;
  siteIconUrl: string | null;
  siteOgImageUrl: string | null;
  siteMetaFetchedAt: string | null;
  siteMetaError: string | null;
};

export type ProjectSettingsData = {
  pathname: string;
  project: Project;
  user?: LayoutUser | null;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
  sidebarFeaturedDeployment: SidebarFeaturedDeployment | null;
  activeSection: "general" | "env" | "danger";
};

type SettingsNavItem = {
  id: "general" | "env" | "danger";
  label: string;
  icon: ComponentType<{ className?: string }>;
  href: (projectId: string) => string;
  danger?: boolean;
};

export const ProjectSettingsPage = ({
  data,
  onRequestSettingsRefetch
}: {
  data: ProjectSettingsData;
  onRequestSettingsRefetch?: () => void;
}) => {
  const { t } = useTranslation();
  const { project, activeSection } = data;

  const settingsNav = useMemo<SettingsNavItem[]>(
    () => [
      { id: "general", label: t("projectSettings.navGeneral"), icon: Settings, href: (id) => `/projects/${id}/settings` },
      {
        id: "env",
        label: t("projectSettings.navEnv"),
        icon: KeyRound,
        href: (id) => `/projects/${id}/settings/env`
      },
      {
        id: "danger",
        label: t("projectSettings.navDanger"),
        icon: TriangleAlert,
        href: (id) => `/projects/${id}/settings/danger`,
        danger: true
      }
    ],
    [t]
  );

  return (
    <AppShell
      title={t("meta.settingsTitle", { name: project.name, appName: t("common.appName") })}
      pathname={data.pathname}
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      sidebarContext={{
        project: {
          id: project.id,
          name: project.name
        },
        deployment: data.sidebarFeaturedDeployment
      }}
      breadcrumbs={[
        { label: t("common.projects"), href: "/projects" },
        { label: project.name, href: `/projects/${project.id}` },
        { label: t("projectSettings.breadcrumbSettings") }
      ]}
    >
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground hover:no-underline"
            aria-label={t("projectSettings.backToAria", { name: project.name })}
          >
            <FolderKanban className="size-4" aria-hidden />
            <span>{project.name}</span>
          </Link>
          <span className="text-border/80">/</span>
          <h1 className="text-sm font-medium text-foreground">{t("projectSettings.heading")}</h1>
        </div>
      </div>

      <div id="project-settings" className="scroll-mt-24 flex flex-col gap-8 lg:flex-row lg:gap-10">
        <nav className="flex shrink-0 flex-row gap-1 lg:w-52 lg:flex-col" aria-label={t("projectSettings.navAria")}>
          {settingsNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeSection;
            return (
              <Link
                key={item.id}
                to={item.href(project.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm no-underline transition-colors hover:no-underline",
                  isActive
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : item.danger
                      ? "text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                      : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <Icon className={cn("size-4 shrink-0", item.danger && !isActive && "text-destructive/70")} aria-hidden />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 max-w-2xl flex-1">
          <div id="project-settings-client-root">
            <ProjectSettingsPageClient data={data} onRequestSettingsRefetch={onRequestSettingsRefetch} />
          </div>
        </div>
      </div>
    </AppShell>
  );
};
