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
  github: {
    linked: boolean;
    hasRepoAccess: boolean;
  };
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

const ProjectsPage = ({ data }: { data: ProjectsPageData }) => (
  <Layout title="Projects · Placeholder" currentPath="/projects" scriptSrc="/assets/projects-page.js" user={data.user ?? null}>
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
        <div className="box" id="github-import">
          <h3 className="subtitle is-5">GitHub repositories</h3>
          <p className="mb-3" style={{ color: "#888" }}>
            Link GitHub repo access to pick a repository without pasting URLs.
          </p>
          <div className="mb-3">
            <span className={`tag ${data.github.hasRepoAccess ? "is-success" : "is-light"}`}>
              {data.github.hasRepoAccess
                ? "Repo access granted"
                : data.github.linked
                  ? "Repo access not granted"
                  : "GitHub not linked"}
            </span>
          </div>
          {data.github.hasRepoAccess ? (
            <button id="github-select-btn" type="button" className="button is-link is-fullwidth">
              Choose repository
            </button>
          ) : (
            <button id="github-connect-btn" type="button" className="button is-link is-fullwidth">
              Grant GitHub repo access
            </button>
          )}
          <p className="help">
            {data.github.hasRepoAccess
              ? "Select a repository to create a project."
              : "You'll be redirected to GitHub to approve access."}
          </p>
        </div>

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
              <label className="label" htmlFor="project-branch">
                Branch
              </label>
              <div className="control">
                <input
                  id="project-branch"
                  className="input"
                  type="text"
                  placeholder="main"
                  required
                  aria-label="Branch to deploy"
                />
              </div>
              <p className="help">Branch to deploy (required)</p>
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

    <div id="github-modal" className="modal">
      <div className="modal-background" data-github-close="true" />
      <div className="modal-card">
        <header className="modal-card-head">
          <p className="modal-card-title">Choose a GitHub repository</p>
          <button className="delete" aria-label="close" data-github-close="true" />
        </header>
        <section className="modal-card-body">
          <div className="field">
            <label className="label" htmlFor="github-repo-search">
              Filter
            </label>
            <div className="control">
              <input
                id="github-repo-search"
                className="input"
                type="text"
                placeholder="owner/repo"
                aria-label="Filter GitHub repositories"
              />
            </div>
          </div>
          <div id="github-repo-status" className="notification is-light" style={{ display: "none" }} />
          <div id="github-repo-list" style={{ maxHeight: "260px", overflowY: "auto" }} />
          <div className="field mt-4" id="github-branch-field">
            <label className="label" htmlFor="github-branch-select">
              Branch to deploy <span className="has-text-weight-normal has-text-grey">(required)</span>
            </label>
            <div className="control">
              <select
                id="github-branch-select"
                className="input"
                aria-label="Branch to deploy"
                disabled
              >
                <option value="">Select a repository above first</option>
              </select>
            </div>
          </div>
        </section>
        <footer className="modal-card-foot">
          <button id="github-create-btn" className="button is-success" disabled>
            Create project
          </button>
          <button type="button" className="button" data-github-close="true">
            Cancel
          </button>
        </footer>
      </div>
    </div>
  </Layout>
);

export const renderProjectsPage = (data: ProjectsPageData) =>
  renderToReadableStream(<ProjectsPage data={data} />);
