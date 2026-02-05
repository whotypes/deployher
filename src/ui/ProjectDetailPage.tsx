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
  repoUrl: string;
  createdAt: string;
  updatedAt: string;
  currentDeploymentId: string | null;
};

export type ProjectDetailData = {
  project: Project;
  deployments: Deployment[];
  currentPreviewUrl: string | null;
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

const scripts = `
  document.addEventListener('DOMContentLoaded', function() {
    const editForm = document.getElementById('edit-project-form');
    const deployBtn = document.getElementById('deploy-btn');
    const deleteBtn = document.getElementById('delete-btn');
    const notification = document.getElementById('notification');
    const projectId = document.getElementById('project-id').value;
    
    function showNotification(message, type) {
      notification.textContent = message;
      notification.className = 'notification is-toast ' + type;
      notification.style.display = 'block';
      setTimeout(() => {
        notification.style.display = 'none';
      }, 3000);
    }
    
    editForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const name = document.getElementById('edit-name').value.trim();
      const repoUrl = document.getElementById('edit-repo-url').value.trim();
      
      if (!name && !repoUrl) {
        showNotification('Please provide at least one field to update', 'is-warning');
        return;
      }
      
      const body = {};
      if (name) body.name = name;
      if (repoUrl) body.repoUrl = repoUrl;
      
      try {
        const response = await fetch('/projects/' + projectId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to update project');
        }
        
        showNotification('Project updated!', 'is-success');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showNotification(err.message, 'is-danger');
      }
    });
    
    deployBtn.addEventListener('click', async function() {
      deployBtn.classList.add('is-loading');
      
      try {
        const response = await fetch('/projects/' + projectId + '/deployments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create deployment');
        }
        
        showNotification('Deployment started!', 'is-success');
        setTimeout(() => {
          window.location.href = '/deployments/' + data.id;
        }, 500);
      } catch (err) {
        showNotification(err.message, 'is-danger');
      } finally {
        deployBtn.classList.remove('is-loading');
      }
    });
    
    deleteBtn.addEventListener('click', async function() {
      if (!confirm('Are you sure you want to delete this project? This action cannot be undone.')) {
        return;
      }
      
      deleteBtn.classList.add('is-loading');
      
      try {
        const response = await fetch('/projects/' + projectId, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to delete project');
        }
        
        showNotification('Project deleted', 'is-success');
        setTimeout(() => {
          window.location.href = '/projects';
        }, 500);
      } catch (err) {
        showNotification(err.message, 'is-danger');
      } finally {
        deleteBtn.classList.remove('is-loading');
      }
    });
  });
`;

const ProjectDetailPage = ({ data }: { data: ProjectDetailData }) => (
  <Layout title={`${data.project.name} · Placeholder`} currentPath="/projects" scripts={scripts} user={data.user ?? null}>
    <div id="notification" className="notification is-toast" style={{ display: "none" }} />
    <input type="hidden" id="project-id" value={data.project.id} />

    <nav className="breadcrumb" aria-label="breadcrumbs">
      <ul>
        <li>
          <a href="/projects">Projects</a>
        </li>
        <li className="is-active">
          <a href={`/projects/${data.project.id}`} aria-current="page">
            {data.project.name}
          </a>
        </li>
      </ul>
    </nav>

    <div className="level">
      <div className="level-left">
        <div className="level-item">
          <h1 className="title">{data.project.name}</h1>
        </div>
      </div>
      <div className="level-right">
        <div className="level-item">
          {data.currentPreviewUrl ? (
            <a
              href={data.currentPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button is-link mr-2"
            >
              Visit
            </a>
          ) : null}
          <button id="deploy-btn" type="button" className="button is-success">
            Deploy
          </button>
        </div>
      </div>
    </div>

    <div className="columns">
      <div className="column is-8">
        <div className="box">
          <h3 className="subtitle is-5">Project Info</h3>
          <table className="table is-fullwidth">
            <tbody>
              <tr>
                <th style={{ width: "150px" }}>Repository</th>
                <td>
                  <a href={data.project.repoUrl} target="_blank" rel="noopener noreferrer">
                    {data.project.repoUrl.replace("https://github.com/", "")}
                  </a>
                </td>
              </tr>
              <tr>
                <th>Created</th>
                <td>{new Date(data.project.createdAt).toLocaleString()}</td>
              </tr>
              <tr>
                <th>Updated</th>
                <td>{new Date(data.project.updatedAt).toLocaleString()}</td>
              </tr>
              {data.currentPreviewUrl ? (
                <tr>
                  <th>Preview URL</th>
                  <td>
                    <a href={data.currentPreviewUrl} target="_blank" rel="noopener noreferrer">
                      {data.currentPreviewUrl}
                    </a>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="box">
          <h3 className="subtitle is-5">Deployments</h3>
          {data.deployments.length === 0 ? (
            <p style={{ color: "#666" }}>No deployments yet. Click "Deploy" to create one.</p>
          ) : (
            <table className="table is-fullwidth is-hoverable">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody>
                {data.deployments.map((deployment) => (
                  <tr key={deployment.id}>
                    <td>
                      <a href={`/deployments/${deployment.id}`}>{deployment.shortId}</a>
                      {deployment.id === data.project.currentDeploymentId ? (
                        <span className="tag is-info ml-2" style={{ fontSize: "0.625rem" }}>
                          current
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className={`tag ${getStatusClass(deployment.status)}`}>
                        {deployment.status}
                      </span>
                    </td>
                    <td>{new Date(deployment.createdAt).toLocaleString()}</td>
                    <td>
                      {deployment.status === "success" && deployment.previewUrl ? (
                        <a
                          href={deployment.previewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="button is-small is-link"
                        >
                          Visit
                        </a>
                      ) : (
                        <span style={{ color: "#444" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="column is-4">
        <div className="box">
          <h3 className="subtitle is-5">Settings</h3>
          <form id="edit-project-form">
            <div className="field">
              <label className="label" htmlFor="edit-name">
                Name
              </label>
              <div className="control">
                <input
                  id="edit-name"
                  className="input"
                  type="text"
                  placeholder={data.project.name}
                  aria-label="Project name"
                />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="edit-repo-url">
                Repository URL
              </label>
              <div className="control">
                <input
                  id="edit-repo-url"
                  className="input"
                  type="url"
                  placeholder={data.project.repoUrl}
                  aria-label="GitHub repository URL"
                />
              </div>
            </div>

            <div className="field">
              <div className="control">
                <button type="submit" className="button is-info is-fullwidth">
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="box">
          <h3 className="subtitle is-5" style={{ color: "#f00" }}>
            Danger Zone
          </h3>
          <p className="mb-3" style={{ color: "#888" }}>
            Deleting a project will also delete all its deployments.
          </p>
          <button id="delete-btn" type="button" className="button is-danger is-fullwidth">
            Delete Project
          </button>
        </div>
      </div>
    </div>
  </Layout>
);

export const renderProjectDetailPage = (data: ProjectDetailData) =>
  renderToReadableStream(<ProjectDetailPage data={data} />);
