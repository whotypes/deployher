import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser } from "./Layout";
import { Layout } from "./Layout";

type Deployment = {
  id: string;
  shortId: string;
  projectId: string;
  artifactPrefix: string;
  status: string;
  buildLogKey: string | null;
  previewUrl: string | null;
  createdAt: string;
  finishedAt: string | null;
};

type Project = {
  id: string;
  name: string;
};

export type DeploymentDetailData = {
  deployment: Deployment;
  project: Project;
  user?: LayoutUser | null;
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

const DeploymentDetailPage = ({ data }: { data: DeploymentDetailData }) => {
  const isActive = data.deployment.status === "queued" || data.deployment.status === "building";
  const isSuccess = data.deployment.status === "success";

  return (
    <Layout
      title={`Deployment ${data.deployment.shortId} · Placeholder`}
      currentPath="/projects"
      scriptSrc="/assets/deployment-detail-page.js"
      user={data.user ?? null}
    >
      <input type="hidden" id="deployment-id" value={data.deployment.id} />
      <input type="hidden" id="preview-url" value={data.deployment.previewUrl ?? ""} />

      <nav className="breadcrumb" aria-label="breadcrumbs">
        <ul>
          <li>
            <a href="/projects">Projects</a>
          </li>
          <li>
            <a href={`/projects/${data.project.id}`}>{data.project.name}</a>
          </li>
          <li className="is-active">
            <a href={`/deployments/${data.deployment.id}`} aria-current="page">
              {data.deployment.shortId}
            </a>
          </li>
        </ul>
      </nav>

      <div className="level">
        <div className="level-left">
          <div className="level-item">
            <h1 className="title">Deployment</h1>
          </div>
          <div className="level-item">
            <span id="status-badge" className={`tag ${getStatusClass(data.deployment.status)}`}>
              {data.deployment.status}
            </span>
          </div>
          {isActive ? (
            <div id="building-indicator" className="level-item">
              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "#888" }}>
                <span className="loader" />
                Building...
              </span>
            </div>
          ) : null}
        </div>
        <div className="level-right">
          <div className="level-item" id="preview-section">
            {isSuccess && data.deployment.previewUrl ? (
              <a
                href={data.deployment.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="button is-success"
              >
                Visit
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="columns">
        <div className="column is-4">
          <div className="box">
            <h3 className="subtitle is-5">Details</h3>
            <table className="table is-fullwidth">
              <tbody>
                <tr>
                  <th style={{ width: "100px" }}>ID</th>
                  <td>
                    <code>{data.deployment.shortId}</code>
                  </td>
                </tr>
                <tr>
                  <th>Project</th>
                  <td>
                    <a href={`/projects/${data.project.id}`}>{data.project.name}</a>
                  </td>
                </tr>
                <tr>
                  <th>Created</th>
                  <td>{new Date(data.deployment.createdAt).toLocaleString()}</td>
                </tr>
                <tr
                  id="finished-row"
                  style={{ display: data.deployment.finishedAt ? "table-row" : "none" }}
                >
                  <th>Finished</th>
                  <td id="finished-time">
                    {data.deployment.finishedAt
                      ? new Date(data.deployment.finishedAt).toLocaleString()
                      : ""}
                  </td>
                </tr>
                {isSuccess && data.deployment.previewUrl ? (
                  <tr>
                    <th>URL</th>
                    <td>
                      <a
                        href={data.deployment.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <code style={{ fontSize: "0.75rem" }}>{data.deployment.previewUrl}</code>
                      </a>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="column is-8">
          <div className="box">
            <div className="level mb-3">
              <div className="level-left">
                <h3 className="subtitle is-5 mb-0">Build Logs</h3>
              </div>
            </div>
            <pre id="log-output" className="log-output">
              {isActive
                ? "Connecting to build log stream...\n"
                : data.deployment.buildLogKey
                  ? "Loading logs...\n"
                  : "No logs available yet.\n"}
            </pre>
          </div>
        </div>
      </div>

      <style
        dangerouslySetInnerHTML={{
          __html: `
            .loader {
              width: 12px;
              height: 12px;
              border: 2px solid #888;
              border-bottom-color: transparent;
              border-radius: 50%;
              display: inline-block;
              animation: rotation 1s linear infinite;
            }
            @keyframes rotation {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `
        }}
      />
    </Layout>
  );
};

export const renderDeploymentDetailPage = (data: DeploymentDetailData) =>
  renderToReadableStream(<DeploymentDetailPage data={data} />);
