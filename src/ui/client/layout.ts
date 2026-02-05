/**
 * Browser-only script for global layout (navbar burger, signout). Uses DOM APIs.
 * Do not import in React or server code — loaded via <script src="/assets/layout.js" type="module"> on every page.
 */

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".navbar-burger").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-target");
      const menu = id ? document.getElementById(id) : null;
      el.classList.toggle("is-active");
      el.setAttribute("aria-expanded", String(el.classList.contains("is-active")));
      if (menu) menu.classList.toggle("is-active");
    });
  });

  const signoutForm = document.getElementById("signout-form");
  if (signoutForm) {
    signoutForm.addEventListener("submit", (e) => {
      e.preventDefault();
      fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).then(() => {
        window.location.href = "/login";
      });
    });
  }
});
