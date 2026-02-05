import { renderToReadableStream } from "react-dom/server";
import type { HealthData } from "../health/HealthPage";
import { formatBytes, formatDuration } from "../utils/format";
import { Layout } from "./Layout";

type ProjectSummary = {
  id: string;
  name: string;
  repoUrl: string;
  currentDeploymentId: string | null;
};

type DeploymentSummary = {
  id: string;
  projectId: string;
  projectName: string;
  status: string;
  createdAt: string;
  previewUrl: string | null;
};

export type DashboardData = {
  health: HealthData;
  projects: ProjectSummary[];
  recentDeployments: DeploymentSummary[];
};

const getStatusClass = (status: string) => {
  switch (status) {
    case "success":
      return "is-success";
    case "failed":
      return "is-danger";
    case "building":
      return "is-warning";
    case "queued":
      return "is-info";
    default:
      return "is-light";
  }
};

const DashboardPage = ({ data }: { data: DashboardData }) => (
  <Layout title="Dashboard · Placeholder" currentPath="/">
    <h1 className="title">Dashboard</h1>

    <div className="columns is-multiline">
      <div className="column is-4">
        <div className="box">
          <p className="heading">Status</p>
          <p className="title is-4">
            <span className={`tag ${data.health.status === "ok" ? "is-success" : "is-danger"}`}>
              {data.health.status.toUpperCase()}
            </span>
          </p>
        </div>
      </div>

      <div className="column is-4">
        <div className="box">
          <p className="heading">Uptime</p>
          <p className="title is-4">{formatDuration(data.health.uptimeSeconds)}</p>
        </div>
      </div>

      <div className="column is-4">
        <div className="box">
          <p className="heading">Memory</p>
          <p className="title is-4">{formatBytes(data.health.memory.rss)}</p>
        </div>
      </div>
    </div>

    <div className="columns">
      <div className="column is-6">
        <div className="box">
          <div className="level mb-3">
            <div className="level-left">
              <h3 className="subtitle is-5 mb-0">Projects</h3>
            </div>
            <div className="level-right">
              <a href="/projects" style={{ color: "#888", fontSize: "0.875rem" }}>
                View all →
              </a>
            </div>
          </div>
          {data.projects.length === 0 ? (
            <p style={{ color: "#666" }}>No projects yet.</p>
          ) : (
            <table className="table is-fullwidth is-hoverable">
              <tbody>
                {data.projects.slice(0, 5).map((project) => (
                  <tr key={project.id}>
                    <td>
                      <a href={`/projects/${project.id}`}>
                        <strong>{project.name}</strong>
                      </a>
                    </td>
                    <td style={{ color: "#666" }}>
                      {project.repoUrl.replace("https://github.com/", "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="column is-6">
        <div className="box">
          <div className="level mb-3">
            <div className="level-left">
              <h3 className="subtitle is-5 mb-0">Recent Deployments</h3>
            </div>
          </div>
          {data.recentDeployments.length === 0 ? (
            <p style={{ color: "#666" }}>No deployments yet.</p>
          ) : (
            <table className="table is-fullwidth is-hoverable">
              <tbody>
                {data.recentDeployments.slice(0, 5).map((deployment) => (
                  <tr key={deployment.id}>
                    <td>
                      <a href={`/projects/${deployment.projectId}`}>{deployment.projectName}</a>
                    </td>
                    <td>
                      <a href={`/deployments/${deployment.id}`}>
                        <span className={`tag ${getStatusClass(deployment.status)}`}>
                          {deployment.status}
                        </span>
                      </a>
                    </td>
                    <td style={{ color: "#666", fontSize: "0.875rem" }}>
                      {new Date(deployment.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>

    <div className="box">
      <h3 className="subtitle is-5">Quick Actions</h3>
      <div className="buttons">
        <a href="/projects#new" className="button is-success">
          New Project
        </a>
        <a href="/files" className="button is-info">
          Files
        </a>
        <a href="/health" className="button is-info">
          System Health
        </a>
      </div>
    </div>
  </Layout>
);

export const renderDashboardPage = (data: DashboardData) =>
  renderToReadableStream(<DashboardPage data={data} />);
