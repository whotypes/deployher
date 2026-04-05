import type { ComponentType } from "react";
import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
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

const settingsNav: SettingsNavItem[] = [
  { id: "general", label: "General", icon: Settings, href: (id) => `/projects/${id}/settings` },
  { id: "env", label: "Environment Variables", icon: KeyRound, href: (id) => `/projects/${id}/settings/env` },
  { id: "danger", label: "Danger Zone", icon: TriangleAlert, href: (id) => `/projects/${id}/settings/danger`, danger: true }
];

const ProjectSettingsPage = ({ data }: { data: ProjectSettingsData }) => {
  const { project, activeSection } = data;

  return (
    <Layout
      title={`Settings · ${project.name} · Deployher`}
      pathname={data.pathname}
      scriptSrc="/assets/project-settings-page.js"
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      sidebarContext={{
        project: {
          id: project.id,
          name: project.name
        },
        deployment: data.sidebarFeaturedDeployment
      }}
      csrfToken={data.csrfToken}
      breadcrumbs={[
        { label: "Projects", href: "/projects" },
        { label: project.name, href: `/projects/${project.id}` },
        { label: "Settings" }
      ]}
    >
      <script
        type="application/json"
        id="project-settings-bootstrap"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(data).replace(/</g, "\\u003c")
        }}
      />

      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground no-underline transition-colors hover:text-foreground hover:no-underline"
            aria-label={`Back to ${project.name}`}
          >
            <FolderKanban className="size-4" aria-hidden />
            <span>{project.name}</span>
          </a>
          <span className="text-border/80">/</span>
          <h1 className="text-sm font-medium text-foreground">Settings</h1>
        </div>
      </div>

      <div id="project-settings" className="scroll-mt-24 flex flex-col gap-8 lg:flex-row lg:gap-10">
        <nav className="flex shrink-0 flex-row gap-1 lg:w-52 lg:flex-col" aria-label="Settings sections">
          {settingsNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeSection;
            return (
              <a
                key={item.id}
                href={item.href(project.id)}
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
              </a>
            );
          })}
        </nav>

        <div className="min-w-0 max-w-2xl flex-1">
          <div id="project-settings-client-root" />
        </div>
      </div>
    </Layout>
  );
};

export const renderProjectSettingsPage = (data: ProjectSettingsData) =>
  renderToReadableStream(<ProjectSettingsPage data={data} />);
