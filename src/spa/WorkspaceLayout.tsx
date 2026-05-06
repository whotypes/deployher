import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation } from "react-router-dom";
import { AppShell } from "@/ui/AppShell";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { fetchJson } from "./api";
import {
  WorkspaceChromeProvider,
  defaultWorkspaceChrome,
  type WorkspaceChromeState
} from "./workspaceChromeContext";

export type WorkspaceShellData = {
  user: LayoutUser;
  sidebarProjects: SidebarProjectSummary[];
};

export const WorkspaceLayout = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const [chrome, setChromeState] = useState<WorkspaceChromeState>(defaultWorkspaceChrome);

  const setChrome = useCallback((next: WorkspaceChromeState) => {
    setChromeState(next);
  }, []);

  const { data: shell } = useQuery({
    queryKey: ["workspace-shell"],
    queryFn: () => fetchJson<WorkspaceShellData>("/api/ui/workspace-shell"),
    staleTime: 30_000
  });

  const displayTitle = chrome.title.trim().length > 0 ? chrome.title : t("common.appName");

  const shellUser = useMemo(() => shell?.user ?? null, [shell?.user]);
  const shellProjects = useMemo(() => shell?.sidebarProjects ?? [], [shell?.sidebarProjects]);

  return (
    <WorkspaceChromeProvider value={setChrome}>
      <AppShell
        title={displayTitle}
        pathname={location.pathname}
        user={shellUser}
        sidebarProjects={shellProjects}
        sidebarContext={chrome.sidebarContext}
        breadcrumbs={chrome.breadcrumbs}
      >
        <Outlet />
      </AppShell>
    </WorkspaceChromeProvider>
  );
};
