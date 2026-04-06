import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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

const fetchExamples = async (loadFailedMessage: string): Promise<AdminExampleRow[]> => {
  const response = await fetch("/api/admin/examples", { headers: { Accept: "application/json" } });
  const data = (await response.json().catch(() => ({}))) as ExamplesResponse;
  if (!response.ok) {
    throw new Error(data.error ?? loadFailedMessage);
  }
  return Array.isArray(data.examples) ? data.examples : [];
};

const deploymentRowStatusLabel = (status: string, t: (key: string) => string): string => {
  if (status === "idle" || status === "queued" || status === "building" || status === "success" || status === "failed") {
    return t(`admin.rowStatus.${status}`);
  }
  return status;
};

export const AdminExamplesPageClient = ({
  initialExamples,
  initialBuildSettings
}: {
  initialExamples: AdminExampleRow[];
  initialBuildSettings: AdminBuildSettings;
}): React.ReactElement => {
  const { t } = useTranslation();
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
        const rows = await fetchExamples(t("admin.loadExamplesFailed"));
        applyExamplesIfChanged(rows);
        if (showToast) notify(t("admin.exampleStatusesUpdated"), "success");
      } catch (err) {
        notify(err instanceof Error ? err.message : t("admin.loadExamplesFailed"), "error");
      } finally {
        refreshingRef.current = false;
        setRefreshing(false);
      }
    },
    [applyExamplesIfChanged, t]
  );

  React.useEffect(() => {
    const id = window.setInterval(() => {
      void (async () => {
        try {
          const rows = await fetchExamples(t("admin.loadExamplesFailed"));
          applyExamplesIfChanged(rows);
        } catch {
          /* keep last good state */
        }
      })();
    }, 4000);
    return () => window.clearInterval(id);
  }, [applyExamplesIfChanged, t]);

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
        throw new Error(data.error ?? t("admin.saveSettingsFailed"));
      }
      notify(t("admin.buildSettingsSaved"), "success");
      if (data.memory !== undefined) setMemory(data.memory);
      if (data.cpus !== undefined) setCpus(data.cpus);
      if (data.accountMaxConcurrent !== undefined) {
        setAccountMaxConcurrent(String(data.accountMaxConcurrent));
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t("admin.saveSettingsFailed"), "error");
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
        throw new Error(data.error ?? t("admin.deployStartFailed"));
      }
      notify(t("admin.deployStarted", { name: exampleName }), "success");
      try {
        const rows = await fetchExamples(t("admin.loadExamplesFailed"));
        applyExamplesIfChanged(rows);
      } catch {
        /* ignore */
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : t("admin.deployStartFailed"), "error");
    } finally {
      setDeployingName(null);
    }
  };

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("admin.title")}</h1>
        <Button
          type="button"
          variant="outline"
          disabled={refreshing}
          className={refreshing ? "pointer-events-none opacity-50" : undefined}
          aria-busy={refreshing ? true : undefined}
          onClick={() => void refreshRows(true)}
        >
          {t("admin.refresh")}
        </Button>
      </div>

      <p className="mb-6 text-sm text-muted-foreground">{t("admin.intro")}</p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("admin.buildSettings")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{t("admin.buildSettingsHint")}</p>
          <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => void handleSaveBuildSettings(e)}>
            <div className="space-y-1.5">
              <Label htmlFor="build-memory" className="text-xs">
                {t("admin.memory")}
              </Label>
              <Input
                id="build-memory"
                type="text"
                value={memory}
                onChange={(e) => setMemory(e.target.value)}
                placeholder="1g"
                aria-label={t("admin.memoryAria")}
                className="w-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="build-cpus" className="text-xs">
                {t("admin.cpus")}
              </Label>
              <Input
                id="build-cpus"
                type="text"
                value={cpus}
                onChange={(e) => setCpus(e.target.value)}
                placeholder="0.5"
                aria-label={t("admin.cpusAria")}
                className="w-24"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="build-account-max-concurrent" className="text-xs">
                {t("admin.maxConcurrent")}
              </Label>
              <Input
                id="build-account-max-concurrent"
                type="number"
                min={0}
                max={100}
                value={accountMaxConcurrent}
                onChange={(e) => setAccountMaxConcurrent(e.target.value)}
                placeholder="1"
                aria-label={t("admin.maxConcurrentAria")}
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
              {t("common.save")}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.tableExample")}</TableHead>
              <TableHead>{t("admin.tableLatestDeploy")}</TableHead>
              <TableHead>{t("admin.tableStatus")}</TableHead>
              <TableHead>{t("admin.tableCreated")}</TableHead>
              <TableHead>{t("admin.tableActions")}</TableHead>
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
                      <Link
                        to={`/deployments/${deployment.id}`}
                        className="font-mono text-sm no-underline hover:underline"
                      >
                        {deployment.shortId}
                      </Link>
                    ) : (
                      <span className="text-sm text-muted-foreground">{t("admin.noDeployments")}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(deployment?.status)}>
                      {deploymentRowStatusLabel(deployment?.status ?? "idle", t)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {deployment ? new Date(deployment.createdAt).toLocaleString() : t("common.emDash")}
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
                        {t("admin.buildDeploy")}
                      </Button>
                      {deployment ? (
                        <Button variant="outline" size="sm" asChild>
                          <Link to={`/deployments/${deployment.id}`}>{t("common.logs")}</Link>
                        </Button>
                      ) : null}
                      {deployment?.status === "success" && deployment.previewUrl ? (
                        <Button variant="outline" size="sm" asChild>
                          <a href={deployment.previewUrl} target="_blank" rel="noopener noreferrer">
                            {t("common.preview")}
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
