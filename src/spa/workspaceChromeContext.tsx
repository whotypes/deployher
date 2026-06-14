import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import type { BreadcrumbItem } from "@/ui/AppShell";
import type { SidebarContextProject, SidebarFeaturedDeployment } from "@/ui/layoutUser";

export type WorkspaceChromeState = {
  title: string;
  breadcrumbs: BreadcrumbItem[];
  sidebarContext?: {
    project?: SidebarContextProject | null;
    deployment?: SidebarFeaturedDeployment | null;
  };
};

export const defaultWorkspaceChrome: WorkspaceChromeState = {
  title: "",
  breadcrumbs: [],
  sidebarContext: undefined
};

type WorkspaceChromeSetter = (next: WorkspaceChromeState) => void;

const WorkspaceChromeContext = createContext<WorkspaceChromeSetter | null>(null);

export const WorkspaceChromeProvider = ({
  value,
  children
}: {
  value: WorkspaceChromeSetter;
  children: ReactNode;
}) => <WorkspaceChromeContext.Provider value={value}>{children}</WorkspaceChromeContext.Provider>;

export const useWorkspaceChrome = (chrome: WorkspaceChromeState) => {
  const setChrome = useContext(WorkspaceChromeContext);
  const breadcrumbsKey = chrome.breadcrumbs.map((b) => `${b.label}\0${b.href ?? ""}`).join("\x1f");
  useLayoutEffect(() => {
    if (!setChrome) {
      throw new Error("useWorkspaceChrome must be used within WorkspaceLayout");
    }
    setChrome(chrome);
  }, [
    setChrome,
    chrome.title,
    breadcrumbsKey,
    chrome.sidebarContext?.project?.id,
    chrome.sidebarContext?.project?.name,
    chrome.sidebarContext?.project?.siteIconUrl,
    chrome.sidebarContext?.project?.previewUrl,
    chrome.sidebarContext?.deployment?.id,
    chrome.sidebarContext?.deployment?.shortId,
    chrome.sidebarContext?.deployment?.status,
    chrome.sidebarContext?.deployment?.sidebarRole
  ]);
};
