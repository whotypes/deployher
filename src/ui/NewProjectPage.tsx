import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";

export type NewProjectPageData = {
  pathname: string;
  user?: LayoutUser | null;
  csrfToken?: string;
  sidebarProjects: SidebarProjectSummary[];
  github: {
    linked: boolean;
    hasRepoAccess: boolean;
  };
};

const NewProjectPage = ({ data }: { data: NewProjectPageData }) => (
  <Layout
    title="New project · Deployher"
    pathname={data.pathname}
    scriptSrc="/assets/new-project-page.js"
    user={data.user ?? null}
    csrfToken={data.csrfToken}
    sidebarProjects={data.sidebarProjects}
    breadcrumbs={[
      { label: "Projects", href: "/projects" },
      { label: "New project" }
    ]}
  >
    <script
      type="application/json"
      id="new-project-page-bootstrap"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          hasRepoAccess: data.github.hasRepoAccess,
          githubLinked: data.github.linked
        })
      }}
    />
    <div
      id="notification"
      aria-live="polite"
      className="fixed top-17 right-4 z-50 hidden rounded-md px-4 py-3 text-sm font-medium shadow-lg"
    />

    <div className="mx-auto max-w-6xl pb-16">
      <div className="dashboard-surface relative mb-8 overflow-hidden border-l-4 border-l-primary/70 p-5 md:p-6">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/40 via-transparent to-color-mix(in_oklab,var(--chart-2)_30%,transparent)"
          aria-hidden
        />
        <p className="eyebrow-label mb-2">Workspace</p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">New project</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Connect a GitHub repository or add one by URL. We scan manifests on GitHub to suggest framework and preview
          settings before you deploy.
        </p>
      </div>

      <div id="new-project-client-root" />
    </div>
  </Layout>
);

export const renderNewProjectPage = (data: NewProjectPageData) =>
  renderToReadableStream(<NewProjectPage data={data} />);
