/**
 * Browser-only script for the Projects page. Uses DOM APIs (document, window).
 * Do not import this file in React or server code — it is built to a bundle and
 * loaded via <script src="/assets/projects-page.js" type="module"> in SSR HTML.
 */

type GitHubRepo = {
  id: number;
  name: string;
  fullName: string;
  htmlUrl: string;
  private: boolean;
  description: string | null;
};

const getEl = (id: string): HTMLElement | null => document.getElementById(id);

const showNotification = (message: string, type: string): void => {
  const notification = getEl("notification");
  if (!notification) return;
  notification.textContent = message;
  notification.className = "notification is-toast " + type;
  notification.style.display = "block";
  setTimeout(() => {
    notification.style.display = "none";
  }, 3000);
};

const handleDelete = async (projectId: string, projectName: string): Promise<void> => {
  if (!confirm('Are you sure you want to delete "' + projectName + '"?')) return;
  try {
    const response = await fetch("/projects/" + projectId, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(data.error ?? "Failed to delete project");
    }
    showNotification("Project deleted", "is-success");
    setTimeout(() => window.location.reload(), 500);
  } catch (err) {
    showNotification(err instanceof Error ? err.message : "Failed to delete project", "is-danger");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  const form = getEl("create-project-form") as HTMLFormElement | null;
  const submitBtn = getEl("submit-btn");
  const notification = getEl("notification");

  if (form && submitBtn) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = getEl("project-name") as HTMLInputElement | null;
      const repoInput = getEl("repo-url") as HTMLInputElement | null;
      const branchInput = getEl("project-branch") as HTMLInputElement | null;
      const name = nameInput?.value.trim() ?? "";
      const repoUrl = repoInput?.value.trim() ?? "";
      const branch = branchInput?.value.trim() ?? "";
      if (!name || !repoUrl || !branch) {
        showNotification("Please fill in name, repository and branch", "is-danger");
        return;
      }
      submitBtn.classList.add("is-loading");
      try {
        const response = await fetch("/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, repoUrl, branch })
        });
        const data = (await response.json()) as { id?: string; error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to create project");
        }
        showNotification("Project created!", "is-success");
        setTimeout(() => {
          window.location.href = "/projects/" + (data.id ?? "");
        }, 500);
      } catch (err) {
        showNotification(err instanceof Error ? err.message : "Failed to create project", "is-danger");
      } finally {
        submitBtn.classList.remove("is-loading");
      }
    });
  }

  (window as Window & { handleDelete?: typeof handleDelete }).handleDelete = handleDelete;

  const githubConnectBtn = getEl("github-connect-btn");
  const githubSelectBtn = getEl("github-select-btn");
  const githubModal = getEl("github-modal");
  const githubRepoList = getEl("github-repo-list");
  const githubRepoSearch = getEl("github-repo-search") as HTMLInputElement | null;
  const githubRepoStatus = getEl("github-repo-status");
  const githubCreateBtn = getEl("github-create-btn");
  const githubCloseEls = githubModal?.querySelectorAll("[data-github-close]") ?? [];

  let githubRepos: GitHubRepo[] = [];
  let githubSelected: GitHubRepo | null = null;
  let githubLoading = false;

  const githubBranchSelect = getEl("github-branch-select") as HTMLSelectElement | null;

  const openGitHubModal = (): void => {
    if (!githubModal) return;
    githubSelected = null;
    if (githubBranchSelect) {
      githubBranchSelect.innerHTML = "<option value=\"\">Select a repository above first</option>";
      githubBranchSelect.disabled = true;
    }
    if (githubCreateBtn) (githubCreateBtn as HTMLButtonElement).disabled = true;
    githubModal.classList.add("is-active");
    document.documentElement.classList.add("is-clipped");
  };

  const loadBranches = async (owner: string, repo: string): Promise<string[]> => {
    const params = new URLSearchParams({ owner, repo });
    const response = await fetch("/api/github/branches?" + params.toString(), {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? "Failed to load branches");
    }
    const data = (await response.json()) as { branches?: string[] };
    return Array.isArray(data.branches) ? data.branches : [];
  };

  const closeGitHubModal = (): void => {
    if (!githubModal) return;
    githubModal.classList.remove("is-active");
    document.documentElement.classList.remove("is-clipped");
  };

  const setRepoStatus = (message: string, type: string): void => {
    if (!githubRepoStatus) return;
    if (!message) {
      githubRepoStatus.style.display = "none";
      return;
    }
    githubRepoStatus.textContent = message;
    githubRepoStatus.className = "notification " + (type || "is-light");
    githubRepoStatus.style.display = "block";
  };

  const clearRepoStatus = (): void => setRepoStatus("", "is-light");

  const selectRepo = async (repo: GitHubRepo): Promise<void> => {
    githubSelected = repo;
    if (!githubBranchSelect || !githubCreateBtn) return;
    githubBranchSelect.disabled = true;
    githubBranchSelect.innerHTML = "<option value=\"\">Loading branches…</option>";
    (githubCreateBtn as HTMLButtonElement).disabled = true;
    setRepoStatus("", "");
    const [owner, repoName] = repo.fullName.split("/");
    if (!owner || !repoName) {
      githubBranchSelect.innerHTML = "<option value=\"\">Could not parse repo</option>";
      return;
    }
    try {
      const branches = await loadBranches(owner, repoName);
      githubBranchSelect.innerHTML = branches.length
        ? branches.map((b) => `<option value="${escapeHtml(b)}"${b === "main" ? " selected" : ""}>${escapeHtml(b)}</option>`).join("")
        : "<option value=\"\">No branches found</option>";
      githubBranchSelect.disabled = false;
      (githubCreateBtn as HTMLButtonElement).disabled = branches.length === 0;
    } catch (err) {
      githubBranchSelect.innerHTML = "<option value=\"\">Failed to load branches</option>";
      setRepoStatus(err instanceof Error ? err.message : "Failed to load branches", "is-danger");
    }
  };

  const escapeHtml = (s: string): string =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  const renderRepoList = (list: GitHubRepo[]): void => {
    if (!githubRepoList) return;
    githubRepoList.innerHTML = "";
    if (!list.length) {
      const empty = document.createElement("p");
      empty.style.color = "#888";
      empty.textContent = "No repositories match your search.";
      githubRepoList.appendChild(empty);
      return;
    }
    list.forEach((repo) => {
      const card = document.createElement("label");
      card.className = "box";
      card.style.padding = "0.75rem";
      card.style.cursor = "pointer";
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "0.5rem";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "github-repo";
      radio.value = repo.fullName;
      radio.checked = githubSelected?.id === repo.id;
      radio.addEventListener("change", () => selectRepo(repo));
      const title = document.createElement("strong");
      title.textContent = repo.fullName;
      const tag = document.createElement("span");
      tag.className = "tag " + (repo.private ? "is-warning" : "is-light");
      tag.textContent = repo.private ? "private" : "public";
      row.appendChild(radio);
      row.appendChild(title);
      row.appendChild(tag);
      const desc = document.createElement("p");
      desc.textContent = repo.description ?? "No description";
      desc.style.color = "#888";
      desc.style.marginTop = "0.25rem";
      card.appendChild(row);
      card.appendChild(desc);
      githubRepoList.appendChild(card);
    });
  };

  const filterRepos = (): void => {
    const query = githubRepoSearch?.value.trim().toLowerCase() ?? "";
    if (!query) {
      renderRepoList(githubRepos);
      return;
    }
    const filtered = githubRepos.filter(
      (repo) =>
        repo.fullName.toLowerCase().includes(query) || repo.name.toLowerCase().includes(query)
    );
    renderRepoList(filtered);
  };

  const loadRepos = async (): Promise<void> => {
    if (!githubRepoList || githubLoading) return;
    githubLoading = true;
    setRepoStatus("Loading repositories...", "is-light");
    githubRepoList.innerHTML = "";
    try {
      const response = await fetch("/api/github/repos", { headers: { Accept: "application/json" } });
      const data = (await response.json().catch(() => ({}))) as { repos?: GitHubRepo[]; error?: string };
      if (!response.ok) {
        setRepoStatus(data.error ?? "Failed to load repositories", "is-danger");
        return;
      }
      githubRepos = Array.isArray(data.repos) ? data.repos : [];
      if (githubRepos.length === 0) {
        setRepoStatus("No repositories found.", "is-light");
        renderRepoList([]);
        return;
      }
      clearRepoStatus();
      filterRepos();
    } catch {
      setRepoStatus("Failed to load repositories.", "is-danger");
    } finally {
      githubLoading = false;
    }
  };

  if (githubSelectBtn) {
    githubSelectBtn.addEventListener("click", () => {
      openGitHubModal();
      loadRepos();
    });
  }
  if (githubRepoSearch) {
    githubRepoSearch.addEventListener("input", filterRepos);
  }
  if (githubCreateBtn) {
    (githubCreateBtn as HTMLButtonElement).addEventListener("click", async () => {
      if (!githubSelected || !githubBranchSelect?.value.trim()) return;
      const branch = githubBranchSelect.value.trim();
      (githubCreateBtn as HTMLButtonElement).classList.add("is-loading");
      try {
        const response = await fetch("/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: githubSelected.name,
            repoUrl: githubSelected.htmlUrl,
            branch
          })
        });
        const data = (await response.json()) as { id?: string; error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to create project");
        }
        window.location.href = "/projects/" + (data.id ?? "");
      } catch (err) {
        setRepoStatus(err instanceof Error ? err.message : "Failed to create project", "is-danger");
      } finally {
        (githubCreateBtn as HTMLButtonElement).classList.remove("is-loading");
      }
    });
  }
  if (githubConnectBtn) {
    githubConnectBtn.addEventListener("click", async () => {
      (githubConnectBtn as HTMLButtonElement).classList.add("is-loading");
      try {
        const callbackURL = window.location.pathname + "?github=linked";
        const response = await fetch("/api/auth/link-social", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "github",
            callbackURL,
            scopes: ["repo", "user:email"]
          })
        });
        if (response.redirected) {
          window.location.href = response.url;
          return;
        }
        const loc = response.headers.get("Location");
        if (loc) {
          window.location.href = loc;
          return;
        }
        const data = (await response.json().catch(() => ({}))) as { url?: string };
        if (data.url) {
          window.location.href = data.url;
          return;
        }
        showNotification("GitHub linking failed. Please try again.", "is-danger");
      } catch {
        showNotification("GitHub linking failed. Please try again.", "is-danger");
      } finally {
        (githubConnectBtn as HTMLButtonElement).classList.remove("is-loading");
      }
    });
  }
  githubCloseEls.forEach((el) => {
    el.addEventListener("click", closeGitHubModal);
  });
  if (githubModal) {
    githubModal.addEventListener("click", (event: Event) => {
      if (event.target && (event.target as HTMLElement).classList.contains("modal-background")) {
        closeGitHubModal();
      }
    });
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get("github") === "linked") {
    openGitHubModal();
    loadRepos();
    params.delete("github");
    const query = params.toString();
    const nextUrl = window.location.pathname + (query ? "?" + query : "");
    window.history.replaceState({}, "", nextUrl);
  }
});
