import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "../ui/Layout";
import { Layout } from "../ui/Layout";

export type HealthData = {
  pathname?: string;
  status: "ok" | "degraded" | "down";
  environment: string;
  uptimeSeconds: number;
  startedAt: string;
  now: string;
  bunVersion: string;
  hostname: string;
  port: number;
  pid: number;
  pendingRequests: number;
  pendingWebSockets: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpu: {
    user: number;
    system: number;
  };
  domains: {
    dev: string;
    prod: string;
  };
  user?: LayoutUser | null;
  sidebarProjects?: SidebarProjectSummary[];
};

const HealthPage = ({ data }: { data: HealthData }) => (
  <Layout
    title="Health · Deployher"
    pathname={data.pathname ?? "/health"}
    user={data.user ?? null}
    scriptSrc="/assets/health-page.js"
    breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Health" }]}
    sidebarProjects={data.sidebarProjects}
  >
    <script
      type="application/json"
      id="health-page-bootstrap"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c")
      }}
    />
    <div id="health-client-root" />
  </Layout>
);

export const renderHealthPage = (data: HealthData) =>
  renderToReadableStream(<HealthPage data={data} />);
