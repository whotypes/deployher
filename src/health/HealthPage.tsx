import { renderToReadableStream } from "react-dom/server";
import { Layout } from "../ui/Layout";
import { formatBytes, formatDuration } from "../utils/format";

export type HealthData = {
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
};

const getStatusClass = (status: string) => {
  switch (status) {
    case "ok":
      return "is-success";
    case "degraded":
      return "is-warning";
    case "down":
      return "is-danger";
    default:
      return "is-light";
  }
};

const HealthPage = ({ data }: { data: HealthData }) => (
  <Layout title="Health · Placeholder" currentPath="/health">
    <div className="level">
      <div className="level-left">
        <div className="level-item">
          <h1 className="title">System Health</h1>
        </div>
        <div className="level-item">
          <span className={`tag ${getStatusClass(data.status)}`}>{data.status.toUpperCase()}</span>
        </div>
      </div>
    </div>

    <div className="columns is-multiline">
      <div className="column is-3">
        <div className="box">
          <p className="heading">Uptime</p>
          <p className="title is-5">{formatDuration(data.uptimeSeconds)}</p>
        </div>
      </div>
      <div className="column is-3">
        <div className="box">
          <p className="heading">Memory (RSS)</p>
          <p className="title is-5">{formatBytes(data.memory.rss)}</p>
        </div>
      </div>
      <div className="column is-3">
        <div className="box">
          <p className="heading">Pending Requests</p>
          <p className="title is-5">{data.pendingRequests}</p>
        </div>
      </div>
      <div className="column is-3">
        <div className="box">
          <p className="heading">Bun Version</p>
          <p className="title is-5">{data.bunVersion}</p>
        </div>
      </div>
    </div>

    <div className="columns">
      <div className="column is-6">
        <div className="box">
          <h3 className="subtitle is-5">Server</h3>
          <table className="table is-fullwidth">
            <tbody>
              <tr>
                <th>Environment</th>
                <td>{data.environment}</td>
              </tr>
              <tr>
                <th>Hostname</th>
                <td>
                  <code>
                    {data.hostname}:{data.port}
                  </code>
                </td>
              </tr>
              <tr>
                <th>PID</th>
                <td>{data.pid}</td>
              </tr>
              <tr>
                <th>Started</th>
                <td>{new Date(data.startedAt).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="column is-6">
        <div className="box">
          <h3 className="subtitle is-5">Memory</h3>
          <table className="table is-fullwidth">
            <tbody>
              <tr>
                <th>RSS</th>
                <td>{formatBytes(data.memory.rss)}</td>
              </tr>
              <tr>
                <th>Heap Total</th>
                <td>{formatBytes(data.memory.heapTotal)}</td>
              </tr>
              <tr>
                <th>Heap Used</th>
                <td>{formatBytes(data.memory.heapUsed)}</td>
              </tr>
              <tr>
                <th>External</th>
                <td>{formatBytes(data.memory.external)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </Layout>
);

export const renderHealthPage = (data: HealthData) =>
  renderToReadableStream(<HealthPage data={data} />);
