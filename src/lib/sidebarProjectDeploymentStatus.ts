import type { SidebarProjectDeploymentStatus } from "@/ui/layoutUser";

export const parseSidebarProjectDeploymentStatus = (
  raw: string | null | undefined
): SidebarProjectDeploymentStatus | null => {
  if (raw === "queued" || raw === "building" || raw === "success" || raw === "failed") {
    return raw;
  }
  return null;
};
