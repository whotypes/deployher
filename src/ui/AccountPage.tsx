import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { LayoutUser, SidebarProjectSummary } from "@/ui/layoutUser";
import { AppShell } from "./AppShell";
import { AccountDeleteSection, AccountWorkspacePreferences } from "./client/AccountPageClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type AccountPageData = {
  pathname: string;
  user: LayoutUser;
  linkedAccounts: { providerId: string }[];
  hasRepoAccess: boolean;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
};

const providerLabel = (providerId: string, t: (key: string) => string): string => {
  if (providerId.toLowerCase() === "github") return t("common.github");
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
};

export const AccountPage = ({ data }: { data: AccountPageData }) => {
  const { t } = useTranslation();
  return (
    <AppShell
      title={t("meta.titleWithApp", { page: t("account.pageTitle"), appName: t("common.appName") })}
      pathname={data.pathname}
      user={data.user}
      breadcrumbs={[{ label: t("account.pageTitle") }]}
      sidebarProjects={data.sidebarProjects}
    >
      <div className="mb-8">
        <p className="eyebrow-label mb-2">{t("account.eyebrow")}</p>
        <h1 className="font-serif text-3xl font-semibold tracking-tight md:text-4xl">{t("account.heading")}</h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">{t("account.intro")}</p>
      </div>

      <div className="max-w-xl space-y-4">
        <Card className="border-border/80 bg-muted/15">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("account.whereSettingsTitle")}</CardTitle>
            <CardDescription>{t("account.whereSettingsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">{t("account.youBrowser")}</span>
              {" — "}
              <a href="#display" className="text-primary underline-offset-4 hover:underline">
                {t("account.displayLayout")}
              </a>
              {t("account.youBrowserComma")}
              <a href="#workspace-preferences" className="text-primary underline-offset-4 hover:underline">
                {t("account.newProjectDefaults")}
              </a>
              .
            </p>
            <p>
              <span className="font-medium text-foreground">{t("account.projectLabel")}</span>
              {" — "}
              <Link to="/projects" className="text-primary underline-offset-4 hover:underline">
                {t("account.openProject")}
              </Link>
              {t("account.projectSettingsHint")}
            </p>
            <p>
              <span className="font-medium text-foreground">{t("account.deploymentLabel")}</span>
              {t("account.deploymentHint")}
              <code className="rounded bg-muted px-1 py-px text-xs text-foreground">#build-logs</code>
              {t("account.deploymentHint2")}
            </p>
          </CardContent>
        </Card>

        <Card id="display" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="text-base">{t("account.displayCardTitle")}</CardTitle>
            <CardDescription>{t("account.displayCardDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-col gap-2">
              <p className="eyebrow-label">{t("account.contentWidth")}</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("account.contentWidth")}>
                <button
                  type="button"
                  data-layout-pref="contentWidth"
                  data-value="contained"
                  className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
                >
                  {t("layoutPrefs.focused")}
                </button>
                <button
                  type="button"
                  data-layout-pref="contentWidth"
                  data-value="wide"
                  className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
                >
                  {t("layoutPrefs.wide")}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="eyebrow-label">{t("account.density")}</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("account.density")}>
                <button
                  type="button"
                  data-layout-pref="density"
                  data-value="comfortable"
                  className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
                >
                  {t("layoutPrefs.comfortable")}
                </button>
                <button
                  type="button"
                  data-layout-pref="density"
                  data-value="compact"
                  className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
                >
                  {t("layoutPrefs.compact")}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <p className="eyebrow-label">{t("account.ambientSurface")}</p>
              <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("account.ambientSurface")}>
                <button
                  type="button"
                  data-layout-pref="ambient"
                  data-value="rich"
                  className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
                >
                  {t("layoutPrefs.alive")}
                </button>
                <button
                  type="button"
                  data-layout-pref="ambient"
                  data-value="muted"
                  className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
                >
                  {t("layoutPrefs.muted")}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("account.profile")}</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            {data.user.image ? (
              <img
                src={data.user.image}
                alt=""
                width={64}
                height={64}
                className="rounded-lg flex-shrink-0"
              />
            ) : null}
            <div>
              <p className="font-semibold">{data.user.name ?? data.user.email}</p>
              {data.user.name ? <p className="text-sm text-muted-foreground">{data.user.email}</p> : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("account.linkedAccounts")}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.linkedAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("account.noLinkedAccounts")}</p>
            ) : (
              <ul className="space-y-1">
                {data.linkedAccounts.map((acc) => (
                  <li key={acc.providerId} className="text-sm">
                    {providerLabel(acc.providerId, t)}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card id="workspace-preferences" className="scroll-mt-24">
          <CardHeader>
            <CardTitle className="text-base">{t("account.workspacePreferences")}</CardTitle>
            <CardDescription>{t("account.workspacePrefsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AccountWorkspacePreferences hasRepoAccess={data.hasRepoAccess} />
          </CardContent>
        </Card>

        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-base text-destructive">{t("account.dangerZone")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AccountDeleteSection />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
};
