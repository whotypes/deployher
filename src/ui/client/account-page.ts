/**
 * Browser-only script for the Account page. Uses DOM APIs.
 * Do not import in React or server code — loaded via <script src="/assets/account-page.js" type="module">.
 */

const getEl = (id: string): HTMLElement | null => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
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
      const response = await fetch("/account/delete", {
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
