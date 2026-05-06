import type { HealthData } from "../health/HealthPage";
import { json } from "../http/helpers";
import { buildHealthCore } from "../lib/healthCore";

export const getHealthApi = () => {
  const core = buildHealthCore();
  return json(core as Omit<HealthData, "pathname" | "user" | "sidebarProjects">);
};
