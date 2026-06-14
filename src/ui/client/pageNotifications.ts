import { toast } from "sonner";

export type PageToastVariant = "success" | "error" | "warning";

export const showPageToast = (message: string, variant: PageToastVariant): void => {
  switch (variant) {
    case "success":
      toast.success(message);
      break;
    case "error":
      toast.error(message);
      break;
    case "warning":
      toast.warning(message);
      break;
  }
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
