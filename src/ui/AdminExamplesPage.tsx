import { renderToReadableStream } from "react-dom/server";
import type { LayoutUser, SidebarProjectSummary } from "./Layout";
import { Layout } from "./Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type BuildSettings = {
  memory: string;
  cpus: string;
  accountMaxConcurrent: number;
};

type ExampleDeployment = {
  id: string;
  shortId: string;
  status: "queued" | "building" | "success" | "failed";
  createdAt: string;
  finishedAt: string | null;
  previewUrl: string | null;
};

type ExampleRow = {
  name: string;
  projectId: string | null;
  latestDeployment: ExampleDeployment | null;
};

export type AdminExamplesPageData = {
  pathname: string;
  user?: LayoutUser | null;
  examples: ExampleRow[];
  buildSettings: BuildSettings;
  csrfToken: string;
  sidebarProjects: SidebarProjectSummary[];
};

const statusVariant = (status?: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "success": return "default";
    case "failed": return "destructive";
    case "building": return "outline";
    case "queued": return "secondary";
    default: return "secondary";
  }
};

const AdminExamplesPage = ({ data }: { data: AdminExamplesPageData }) => (
  <Layout
    title="Admin · Example Deployments"
    pathname={data.pathname}
    scriptSrc="/assets/admin-examples-page.js"
    user={data.user ?? null}
    breadcrumbs={[{ label: "Admin" }]}
    csrfToken={data.csrfToken}
    sidebarProjects={data.sidebarProjects}
  >
    <div
      id="notification"
      aria-live="polite"
      className="hidden fixed top-17 right-4 z-50 rounded-md px-4 py-3 text-sm font-medium shadow-lg"
    />

    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-semibold">Admin Test Workflow</h1>
      <Button type="button" id="refresh-admin-examples" variant="outline">Refresh</Button>
    </div>

    <p className="text-sm text-muted-foreground mb-6">
      Run build and deploy for local examples in one click. Open deployment details for logs, or visit preview when ready.
    </p>

    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Build settings</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Container limits (memory, CPUs) and per-account concurrent build limit.
        </p>
        <form id="build-settings-form" className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="build-memory" className="text-xs">Memory</Label>
            <Input
              id="build-memory"
              type="text"
              name="memory"
              defaultValue={data.buildSettings.memory}
              placeholder="1g"
              aria-label="Build container memory limit"
              className="w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="build-cpus" className="text-xs">CPUs</Label>
            <Input
              id="build-cpus"
              type="text"
              name="cpus"
              defaultValue={data.buildSettings.cpus}
              placeholder="0.5"
              aria-label="Build container CPU limit"
              className="w-24"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="build-account-max-concurrent" className="text-xs">Max concurrent builds per account</Label>
            <Input
              id="build-account-max-concurrent"
              type="number"
              name="accountMaxConcurrent"
              min={0}
              max={100}
              defaultValue={data.buildSettings.accountMaxConcurrent}
              placeholder="1"
              aria-label="Max concurrent builds per account"
              className="w-24"
            />
          </div>
          <Button type="submit" id="save-build-settings" variant="outline">Save</Button>
        </form>
      </CardContent>
    </Card>

    <Card>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Example</TableHead>
            <TableHead>Latest Deploy</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody id="admin-examples-tbody">
          {data.examples.map((example) => {
            const deployment = example.latestDeployment;
            return (
              <TableRow key={example.name} data-example-name={example.name}>
                <TableCell>
                  <code className="font-mono text-sm">{example.name}</code>
                </TableCell>
                <TableCell data-field="deployment">
                  {deployment ? (
                    <a href={`/deployments/${deployment.id}`} className="font-mono text-sm no-underline hover:underline">
                      {deployment.shortId}
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">No deployments</span>
                  )}
                </TableCell>
                <TableCell data-field="status">
                  <Badge variant={statusVariant(deployment?.status)}>
                    {deployment?.status ?? "idle"}
                  </Badge>
                </TableCell>
                <TableCell data-field="createdAt" className="text-muted-foreground text-sm">
                  {deployment ? new Date(deployment.createdAt).toLocaleString() : "—"}
                </TableCell>
                <TableCell data-field="actions">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      data-action="deploy"
                      data-example-name={example.name}
                    >
                      Build & Deploy
                    </Button>
                    {deployment ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`/deployments/${deployment.id}`}>Logs</a>
                      </Button>
                    ) : null}
                    {deployment?.status === "success" && deployment.previewUrl ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={deployment.previewUrl} target="_blank" rel="noopener noreferrer">
                          Preview
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Card>
  </Layout>
);

export const renderAdminExamplesPage = (data: AdminExamplesPageData) =>
  renderToReadableStream(<AdminExamplesPage data={data} />);
