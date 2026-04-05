import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchWithCsrf } from "./fetchWithCsrf";
import { showPageToast } from "./pageNotifications";

export type AdminExampleDeployment = {
  id: string;
  shortId: string;
  status: "queued" | "building" | "success" | "failed";
  createdAt: string;
  finishedAt: string | null;
  previewUrl: string | null;
};

export type AdminExampleRow = {
  name: string;
  projectId: string | null;
  latestDeployment: AdminExampleDeployment | null;
};

export type AdminBuildSettings = {
  memory: string;
  cpus: string;
  accountMaxConcurrent: number;
};

type ExamplesResponse = {
  examples: AdminExampleRow[];
  error?: string;
};

const statusVariant = (status?: string): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case "success":
      return "default";
    case "failed":
      return "destructive";
    case "building":
      return "outline";
    case "queued":
      return "secondary";
    default:
      return "secondary";
  }
};

const notify = (message: string, variant: "success" | "error"): void => {
  const el = document.getElementById("notification");
  if (!el) return;
  showPageToast(el, message, variant);
};

const fetchExamples = async (): Promise<AdminExampleRow[]> => {
  const response = await fetch("/api/admin/examples", { headers: { Accept: "application/json" } });
  const data = (await response.json().catch(() => ({}))) as ExamplesResponse;
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load examples");
  }
  return Array.isArray(data.examples) ? data.examples : [];
};

export const AdminExamplesPageClient = ({
  initialExamples,
  initialBuildSettings
}: {
  initialExamples: AdminExampleRow[];
  initialBuildSettings: AdminBuildSettings;
}): React.ReactElement => {
  const [examples, setExamples] = React.useState(initialExamples);
  const [memory, setMemory] = React.useState(initialBuildSettings.memory);
  const [cpus, setCpus] = React.useState(initialBuildSettings.cpus);
  const [accountMaxConcurrent, setAccountMaxConcurrent] = React.useState(
    String(initialBuildSettings.accountMaxConcurrent)
  );
  const [refreshing, setRefreshing] = React.useState(false);
  const refreshingRef = React.useRef(false);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [deployingName, setDeployingName] = React.useState<string | null>(null);

  const lastExamplesJson = React.useRef(JSON.stringify(initialExamples));

  const applyExamplesIfChanged = React.useCallback((rows: AdminExampleRow[]) => {
    const next = JSON.stringify(rows);
    if (next === lastExamplesJson.current) return;
    lastExamplesJson.current = next;
    setExamples(rows);
  }, []);

  const refreshRows = React.useCallback(
    async (showToast: boolean) => {
      if (refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      try {
        const rows = await fetchExamples();
        applyExamplesIfChanged(rows);
        if (showToast) notify("Example statuses updated", "success");
      } catch (err) {
        notify(err instanceof Error ? err.message : "Failed to load examples", "error");
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    },
    [applyExamplesIfChanged]
  );

  React.useEffect(() => {
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const rows = await fetchExamples();
          applyExamplesIfChanged(rows);
        } catch {
          /* keep last good state */
        }
      })();
    }, 4000);
    return () => window.clearInterval(id);
  }, [applyExamplesIfChanged]);

  const handleSaveBuildSettings = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const accountRaw = accountMaxConcurrent.trim();
      const accountParsed = accountRaw ? parseInt(accountRaw, 10) : undefined;
      const payload: { memory?: string; cpus?: string; accountMaxConcurrent?: number } = {};
      const mem = memory.trim();
      const cp = cpus.trim();
      if (mem) payload.memory = mem;
      if (cp) payload.cpus = cp;
      if (accountParsed !== undefined && !Number.isNaN(accountParsed)) {
        payload.accountMaxConcurrent = Math.max(0, Math.min(100, accountParsed));
      }
      const response = await fetchWithCsrf("/api/admin/build-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json().catch(() => ({}))) as {
        memory?: string;
        cpus?: string;
        accountMaxConcurrent?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to save build settings");
      }
      notify("Build settings saved", "success");
      if (data.memory !== undefined) setMemory(data.memory);
      if (data.cpus !== undefined) setCpus(data.cpus);
      if (data.accountMaxConcurrent !== undefined) {
        setAccountMaxConcurrent(String(data.accountMaxConcurrent));
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to save build settings", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleDeploy = async (exampleName: string): Promise<void> => {
    if (deployingName) return;
    setDeployingName(exampleName);
    try {
      const response = await fetchWithCsrf(`/api/admin/examples/${encodeURIComponent(exampleName)}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to start deployment");
      }
      notify(`Started deployment for ${exampleName}`, "success");
      try {
        const rows = await fetchExamples();
        applyExamplesIfChanged(rows);
      } catch {
        /* ignore */
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to start deployment", "error");
    } finally {
      setDeployingName(null);
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin Test Workflow</h1>
        <Button
          type="button"
          variant="outline"
          disabled={refreshing}
          className={refreshing ? "pointer-events-none opacity-50" : undefined}
          aria-busy={refreshing ? true : undefined}
          onClick={() => void refreshRows(true)}
        >
          Refresh
        </Button>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">
        Run build and deploy for local examples in one click. Open deployment details for logs, or visit preview when
        ready.
      </p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Build settings</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Container limits (memory, CPUs) and per-account concurrent build limit.
          </p>
          <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => void handleSaveBuildSettings(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="build-memory" className="text-xs">
                Memory
              </Label>
              <Input
                id="build-memory"
                type="text"
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                placeholder="1g"
                aria-label="Build container memory limit"
                className="w-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="build-cpus" className="text-xs">
                CPUs
              </Label>
              <Input
                id="build-cpus"
                type="text"
                value={cpus}
                onChange={(e) => setCpus(e.target.value)}
                placeholder="0.5"
                aria-label="Build container CPU limit"
                className="w-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="build-account-max-concurrent" className="text-xs">
                Max concurrent builds per account
              </Label>
              <Input
                id="build-account-max-concurrent"
                type="number"
                min={0}
                max={100}
                value={accountMaxConcurrent}
                onChange={(e) => setAccountMaxConcurrent(e.target.value)}
                placeholder="1"
                aria-label="Max concurrent builds per account"
                className="w-24"
              />
            </div>
            <Button
              type="submit"
              variant="outline"
              disabled={savingSettings}
              className={savingSettings ? "pointer-events-none opacity-50" : undefined}
              aria-busy={savingSettings ? true : undefined}
            >
              Save
            </Button>
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
          <TableBody>
            {examples.map((example) => {
              const deployment = example.latestDeployment;
              const busy = deployingName === example.name;
              return (
                <TableRow key={example.name}>
                  <TableCell>
                    <code className="font-mono text-sm">{example.name}</code>
                  </TableCell>
                  <TableCell>
                    {deployment ? (
                      <a
                        href={`/deployments/${deployment.id}`}
                        className="font-mono text-sm no-underline hover:underline"
                      >
                        {deployment.shortId}
                      </a>
                    ) : (
                      <span className="text-sm text-muted-foreground">No deployments</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(deployment?.status)}>{deployment?.status ?? "idle"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {deployment ? new Date(deployment.createdAt).toLocaleString() : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={busy}
                        className={busy ? "pointer-events-none opacity-50" : undefined}
                        aria-busy={busy ? true : undefined}
                        onClick={() => void handleDeploy(example.name)}
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
    </>
  );
};
