import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser } from "./Layout";
import { Layout } from "./Layout";

type Project = {
  id: string;
  name: string;
  repoUrl: string;
  createdAt: string;
  updatedAt: string;
  currentDeploymentId: string | null;
  currentDeploymentStatus?: string;
};

export type ProjectsPageData = {
  projects: Project[];
  user?: LayoutUser | null;
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

const scripts = `
  document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('create-project-form');
    const submitBtn = document.getElementById('submit-btn');
    const notification = document.getElementById('notification');
    
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      const name = document.getElementById('project-name').value.trim();
      const repoUrl = document.getElementById('repo-url').value.trim();
      
      if (!name || !repoUrl) {
        showNotification('Please fill in all fields', 'is-danger');
        return;
      }
      
      submitBtn.classList.add('is-loading');
      
      try {
        const response = await fetch('/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, repoUrl })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to create project');
        }
        
        showNotification('Project created!', 'is-success');
        setTimeout(() => {
          window.location.href = '/projects/' + data.id;
        }, 500);
      } catch (err) {
        showNotification(err.message, 'is-danger');
      } finally {
        submitBtn.classList.remove('is-loading');
      }
    });
    
    function showNotification(message, type) {
      notification.textContent = message;
      notification.className = 'notification is-toast ' + type;
      notification.style.display = 'block';
      setTimeout(() => {
        notification.style.display = 'none';
      }, 3000);
    }
    
    async function handleDelete(projectId, projectName) {
      if (!confirm('Are you sure you want to delete "' + projectName + '"?')) {
        return;
      }
      
      try {
        const response = await fetch('/projects/' + projectId, {
          method: 'DELETE'
        });
        
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to delete project');
        }
        
        showNotification('Project deleted', 'is-success');
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showNotification(err.message, 'is-danger');
      }
    }
    
    window.handleDelete = handleDelete;
  });
`;

const ProjectsPage = ({ data }: { data: ProjectsPageData }) => (
  <Layout title="Projects · Placeholder" currentPath="/projects" scripts={scripts} user={data.user ?? null}>
    <div id="notification" className="notification is-toast" style={{ display: "none" }} />

    <h1 className="title">Projects</h1>

    <div className="columns">
      <div className="column is-8">
        {data.projects.length === 0 ? (
          <div className="box">
            <p style={{ color: "#666" }}>No projects yet. Create your first project to get started.</p>
          </div>
        ) : (
          <div className="box">
            <table className="table is-fullwidth is-hoverable">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Repository</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <a href={`/projects/${project.id}`}>
                        <strong>{project.name}</strong>
                      </a>
                    </td>
                    <td>
                      <a
                        href={project.repoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "#666" }}
                      >
                        {project.repoUrl.replace("https://github.com/", "")}
                      </a>
                    </td>
                    <td>
                      {project.currentDeploymentId ? (
                        <a href={`/deployments/${project.currentDeploymentId}`}>
                          <span className={`tag ${getStatusClass(project.currentDeploymentStatus)}`}>
                            {project.currentDeploymentStatus || "unknown"}
                          </span>
                        </a>
                      ) : (
                        <span className="tag is-light">no deploys</span>
                      )}
                    </td>
                    <td style={{ color: "#666" }}>{new Date(project.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="column is-4">
        <div className="box" id="new">
          <h3 className="subtitle is-5">New Project</h3>
          <form id="create-project-form">
            <div className="field">
              <label className="label" htmlFor="project-name">
                Name
              </label>
              <div className="control">
                <input
                  id="project-name"
                  className="input"
                  type="text"
                  placeholder="my-app"
                  required
                  aria-label="Project name"
                />
              </div>
            </div>

            <div className="field">
              <label className="label" htmlFor="repo-url">
                Repository
              </label>
              <div className="control">
                <input
                  id="repo-url"
                  className="input"
                  type="url"
                  placeholder="https://github.com/owner/repo"
                  required
                  aria-label="GitHub repository URL"
                />
              </div>
              <p className="help">Public GitHub repository</p>
            </div>

            <div className="field">
              <div className="control">
                <button id="submit-btn" type="submit" className="button is-success is-fullwidth">
                  Create
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  </Layout>
);

export const renderProjectsPage = (data: ProjectsPageData) =>
  renderToReadableStream(<ProjectsPage data={data} />);
