/**
 * Browser-only script for the Project detail page. Uses DOM APIs.
 * Do not import in React or server code — loaded via <script src="/assets/project-detail-page.js" type="module">.
 */

const getEl = (id: string): HTMLElement | null => document.getElementById(id);
const MAX_ENV_FILE_SIZE_BYTES = 64 * 1024;

document.addEventListener("DOMContentLoaded", () => {
  const editForm = getEl("edit-project-form") as HTMLFormElement | null;
  const deployBtn = getEl("deploy-btn");
  const deleteBtn = getEl("delete-btn");
  const notification = getEl("notification");
  const projectIdEl = getEl("project-id") as HTMLInputElement | null;
  const deployEnvText = getEl("deploy-env-file") as HTMLTextAreaElement | null;
  const deployEnvUpload = getEl("deploy-env-upload") as HTMLInputElement | null;
  const projectId = projectIdEl?.value ?? "";

  if (!notification) return;

  const showNotification = (message: string, type: string): void => {
    notification.textContent = message;
    notification.className = "notification is-toast " + type;
    notification.style.display = "block";
    setTimeout(() => {
      notification.style.display = "none";
    }, 3000);
  };

  if (deployEnvUpload && deployEnvText) {
    deployEnvUpload.addEventListener("change", async () => {
      const file = deployEnvUpload.files?.[0];
      if (!file) return;

      if (file.size > MAX_ENV_FILE_SIZE_BYTES) {
        showNotification(
          `.env file is too large (${file.size} bytes). Max is ${MAX_ENV_FILE_SIZE_BYTES} bytes.`,
          "is-warning"
        );
        deployEnvUpload.value = "";
        return;
      }

      try {
        const text = await file.text();
        deployEnvText.value = text;
      } catch {
        showNotification("Failed to read selected .env file", "is-danger");
      } finally {
        deployEnvUpload.value = "";
      }
    });
  }

  if (editForm) {
    editForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = getEl("edit-name") as HTMLInputElement | null;
      const repoInput = getEl("edit-repo-url") as HTMLInputElement | null;
      const branchInput = getEl("edit-branch") as HTMLInputElement | null;
      const name = nameInput?.value.trim() ?? "";
      const repoUrl = repoInput?.value.trim() ?? "";
      const branch = branchInput?.value.trim() ?? "";
      if (!name && !repoUrl && !branch) {
        showNotification("Please provide at least one field to update", "is-warning");
        return;
      }
      const body: { name?: string; repoUrl?: string; branch?: string } = {};
      if (name) body.name = name;
      if (repoUrl) body.repoUrl = repoUrl;
      if (branch) body.branch = branch;
      try {
        const response = await fetch("/projects/" + projectId, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to update project");
        }
        showNotification("Project updated!", "is-success");
        setTimeout(() => window.location.reload(), 500);
      } catch (err) {
        showNotification(err instanceof Error ? err.message : "Failed to update project", "is-danger");
      }
    });
  }

  if (deployBtn) {
    deployBtn.addEventListener("click", async () => {
      (deployBtn as HTMLButtonElement).classList.add("is-loading");
      try {
        const envFile = deployEnvText?.value ?? "";
        if (envFile && new Blob([envFile]).size > MAX_ENV_FILE_SIZE_BYTES) {
          showNotification(
            `.env file is too large. Max is ${MAX_ENV_FILE_SIZE_BYTES} bytes.`,
            "is-warning"
          );
          return;
        }

        const payload: { envFile?: string } = {};
        if (envFile.trim()) {
          payload.envFile = envFile;
        }

        const response = await fetch("/projects/" + projectId + "/deployments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = (await response.json()) as { id?: string; error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to create deployment");
        }
        showNotification("Deployment started!", "is-success");
        setTimeout(() => {
          window.location.href = "/deployments/" + (data.id ?? "");
        }, 500);
      } catch (err) {
        showNotification(
          err instanceof Error ? err.message : "Failed to create deployment",
          "is-danger"
        );
      } finally {
        (deployBtn as HTMLButtonElement).classList.remove("is-loading");
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener("click", async () => {
      if (
        !confirm("Are you sure you want to delete this project? This action cannot be undone.")
      ) {
        return;
      }
      (deleteBtn as HTMLButtonElement).classList.add("is-loading");
      try {
        const response = await fetch("/projects/" + projectId, { method: "DELETE" });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) {
          throw new Error(data.error ?? "Failed to delete project");
        }
        showNotification("Project deleted", "is-success");
        setTimeout(() => {
          window.location.href = "/projects";
        }, 500);
      } catch (err) {
        showNotification(
          err instanceof Error ? err.message : "Failed to delete project",
          "is-danger"
        );
      } finally {
        (deleteBtn as HTMLButtonElement).classList.remove("is-loading");
      }
    });
  }
});
