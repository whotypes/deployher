import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceChrome } from "@/spa/workspaceChromeContext";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { NewProjectPageClient } from "./client/NewProjectPageClient";

export type NewProjectPageData = {
  pathname: string;
  user?: LayoutUser | null;
  csrfToken?: string;
  sidebarProjects: SidebarProjectSummary[];
  github: {
    linked: boolean;
    hasRepoAccess: boolean;
  };
};

export const NewProjectPage = ({ data }: { data: NewProjectPageData }) => {
  const { t } = useTranslation();
  const chrome = useMemo(
    () => ({
      title: t("meta.titleWithApp", {
        page: t("newProject.pageTitle"),
        appName: t("common.appName")
      }),
      breadcrumbs: [
        { label: t("common.projects"), href: "/projects" },
        { label: t("newProject.breadcrumbNew") }
      ]
    }),
    [t]
  );
  useWorkspaceChrome(chrome);
  return (
    <>
      <div className="mx-auto max-w-6xl px-3 pb-20 sm:px-4 lg:px-0">
        <div className="dashboard-surface relative mb-10 overflow-hidden border-l-[3px] border-l-primary/55 p-6 md:p-8">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/45 via-transparent to-color-mix(in_oklab,var(--chart-2)_28%,transparent)"
            aria-hidden
          />
          <p className="eyebrow-label mb-3">{t("newProject.eyebrow")}</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-pretty md:text-4xl lg:text-[2.75rem] lg:leading-tight">
            {t("newProject.heading")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg md:leading-relaxed">
            {t("newProject.intro")}
          </p>
        </div>

        <div id="new-project-client-root">
          <NewProjectPageClient
            hasRepoAccess={data.github.hasRepoAccess}
            githubLinked={data.github.linked}
          />
        </div>
      </div>
    </>
  );
};
