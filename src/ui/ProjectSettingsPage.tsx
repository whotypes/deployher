import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarFeaturedDeployment, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Check, Copy, Eye, EyeOff, FolderKanban, KeyRound, Plus, Settings, TriangleAlert } from "lucide-react";
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
  serverPreviewTarget: "isolated-runner" | "trusted-local-docker";
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
  icon: React.ComponentType<{ className?: string }>;
  href: (projectId: string) => string;
  danger?: boolean;
};

const settingsNav: SettingsNavItem[] = [
  { id: "general", label: "General", icon: Settings, href: (id) => `/projects/${id}/settings` },
  { id: "env", label: "Environment Variables", icon: KeyRound, href: (id) => `/projects/${id}/settings/env` },
  { id: "danger", label: "Danger Zone", icon: TriangleAlert, href: (id) => `/projects/${id}/settings/danger`, danger: true }
];

const GeneralSection = ({ project }: { project: Project }) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold">General</h2>
      <p className="text-sm text-muted-foreground mt-1">Manage your project name, repository, and build configuration.</p>
    </div>
    <Separator />
    <form id="edit-project-form" className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="edit-name">Project Name</Label>
        <Input id="edit-name" type="text" placeholder={project.name} defaultValue={project.name} aria-label="Project name" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-repo-url">Repository URL</Label>
        <Input id="edit-repo-url" type="url" placeholder={project.repoUrl} defaultValue={project.repoUrl} aria-label="GitHub repository URL" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-branch">Branch</Label>
        <Input id="edit-branch" type="text" placeholder={project.branch} defaultValue={project.branch} aria-label="Branch to deploy" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-workspace-root-dir">Workspace Root</Label>
        <Input
          id="edit-workspace-root-dir"
          type="text"
          placeholder="."
          defaultValue={project.workspaceRootDir}
          aria-label="Workspace root directory inside the repository"
        />
        <p className="text-xs text-muted-foreground">
          Install and lockfile detection run here. Set this to the monorepo workspace root, such as <code>apps</code> or <code>.</code>.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-project-root-dir">Project Root</Label>
        <Input
          id="edit-project-root-dir"
          type="text"
          placeholder="."
          defaultValue={project.projectRootDir}
          aria-label="Project root directory inside the repository"
        />
        <p className="text-xs text-muted-foreground">
          Strategy detection and app build run here. This must stay inside the workspace root, for example <code>apps/web</code>.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-runtime-image-mode">Runtime Image Mode</Label>
        <select
          id="edit-runtime-image-mode"
          defaultValue={project.runtimeImageMode}
          aria-label="Runtime image mode"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="auto">Auto</option>
          <option value="platform">Platform image</option>
          <option value="dockerfile">Repo Dockerfile</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Auto prefers your repo Dockerfile when present. Platform always uses a pdploy-generated runtime image.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-dockerfile-path">Dockerfile Path (optional)</Label>
        <Input
          id="edit-dockerfile-path"
          type="text"
          placeholder="Dockerfile"
          defaultValue={project.dockerfilePath ?? ""}
          aria-label="Dockerfile path relative to the repository root"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-docker-build-target">Docker Build Target (optional)</Label>
        <Input
          id="edit-docker-build-target"
          type="text"
          placeholder="runner"
          defaultValue={project.dockerBuildTarget ?? ""}
          aria-label="Docker build target"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-runtime-container-port">Runtime Container Port</Label>
        <Input
          id="edit-runtime-container-port"
          type="number"
          min="1"
          max="65535"
          defaultValue={String(project.runtimeContainerPort)}
          aria-label="Runtime container port"
        />
        <p className="text-xs text-muted-foreground">
          Used for server previews when pdploy runs your built image. This is especially important for Dockerfile-first deploys.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-skip-host-strategy-build">Host Build Strategy</Label>
        <select
          id="edit-skip-host-strategy-build"
          defaultValue={project.skipHostStrategyBuild ? "skip" : "build"}
          aria-label="Skip host strategy build"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="build">Run host build strategy</option>
          <option value="skip">Dockerfile-only server build</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Dockerfile-only skips host install/build and uploads only the image built from your repo. Server previews only.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-framework-hint">Framework</Label>
        <select
          id="edit-framework-hint"
          defaultValue={project.frameworkHint}
          aria-label="Framework hint"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="auto">Auto-detect</option>
          <option value="nextjs">Next.js</option>
          <option value="node">Node server</option>
          <option value="python">Python</option>
          <option value="static">Static site</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Use a framework hint when auto-detect keeps picking the wrong output for this repository.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-preview-mode">Preview Type</Label>
        <select
          id="edit-preview-mode"
          defaultValue={project.previewMode}
          aria-label="Preview type"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="auto">Auto-detect</option>
          <option value="static">Static</option>
          <option value="server">Server</option>
        </select>
        <p className="text-xs text-muted-foreground">
          This is your requested preview mode. The deployment detail page shows the final resolved output after the build.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-server-preview-target">Server Preview Target</Label>
        <select
          id="edit-server-preview-target"
          defaultValue={project.serverPreviewTarget}
          aria-label="Server preview target"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
        >
          <option value="isolated-runner">Isolated runner</option>
          <option value="trusted-local-docker">Trusted local Docker</option>
        </select>
        <p className="text-xs text-muted-foreground">
          Isolated runner is recommended for production. Trusted local Docker is for self-hosted trusted environments.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-install-command">Install command (optional)</Label>
        <Textarea
          id="edit-install-command"
          rows={2}
          placeholder="npm ci --legacy-peer-deps"
          defaultValue={project.installCommand ?? ""}
          aria-label="Custom dependency install command for Node.js builds"
          className="min-h-[72px] resize-y font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          For Node.js builds only, replaces the auto-detected install command. No shell — use a single command line (examples:{" "}
          <code className="text-xs">npm ci --legacy-peer-deps</code>, <code className="text-xs">pnpm install --frozen-lockfile</code>
          ). Runs in the workspace root inside the build container.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="edit-build-command">Build command (optional)</Label>
        <Textarea
          id="edit-build-command"
          rows={2}
          placeholder="npm run build"
          defaultValue={project.buildCommand ?? ""}
          aria-label="Custom build command for Node.js builds"
          className="min-h-[72px] resize-y font-mono text-sm"
        />
        <p className="text-xs text-muted-foreground">
          When set, runs this instead of the default package-manager build for Node.js. Leave empty to keep using{" "}
          <code className="text-xs">package.json</code> behavior (including skipping build when there is no build script).
        </p>
      </div>
      <div className="pt-1">
        <Button type="submit">Save Changes</Button>
      </div>
    </form>

  </div>
);

const envPillBtn = "inline-flex items-center gap-1.5 rounded-[7px] border border-border bg-card px-3 py-1.5 text-[13px] font-medium tracking-tight text-foreground transition-colors hover:bg-muted/50";
const envPillBtnPrimary =
  "inline-flex items-center gap-1.5 rounded-[7px] border border-primary bg-primary px-3 py-1.5 text-[13px] font-medium tracking-tight text-primary-foreground transition-colors hover:bg-primary/90";

const EnvSection = ({ projectId }: { projectId: string }) => (
  <div className="space-y-6 pb-4">
    <div>
      <h2 className="text-[15px] font-semibold tracking-tight text-foreground">Environment variables</h2>
      <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
        Values are saved with the project and applied on deploy—no per-deploy <code className="text-foreground/90">.env</code>{" "}
        upload. Keys starting with{" "}
        <code className="text-foreground/90">NEXT_PUBLIC_</code> or <code className="text-foreground/90">PD_PUBLIC_</code>{" "}
        default to <span className="text-foreground/90">Build</span>; others default to{" "}
        <span className="text-foreground/90">Runtime</span>. Click a scope badge to override.
      </p>
      <p className="text-xs text-muted-foreground leading-relaxed rounded-md border border-border/60 bg-muted/20 px-3 py-2.5">
        <strong className="font-medium text-foreground/90">Install and build commands</strong> live under{" "}
        <a href={`/projects/${projectId}/settings`} className="font-medium text-primary underline-offset-2 hover:underline">
          General
        </a>
        . Saving variables here does not update those fields—open General and click Save Changes after editing them.
      </p>
      <details className="mt-4 rounded-lg border border-border/80 bg-muted/15 px-4 py-3 text-sm open:shadow-sm">
        <summary className="cursor-pointer list-none font-medium text-foreground select-none [&::-webkit-details-marker]:hidden flex items-center gap-2">
          <span className="text-muted-foreground text-xs" aria-hidden>
            ▸
          </span>
          How this works
        </summary>
        <div className="mt-3 space-y-2 text-xs text-muted-foreground leading-relaxed border-t border-border/50 pt-3">
          <p>
            <strong className="text-foreground/90 font-medium">Build</strong> variables are passed into the build step
            (install, compile). Use for anything the build must read; treat them as sensitive if logs or artifacts could
            expose them.
          </p>
          <p>
            <strong className="text-foreground/90 font-medium">Runtime</strong> variables are not sent to the build
            worker in pdploy today—they stay stored for when runtime injection is wired end-to-end.
          </p>
          <p>Only project owners can read or change these values via the API.</p>
        </div>
      </details>
    </div>

    <div className="overflow-hidden rounded-[10px] border border-border/80 bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border/50 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-foreground">Variables</h3>
          <p id="project-env-count" className="text-xs text-muted-foreground mt-0.5">
            …
          </p>
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
            Parser matches deployment builds (comments, <code className="text-[0.7rem]">export</code>, quoted values).
            Merge from paste or file, then <strong className="text-foreground/80 font-medium">Save</strong> when the bar
            appears.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div id="project-env-row-actions" className="hidden">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  id="project-env-reveal-toggle"
                  className={cn(envPillBtn, "shrink-0")}
                  aria-pressed="false"
                >
                  <Eye className="env-reveal-icon-show size-3.5 shrink-0" aria-hidden />
                  <EyeOff className="env-reveal-icon-hide size-3.5 shrink-0 hidden" aria-hidden />
                  <span className="env-reveal-label-show">Reveal values</span>
                  <span className="env-reveal-label-hide hidden">Hide values</span>
                </button>
                <button type="button" id="project-env-copy-all" className={cn(envPillBtn, "shrink-0")}>
                  <Copy className="env-copy-icon-default size-3.5 shrink-0" aria-hidden />
                  <Check className="env-copy-icon-done size-3.5 shrink-0 hidden text-primary" aria-hidden />
                  <span className="env-copy-label">Copy all</span>
                  <span className="env-copy-label-done hidden">Copied</span>
                </button>
              </div>
            </div>
            <button type="button" className={cn(envPillBtnPrimary, "js-project-env-add shrink-0")}>
              <Plus className="size-3.5 shrink-0" aria-hidden />
              Add
            </button>
          </div>
          <Input
            id="project-env-search"
            type="search"
            placeholder="Filter by key…"
            aria-label="Filter environment variables by key"
            autoComplete="off"
            className="h-9 max-w-full font-mono text-xs sm:w-[220px]"
          />
        </div>
      </div>

      <input
        id="project-env-show-values"
        type="checkbox"
        className="sr-only"
        aria-label="Reveal values in the table"
      />

      <div className="space-y-4 p-4">
        <details
          id="project-env-import"
          className="group/import rounded-[10px] border border-dashed border-border/80 bg-muted/10 px-4 py-4 transition-colors open:border-border hover:bg-muted/12 open:bg-muted/15"
        >
          <summary className="cursor-pointer list-none select-none text-xs font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden flex items-center gap-2">
            <Plus className="size-3.5 opacity-70" aria-hidden />
            Import from <code className="font-mono text-[0.7rem]">.env</code> (paste, file, or drop)
          </summary>
          <div
            id="project-env-drop-zone"
            className="mt-3 space-y-3 rounded-lg border border-transparent transition-colors"
          >
            <p className="text-center text-xs text-muted-foreground">
              Paste a <code className="rounded bg-muted px-1.5 py-px font-mono text-[0.65rem]">.env</code> or drag a file
              here. Matching keys update rows; new keys append.
            </p>
            <Textarea
              id="project-env-paste"
              rows={4}
              placeholder={"DATABASE_URL=postgres://...\nAPI_KEY=sk-...\nNEXT_PUBLIC_URL=https://..."}
              aria-label="Paste .env content to merge into the table"
              className="resize-y border-border/80 bg-muted/20 font-mono text-xs leading-relaxed"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" id="project-env-merge-paste" variant="secondary" size="sm" className="text-xs">
                Parse paste
              </Button>
              <label className="inline-flex cursor-pointer">
                <Input id="project-env-file-upload" type="file" accept=".env,text/plain" className="sr-only" />
                <span className={cn(envPillBtn, "cursor-pointer text-xs")}>Choose file</span>
              </label>
            </div>
          </div>
        </details>

        <div className="relative overflow-hidden rounded-[10px] border border-border/60 bg-background/30">
          <div className="max-h-[min(52vh,28rem)] overflow-auto">
            <table className="env-editor-table w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/25">
                  <th className="w-[40%] border-b border-r border-border/50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Key
                  </th>
                  <th className="min-w-32 border-b border-border/50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Value
                  </th>
                  <th className="w-24 whitespace-nowrap border-b border-border/50 px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Scope
                  </th>
                  <th className="w-22 border-b border-border/50 px-2 py-2.5" aria-label="Row actions" />
                </tr>
              </thead>
              <tbody id="project-env-rows">
                <tr id="project-env-empty">
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground text-sm">
                    No variables yet. Use <span className="font-medium text-foreground/80">Add</span> or import a{" "}
                    <code className="font-mono text-xs">.env</code>.
                  </td>
                </tr>
                <tr id="project-env-filter-empty" className="hidden">
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No keys match this filter.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="js-project-env-add flex w-full cursor-pointer items-center gap-2 border-t border-border/50 bg-transparent px-4 py-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground"
          >
            <Plus className="size-3.5 shrink-0 opacity-70" aria-hidden />
            Add variable
          </button>
        </div>
      </div>
    </div>

    <div
      id="project-env-save-bar"
      role="region"
      aria-label="Save environment variables"
      className="fixed bottom-0 left-0 right-0 z-40 hidden border-t border-border bg-background/92 backdrop-blur-md px-4 py-3 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.45)]"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p id="project-env-dirty-label" className="text-sm text-muted-foreground">
          Unsaved changes
        </p>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button id="project-env-discard" type="button" variant="outline" size="sm">
            Discard
          </Button>
          <Button id="project-env-save" type="button" size="sm">
            Save
          </Button>
        </div>
      </div>
    </div>
  </div>
);

const DangerSection = ({ project }: { project: Project }) => (
  <div className="space-y-6">
    <div>
      <h2 className="text-lg font-semibold text-destructive">Danger Zone</h2>
      <p className="text-sm text-muted-foreground mt-1">Irreversible actions. Proceed with caution.</p>
    </div>
    <Separator className="border-destructive/30" />
    <Card className="border-destructive/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Delete Project</CardTitle>
        <CardDescription>
          Permanently delete <strong className="text-foreground">{project.name}</strong> and all its deployments. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button id="delete-btn" type="button" variant="destructive">Delete Project</Button>
      </CardContent>
    </Card>
  </div>
);

const ProjectSettingsPage = ({ data }: { data: ProjectSettingsData }) => {
  const { project, activeSection } = data;

  return (
    <Layout
      title={`Settings · ${project.name} · pdploy`}
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
      <div
        id="notification"
        aria-live="polite"
        className="hidden fixed top-17 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg"
      />
      <input type="hidden" id="project-id" value={project.id} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <a
            href={`/projects/${project.id}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground no-underline hover:no-underline transition-colors"
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
        <nav
          className="flex shrink-0 flex-row gap-1 lg:w-52 lg:flex-col"
          aria-label="Settings sections"
        >
          {settingsNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeSection;
            return (
              <a
                key={item.id}
                href={item.href(project.id)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors no-underline hover:no-underline",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
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

        <div className="min-w-0 flex-1 max-w-2xl">
          {activeSection === "general" && <GeneralSection project={project} />}
          {activeSection === "env" && <EnvSection projectId={project.id} />}
          {activeSection === "danger" && <DangerSection project={project} />}
        </div>
      </div>
    </Layout>
  );
};

export const renderProjectSettingsPage = (data: ProjectSettingsData) =>
  renderToReadableStream(<ProjectSettingsPage data={data} />);
