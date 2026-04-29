import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TerminalAnimationCommandBar,
  TerminalAnimationContainer,
  TerminalAnimationContent,
  TerminalAnimationOutput,
  TerminalAnimationRoot,
  TerminalAnimationTabList,
  TerminalAnimationTabTrigger,
  TerminalAnimationTitleBar,
  TerminalAnimationTrailingPrompt,
  TerminalAnimationWindow,
  type TabContent
} from "@/components/ui/terminal-animation";

export const LandingTerminalDemo = () => {
  const { t } = useTranslation();
  const landingTerminalTabs = useMemo<TabContent[]>(
    () => [
      {
        label: t("terminal.tabSsh"),
        windowTitle: t("terminal.winWorkstation"),
        prompt: "%",
        showTrailingPrompt: false,
        command: "ssh deploy@app.compute.internal",
        lines: [
          { text: "", delay: 110 },
          {
            text: "The authenticity of host 'app.compute.internal (10.0.1.42)' can't be established.",
            color: "text-amber-400/90",
            delay: 380
          },
          {
            text: "ED25519 key fingerprint is SHA256:oN9…y2k.",
            color: "text-muted-foreground",
            delay: 320
          },
          { text: "Are you sure you want to continue connecting (yes/no/[fingerprint])? yes", color: "text-zinc-500", delay: 280 },
          { text: "", delay: 120 },
          {
            text: "Warning: Permanently added 'app.compute.internal' (ED25519) to the list of known hosts.",
            color: "text-zinc-500",
            delay: 300
          },
          {
            text: "Linux app-01 6.8.0-52-generic #53-Ubuntu SMP PREEMPT_DYNAMIC x86_64",
            color: "text-sky-400/90",
            delay: 360
          },
          {
            text: "You are in a restricted shell. Type 'help' for commands.",
            color: "text-muted-foreground",
            delay: 340
          },
          { text: "", delay: 100 },
          {
            text: "Last login: Tue Apr 28 09:14:31 2026 from 203.0.113.88",
            color: "text-zinc-500",
            delay: 400
          }
        ]
      },
      {
        label: t("terminal.tabSetup"),
        windowTitle: t("terminal.winAppServer"),
        prompt: "deploy@app-01:~$",
        command: "mkdir -p ~/apps && cd ~/apps && git clone https://github.com/acme/web.git && cd web && bun install",
        lines: [
          { text: "", delay: 100 },
          {
            text: "Cloning into 'web'…",
            color: "text-sky-400/90",
            delay: 400
          },
          {
            text: "remote: Enumerating objects: 812, done.",
            color: "text-muted-foreground",
            delay: 320
          },
          {
            text: "Receiving objects: 100% (812/812), 1.42 MiB | 4.20 MiB/s, done.",
            color: "text-zinc-500",
            delay: 380
          },
          { text: "", delay: 90 },
          {
            text: "bun install v1.2.4",
            color: "text-violet-300/85",
            delay: 340
          },
          {
            text: "Resolving dependencies",
            color: "text-muted-foreground",
            delay: 280
          },
          {
            text: "Saved lockfile",
            color: "text-zinc-500",
            delay: 260
          },
          {
            text: "+ @types/node@22.0.0",
            color: "text-zinc-500",
            delay: 200
          },
          {
            text: "+ vite@5.4.0",
            color: "text-zinc-500",
            delay: 200
          },
          { text: "", delay: 100 },
          {
            text: "312 packages installed [3.1s]",
            color: "text-emerald-400/90",
            delay: 480
          }
        ]
      },
      {
        label: t("terminal.tabBuild"),
        windowTitle: t("terminal.winProjectShell"),
        prompt: "deploy@app-01:~/apps/web$",
        command: "bun run build",
        lines: [
          { text: "", delay: 100 },
          {
            text: "vite v5.4.0 building for production…",
            color: "text-violet-300/90",
            delay: 420
          },
          { text: "", delay: 90 },
          { text: "transforming…", color: "text-muted-foreground", delay: 260 },
          {
            text: "✓ 128 modules transformed.",
            color: "text-emerald-400/90",
            delay: 340
          },
          { text: "", delay: 80 },
          { text: "dist/index.html                   0.48 kB", color: "text-zinc-400", delay: 120 },
          {
            text: "dist/assets/index-*.js            142.6 kB │ gzip: 45.2 kB",
            color: "text-zinc-400",
            delay: 110
          },
          { text: "", delay: 100 },
          {
            text: "✓ built in 842ms",
            color: "text-emerald-400/90",
            delay: 420
          }
        ]
      },
      {
        label: t("terminal.tabDeploy"),
        windowTitle: t("terminal.winDeployherCli"),
        command: "deployher deploy --prod",
        lines: [
          { text: "", delay: 110 },
          {
            text: "→  resolving project … acme-web",
            color: "text-sky-400/90",
            delay: 320
          },
          {
            text: "→  pulling image registry.internal/acme/web:sha-a1b2c3d",
            color: "text-muted-foreground",
            delay: 400
          },
          {
            text: "→  starting container · cpus 2 · mem 1Gi",
            color: "text-muted-foreground",
            delay: 380
          },
          {
            text: "→  health check GET /health … 200 (142ms)",
            color: "text-zinc-400",
            delay: 420
          },
          {
            text: "✓  container healthy · ready for traffic",
            color: "text-emerald-400/90",
            delay: 400
          },
          { text: "", delay: 100 },
          {
            text: "✓  live · https://app.acme.example",
            color: "text-emerald-400/95",
            delay: 500
          }
        ]
      },
      {
        label: t("terminal.tabLogs"),
        windowTitle: t("terminal.winRuntime"),
        command: "deployher logs --follow",
        lines: [
          { text: "", delay: 90 },
          {
            text: "streaming runtime · deployment rev a1b2c3d",
            color: "text-violet-300/85",
            delay: 380
          },
          { text: "", delay: 70 },
          {
            text: "[bun] Listening on 0.0.0.0:3000",
            color: "text-zinc-400",
            delay: 260
          },
          {
            text: "GET / 200 12ms",
            color: "text-zinc-500",
            delay: 200
          },
          {
            text: "GET /api/session 200 8ms",
            color: "text-zinc-500",
            delay: 190
          },
          {
            text: "GET /assets/app.css 304 2ms",
            color: "text-zinc-500",
            delay: 180
          },
          {
            text: "POST /webhooks/github 202 45ms",
            color: "text-zinc-500",
            delay: 220
          },
          { text: "", delay: 120 },
          {
            text: "… attached (ctrl+c to detach)",
            color: "text-muted-foreground",
            delay: 320
          }
        ]
      },
      {
        label: t("terminal.tabRollback"),
        windowTitle: t("terminal.winRollback"),
        command: "deployher rollback --to d4e5f6a",
        lines: [
          { text: "", delay: 100 },
          {
            text: "→  target revision d4e5f6a (image sha-9910aa)",
            color: "text-sky-400/90",
            delay: 360
          },
          {
            text: "→  draining connections from rev a1b2c3d",
            color: "text-muted-foreground",
            delay: 400
          },
          {
            text: "→  promoting d4e5f6a · health gate passed",
            color: "text-muted-foreground",
            delay: 420
          },
          { text: "", delay: 90 },
          {
            text: "✓  rollback complete · traffic on d4e5f6a",
            color: "text-emerald-400/90",
            delay: 480
          }
        ]
      }
    ],
    [t]
  );

  const [activeTab, setActiveTab] = useState(0);
  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (loopTimeoutRef.current !== undefined) {
        clearTimeout(loopTimeoutRef.current);
      }
    };
  }, []);

  const clearLoopTimeout = useCallback(() => {
    if (loopTimeoutRef.current !== undefined) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = undefined;
    }
  }, []);

  const handleActiveTabChange = useCallback(
    (index: number) => {
      clearLoopTimeout();
      setActiveTab(index);
    },
    [clearLoopTimeout]
  );

  const handleTabAnimationComplete = useCallback(
    (tabIndex: number) => {
      clearLoopTimeout();
      if (tabIndex < landingTerminalTabs.length - 1) {
        setActiveTab(tabIndex + 1);
        return;
      }
      loopTimeoutRef.current = setTimeout(() => {
        loopTimeoutRef.current = undefined;
        setActiveTab(0);
      }, 1000);
    },
    [clearLoopTimeout, landingTerminalTabs.length]
  );

  return (
    <TerminalAnimationRoot
      tabs={landingTerminalTabs}
      activeTab={activeTab}
      onActiveTabChange={handleActiveTabChange}
      onTabAnimationComplete={handleTabAnimationComplete}
      tabAnimationCompleteDwellMs={900}
      hideCursorOnComplete={false}
      className="flex min-h-0 flex-1 flex-col"
    >
      <TerminalAnimationContainer className="flex min-h-0 flex-1 flex-col">
        <TerminalAnimationWindow
          animateOnVisible={false}
          minHeight="min(28rem,48svh)"
          className="flex min-h-0 flex-1 flex-col rounded-xl rounded-b-none border-border/50"
        >
          <TerminalAnimationTitleBar productName={t("terminal.windowTitle")} />
          <TerminalAnimationContent className="min-h-0 flex-1" tabPanel>
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0">
                <TerminalAnimationCommandBar className="text-base sm:text-lg" />
                <TerminalAnimationOutput className="text-base sm:min-h-48 sm:text-lg" />
              </div>
              <div className="shrink-0 pt-1">
                <TerminalAnimationTrailingPrompt className="text-base sm:text-lg" />
              </div>
            </div>
          </TerminalAnimationContent>
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-border/50 bg-background/50 p-4 transition-colors duration-300 hover:bg-background/65">
            <TerminalAnimationTabList className="min-w-0 flex flex-1 flex-wrap gap-2 border-0 bg-transparent p-0">
              {landingTerminalTabs.map((tab, index) => (
                <TerminalAnimationTabTrigger key={`${index}-${tab.label}`} index={index}>
                  {tab.label}
                </TerminalAnimationTabTrigger>
              ))}
            </TerminalAnimationTabList>
          </div>
        </TerminalAnimationWindow>
      </TerminalAnimationContainer>
    </TerminalAnimationRoot>
  );
};
