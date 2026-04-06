export type LayoutUser = {
  name: string | null;
  email: string;
  image: string | null;
  role: "user" | "operator";
};

export type SidebarProjectDeploymentStatus = "queued" | "building" | "success" | "failed";

export type SidebarProjectSummary = {
  id: string;
  name: string;
  deploymentStatus: SidebarProjectDeploymentStatus | null;
  siteIconUrl: string | null;
  siteOgImageUrl: string | null;
  /** Current deployment preview base URL (for `/favicon.ico` when siteIconUrl is unset). */
  previewUrl: string | null;
};

export type SidebarFeaturedDeployment = {
  id: string;
  shortId: string;
  status: "queued" | "building" | "success" | "failed";
  sidebarRole: "live" | "failed" | "in_progress";
};
