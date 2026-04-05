import type { SidebarProjectSummary } from "@/ui/layoutUser";

export type ProjectSwitcherInput = {
  pathname: string;
  sidebarProjects?: SidebarProjectSummary[];
  sidebarContext?: {
    project?: { id: string; name: string } | null;
  };
};

const letterFromLabel = (label: string): string => {
  const t = label.trim();
  if (!t) return "?";
  const ch = t[0];
  return ch ? ch.toUpperCase() : "?";
};

export const deriveSelectedProjectId = (input: ProjectSwitcherInput): string | null => {
  const fromCtx = input.sidebarContext?.project?.id;
  if (fromCtx) return fromCtx;
  const m = input.pathname.match(/^\/projects\/([^/]+)/);
  if (m?.[1] && m[1] !== "new") return m[1];
  return null;
};

export const getProjectSwitcherTrigger = (
  input: ProjectSwitcherInput
): { href: string; label: string; letter: string; siteIconUrl: string | null } => {
  const list = input.sidebarProjects ?? [];
  const selectedId = deriveSelectedProjectId(input);
  const proj = selectedId ? list.find((p) => p.id === selectedId) : undefined;
  if (proj) {
    return {
      href: `/projects/${proj.id}`,
      label: proj.name,
      letter: letterFromLabel(proj.name),
      siteIconUrl: proj.siteIconUrl ?? null
    };
  }
  if (input.pathname.startsWith("/projects/new")) {
    return { href: "/projects/new", label: "New project", letter: "N", siteIconUrl: null };
  }
  return { href: "/projects", label: "Projects", letter: "P", siteIconUrl: null };
};
