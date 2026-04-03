import type { SidebarFeaturedDeployment } from "@/ui/layoutUser";

export const pickFeaturedDeploymentFromSortedDesc = (
  rows: Array<{ id: string; shortId: string; status: string }>
): SidebarFeaturedDeployment | null => {
  if (rows.length === 0) return null;

  const success = rows.find((r) => r.status === "success");
  if (success) {
    return {
      id: success.id,
      shortId: success.shortId,
      status: "success",
      sidebarRole: "live"
    };
  }

  const failed = rows.find((r) => r.status === "failed");
  if (failed) {
    return {
      id: failed.id,
      shortId: failed.shortId,
      status: "failed",
      sidebarRole: "failed"
    };
  }

  const latest = rows[0];
  if (!latest) {
    return null;
  }
  if (latest.status === "queued" || latest.status === "building") {
    return {
      id: latest.id,
      shortId: latest.shortId,
      status: latest.status,
      sidebarRole: "in_progress"
    };
  }

  return null;
};
