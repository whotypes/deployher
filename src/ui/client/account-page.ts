/**
 * Browser-only script for the Account page. Uses DOM APIs.
 * Do not import in React or server code — loaded via <script src="/assets/account-page.js" type="module">.
 */

import {
  readOpenAfterCreate,
  readPreferredBranch,
  readProjectsCreateModeInitial,
  writeCreateModePref,
  writeOpenAfterCreate,
  writePreferredBranch,
  type CreateModePref
} from "@/lib/userUiPrefs";
import { fetchWithCsrf } from "./fetchWithCsrf";

const getEl = (id: string): HTMLElement | null => document.getElementById(id);

const parseAccountBootstrap = (): { hasRepoAccess: boolean } => {
  const el = document.getElementById("account-page-bootstrap");
  if (!el?.textContent?.trim()) return { hasRepoAccess: false };
  try {
    const raw = JSON.parse(el.textContent) as { hasRepoAccess?: unknown };
    return { hasRepoAccess: Boolean(raw.hasRepoAccess) };
  } catch {
    return { hasRepoAccess: false };
  }
};

const initWorkspacePreferences = (): void => {
  const openEl = getEl("pref-open-after-create") as HTMLInputElement | null;
  const branchEl = getEl("pref-preferred-branch") as HTMLInputElement | null;
  const importEl = getEl("pref-create-mode-import") as HTMLInputElement | null;
  const manualEl = getEl("pref-create-mode-manual") as HTMLInputElement | null;

  if (openEl) {
    openEl.checked = readOpenAfterCreate();
    openEl.addEventListener("change", () => writeOpenAfterCreate(openEl.checked));
  }

  if (branchEl) {
    branchEl.value = readPreferredBranch();
    branchEl.addEventListener("change", () => writePreferredBranch(branchEl.value));
  }

  const { hasRepoAccess } = parseAccountBootstrap();
  const mode = readProjectsCreateModeInitial(hasRepoAccess);
  if (importEl) importEl.checked = mode === "import";
  if (manualEl) manualEl.checked = mode === "manual";

  const radios = document.querySelectorAll<HTMLInputElement>('input[name="pdploy-default-create-mode"]');
  radios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!radio.checked) return;
      const next: CreateModePref = radio.value === "manual" ? "manual" : "import";
      writeCreateModePref(next);
    });
  });
};

document.addEventListener("DOMContentLoaded", () => {
  initWorkspacePreferences();

  const form = getEl("delete-account-form") as HTMLFormElement | null;
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const confirmed = window.confirm(
      "Delete your account and all data permanently? This cannot be undone."
    );
    if (!confirmed) return;

    const submitButton = form.querySelector("button[type='submit']") as HTMLButtonElement | null;
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add("is-loading");
    }

    try {
      const response = await fetchWithCsrf("/account/delete", {
        method: "POST",
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      window.location.href = "/login";
    } catch (err) {
      console.error("Failed to delete account:", err);
      window.alert("Failed to delete account. Please try again.");
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.classList.remove("is-loading");
      }
    }
  });
});
