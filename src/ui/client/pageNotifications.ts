export type PageToastVariant = "success" | "error" | "warning";

export const PAGE_TOAST_HIDDEN_CLASS =
  "hidden fixed top-17 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg";

const PAGE_TOAST_VISIBLE_BASE =
  "fixed top-17 right-4 z-50 rounded-md border px-4 py-3 text-sm font-medium shadow-lg";

const PAGE_TOAST_TONE: Record<PageToastVariant, string> = {
  success: "border-border bg-primary text-primary-foreground",
  error: "border-border bg-destructive text-destructive-foreground",
  warning: "border-border bg-secondary text-secondary-foreground"
};

export const showPageToast = (
  el: HTMLElement,
  message: string,
  variant: PageToastVariant,
  durationMs = 3000
): void => {
  el.textContent = message;
  el.className = `${PAGE_TOAST_VISIBLE_BASE} ${PAGE_TOAST_TONE[variant]}`;
  window.setTimeout(() => {
    el.textContent = "";
    el.className = PAGE_TOAST_HIDDEN_CLASS;
  }, durationMs);
};

export const setNativeButtonLoading = (btn: HTMLButtonElement, loading: boolean): void => {
  if (loading) {
    btn.classList.add("pointer-events-none", "opacity-50");
    btn.setAttribute("aria-busy", "true");
  } else {
    btn.classList.remove("pointer-events-none", "opacity-50");
    btn.removeAttribute("aria-busy");
  }
};
