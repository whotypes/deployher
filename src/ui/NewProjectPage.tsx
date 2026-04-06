import { useTranslation } from "react-i18next";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { AppShell } from "./AppShell";
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
  return (
    <AppShell
      title={t("meta.titleWithApp", {
        page: t("newProject.pageTitle"),
        appName: t("common.appName")
      })}
      pathname={data.pathname}
      user={data.user ?? null}
      sidebarProjects={data.sidebarProjects}
      breadcrumbs={[
        { label: t("common.projects"), href: "/projects" },
        { label: t("newProject.breadcrumbNew") }
      ]}
    >
      <div
        id="notification"
        aria-live="polite"
        className="fixed top-17 right-4 z-50 hidden rounded-md px-4 py-3 text-sm font-medium shadow-lg"
      />

      <div className="mx-auto max-w-6xl pb-16">
        <div className="dashboard-surface relative mb-8 overflow-hidden border-l-4 border-l-primary/70 p-5 md:p-6">
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-primary/40 via-transparent to-color-mix(in_oklab,var(--chart-2)_30%,transparent)"
            aria-hidden
          />
          <p className="eyebrow-label mb-2">{t("newProject.eyebrow")}</p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">{t("newProject.heading")}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("newProject.intro")}</p>
        </div>

        <div id="new-project-client-root">
          <NewProjectPageClient
            hasRepoAccess={data.github.hasRepoAccess}
            githubLinked={data.github.linked}
          />
        </div>
      </div>
    </AppShell>
  );
};
