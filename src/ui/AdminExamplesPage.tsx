import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";

type BuildSettings = {
  memory: string;
  cpus: string;
  accountMaxConcurrent: number;
};

type ExampleDeployment = {
  id: string;
  shortId: string;
  status: "queued" | "building" | "success" | "failed";
  createdAt: string;
  finishedAt: string | null;
  previewUrl: string | null;
};

type ExampleRow = {
  name: string;
  projectId: string | null;
  latestDeployment: ExampleDeployment | null;
};

export type AdminExamplesPageData = {
  pathname: string;
  user?: LayoutUser | null;
  examples: ExampleRow[];
  buildSettings: BuildSettings;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
};

const AdminExamplesPage = ({ data }: { data: AdminExamplesPageData }) => (
  <Layout
    title="Admin · Example Deployments"
    pathname={data.pathname}
    scriptSrc="/assets/admin-examples-page.js"
    user={data.user ?? null}
    breadcrumbs={[{ label: "Admin" }]}
    csrfToken={data.csrfToken}
    sidebarProjects={data.sidebarProjects}
  >
    <div
      id="notification"
      aria-live="polite"
      className="hidden fixed top-17 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg"
    />
    <script
      type="application/json"
      id="admin-page-bootstrap"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          examples: data.examples,
          buildSettings: data.buildSettings
        }).replace(/</g, "\\u003c")
      }}
    />
    <div id="admin-client-root" />
  </Layout>
);

export const renderAdminExamplesPage = (data: AdminExamplesPageData) =>
  renderToReadableStream(<AdminExamplesPage data={data} />);
