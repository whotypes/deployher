import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser } from "./Layout";
import { Layout } from "./Layout";

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
  user?: LayoutUser | null;
  examples: ExampleRow[];
};

const getStatusClass = (status?: string) => {
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

const AdminExamplesPage = ({ data }: { data: AdminExamplesPageData }) => (
  <Layout
    title="Admin · Example Deployments"
    currentPath="/admin"
    scriptSrc="/assets/admin-examples-page.js"
    user={data.user ?? null}
  >
    <div id="notification" className="notification is-toast" style={{ display: "none" }} />

    <div className="level">
      <div className="level-left">
        <div className="level-item">
          <h1 className="title">Admin Test Workflow</h1>
        </div>
      </div>
      <div className="level-right">
        <div className="level-item">
          <button type="button" id="refresh-admin-examples" className="button is-info">
            Refresh
          </button>
        </div>
      </div>
    </div>
    <p className="mb-4" style={{ color: "#888" }}>
      Run build and deploy for local examples in one click. Open deployment details for logs, or
      visit preview when ready.
    </p>

    <div className="box">
      <table className="table is-fullwidth">
        <thead>
          <tr>
            <th>Example</th>
            <th>Latest Deploy</th>
            <th>Status</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="admin-examples-tbody">
          {data.examples.map((example) => {
            const deployment = example.latestDeployment;
            return (
              <tr key={example.name} data-example-name={example.name}>
                <td>
                  <code>{example.name}</code>
                </td>
                <td data-field="deployment">
                  {deployment ? (
                    <a href={`/deployments/${deployment.id}`}>{deployment.shortId}</a>
                  ) : (
                    <span style={{ color: "#666" }}>No deployments</span>
                  )}
                </td>
                <td data-field="status">
                  <span className={`tag ${getStatusClass(deployment?.status)}`}>
                    {deployment?.status ?? "idle"}
                  </span>
                </td>
                <td data-field="createdAt">
                  {deployment ? new Date(deployment.createdAt).toLocaleString() : "—"}
                </td>
                <td data-field="actions">
                  <div className="buttons">
                    <button
                      type="button"
                      className="button is-success is-small"
                      data-action="deploy"
                      data-example-name={example.name}
                    >
                      Build & Deploy
                    </button>
                    {deployment ? (
                      <a className="button is-small" href={`/deployments/${deployment.id}`}>
                        Logs
                      </a>
                    ) : null}
                    {deployment?.status === "success" && deployment.previewUrl ? (
                      <a
                        className="button is-small is-link"
                        href={deployment.previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Preview
                      </a>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </Layout>
);

export const renderAdminExamplesPage = (data: AdminExamplesPageData) =>
  renderToReadableStream(<AdminExamplesPage data={data} />);

