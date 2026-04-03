/**
 * Browser-only script for the Project detail page. Uses DOM APIs.
 * Do not import in React or server code — loaded via <script src="/assets/project-detail-page.js" type="module">.
 */

import { fetchWithCsrf } from "./fetchWithCsrf";

const getEl = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

type ApiError = { error?: string };

const parseApiError = async (response: Response, fallback: string): Promise<string> => {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  return body.error ?? fallback;
};

document.addEventListener("DOMContentLoaded", () => {
  const deployBtn = getEl<HTMLButtonElement>("deploy-btn");
  const deploySidebarBtn = getEl<HTMLButtonElement>("deploy-btn-sidebar");
  const notification = getEl<HTMLElement>("notification");
  const projectIdEl = getEl<HTMLInputElement>("project-id");

  if (!notification) return;

  const projectId = projectIdEl?.value ?? "";

  const showNotification = (message: string, type: string): void => {
    notification.textContent = message;
    notification.className = "notification is-toast " + type;
    notification.style.display = "block";
    setTimeout(() => {
      notification.style.display = "none";
    }, 3000);
  };

  const triggerDeploy = async (btn: HTMLButtonElement) => {
    btn.disabled = true;
    try {
      const response = await fetchWithCsrf("/projects/" + projectId + "/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });

      const data = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
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
      btn.disabled = false;
    }
  };

  if (deployBtn) {
    deployBtn.addEventListener("click", () => void triggerDeploy(deployBtn));
  }
  if (deploySidebarBtn) {
    deploySidebarBtn.addEventListener("click", () => void triggerDeploy(deploySidebarBtn));
  }
});
