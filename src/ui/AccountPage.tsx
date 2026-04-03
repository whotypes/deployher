import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

export type AccountPageData = {
  pathname: string;
  user: LayoutUser;
  linkedAccounts: { providerId: string }[];
  hasRepoAccess: boolean;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
};

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub"
};

const providerLabel = (providerId: string): string => {
  const known = PROVIDER_LABELS[providerId.toLowerCase()];
  if (known) return known;
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
};

const AccountPage = ({ data }: { data: AccountPageData }) => (
  <Layout
    title="Account · pdploy"
    pathname={data.pathname}
    user={data.user}
    scriptSrc="/assets/account-page.js"
    breadcrumbs={[{ label: "Account" }]}
    csrfToken={data.csrfToken}
    sidebarProjects={data.sidebarProjects}
  >
    <script
      type="application/json"
      id="account-page-bootstrap"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({ hasRepoAccess: data.hasRepoAccess })
      }}
    />
    <h1 className="text-2xl font-semibold mb-6">Account</h1>

    <div className="max-w-xl space-y-4">
      <Card className="border-border/80 bg-muted/15">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Where settings live</CardTitle>
          <CardDescription>
            User, project, and deployment options are split so each surface stays focused.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            <span className="font-medium text-foreground">You (this browser)</span>
            {" — "}
            <a href="#display" className="text-primary underline-offset-4 hover:underline">
              Display & layout
            </a>
            {", "}
            <a href="#workspace-preferences" className="text-primary underline-offset-4 hover:underline">
              New project defaults
            </a>
            .
          </p>
          <p>
            <span className="font-medium text-foreground">Project</span>
            {" — "}
            <a href="/projects" className="text-primary underline-offset-4 hover:underline">
              Open a project
            </a>
            {" and use Settings for repo, branch, env vars, and delete."}
          </p>
          <p>
            <span className="font-medium text-foreground">Deployment</span>
            {
              " — open any deployment for logs and preview; append "
            }
            <code className="rounded bg-muted px-1 py-px text-xs text-foreground">#deployment-settings</code>
            {" to jump to the project-settings hint. Repo-wide options stay on the project."}
          </p>
        </CardContent>
      </Card>

      <Card id="display" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Display & layout</CardTitle>
          <CardDescription>Stored in this browser only. Same controls as the header menu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-2">
            <p className="eyebrow-label">Content width</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Content width">
              <button
                type="button"
                data-layout-pref="contentWidth"
                data-value="contained"
                className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
              >
                Focused
              </button>
              <button
                type="button"
                data-layout-pref="contentWidth"
                data-value="wide"
                className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
              >
                Wide
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="eyebrow-label">Density</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Density">
              <button
                type="button"
                data-layout-pref="density"
                data-value="comfortable"
                className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
              >
                Comfortable
              </button>
              <button
                type="button"
                data-layout-pref="density"
                data-value="compact"
                className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
              >
                Compact
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <p className="eyebrow-label">Ambient surface</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label="Ambient surface">
              <button
                type="button"
                data-layout-pref="ambient"
                data-value="rich"
                className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
              >
                Alive
              </button>
              <button
                type="button"
                data-layout-pref="ambient"
                data-value="muted"
                className="prefs-choice rounded-md border px-3 py-2 text-sm transition-colors"
              >
                Muted
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
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
            {data.user.name ? (
              <p className="text-sm text-muted-foreground">{data.user.email}</p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Linked accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {data.linkedAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No linked accounts.</p>
          ) : (
            <ul className="space-y-1">
              {data.linkedAccounts.map((acc) => (
                <li key={acc.providerId} className="text-sm">{providerLabel(acc.providerId)}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card id="workspace-preferences" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="text-base">Workspace preferences</CardTitle>
          <CardDescription>Stored in this browser only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="pref-open-after-create" className="text-sm font-normal leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Open project after create
            </label>
            <input
              id="pref-open-after-create"
              type="checkbox"
              className="size-4 shrink-0 rounded border border-input bg-background text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Open project after create"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="pref-preferred-branch" className="text-sm font-medium leading-none">
              Preferred branch for new projects
            </label>
            <Input
              id="pref-preferred-branch"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="main"
              aria-label="Preferred branch for new projects"
            />
            <p className="text-xs text-muted-foreground">When you import from GitHub, this branch is selected if it exists.</p>
          </div>
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Default “new project” tab</legend>
            <p className="text-xs text-muted-foreground">Which tab opens first in the new project dialog.</p>
            <div className="flex flex-col gap-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                <input
                  id="pref-create-mode-import"
                  type="radio"
                  name="pdploy-default-create-mode"
                  value="import"
                  className="size-4 shrink-0 border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                Import from GitHub
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                <input
                  id="pref-create-mode-manual"
                  type="radio"
                  name="pdploy-default-create-mode"
                  value="manual"
                  className="size-4 shrink-0 border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                Manual URL
              </label>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Permanently delete your account and all associated data.
          </p>
          <Separator />
          <form id="delete-account-form" method="post" action="/account/delete">
            <input type="hidden" name="_csrf" value={data.csrfToken} />
            <Button type="submit" variant="destructive" aria-label="Delete account permanently">
              Delete account
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </Layout>
);

export const renderAccountPage = (data: AccountPageData) =>
  renderToReadableStream(<AccountPage data={data} />);
