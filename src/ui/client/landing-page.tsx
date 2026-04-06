import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TerminalAnimationCommandBar,
  TerminalAnimationContainer,
  TerminalAnimationContent,
  TerminalAnimationOutput,
  TerminalAnimationRoot,
  TerminalAnimationTabList,
  TerminalAnimationTabTrigger,
  TerminalAnimationTrailingPrompt,
  TerminalAnimationWindow,
  type TabContent
} from "@/components/ui/terminal-animation";

export const LandingTerminalDemo = () => {
  const { t } = useTranslation();
  const landingTerminalTabs = useMemo<TabContent[]>(
    () => [
      {
        label: t("terminal.tabBuild"),
        command: "bun run build",
        lines: [
          { text: "", delay: 120 },
          {
            text: "vite v5.4.0 building for production…",
            color: "text-violet-300/90",
            delay: 450
          },
          { text: "", delay: 100 },
          { text: "transforming…", color: "text-muted-foreground", delay: 280 },
          {
            text: "✓ 128 modules transformed.",
            color: "text-emerald-400/90",
            delay: 350
          },
          { text: "", delay: 80 },
          { text: "dist/index.html                   0.48 kB", color: "text-zinc-400", delay: 120 },
          {
            text: "dist/assets/index-*.js            142.6 kB │ gzip: 45.2 kB",
            color: "text-zinc-400",
            delay: 100
          },
          { text: "", delay: 100 },
          {
            text: "✓ built in 842ms",
            color: "text-emerald-400/90",
            delay: 400
          }
        ]
      },
      {
        label: t("terminal.tabDeploy"),
        command: "deployher deploy --prod",
        lines: [
          { text: "", delay: 120 },
          {
            text: "→  Resolving project… acme-web",
            color: "text-sky-400/90",
            delay: 350
          },
          {
            text: "→  Cloning github.com/acme/web (main)",
            color: "text-muted-foreground",
            delay: 400
          },
          {
            text: "→  Build worker: isolated container · 2 vCPU",
            color: "text-muted-foreground",
            delay: 450
          },
          { text: "", delay: 120 },
          {
            text: "✓  Production live · cname.deployher.example",
            color: "text-emerald-400/90",
            delay: 500
          }
        ]
      },
      {
        label: t("terminal.tabLogs"),
        command: "deployher logs --follow",
        lines: [
          { text: "", delay: 100 },
          {
            text: "streaming runtime · deployment a1b2c3d",
            color: "text-violet-300/85",
            delay: 400
          },
          { text: "", delay: 80 },
          {
            text: "[bun] Listening on 0.0.0.0:3000",
            color: "text-zinc-400",
            delay: 250
          },
          {
            text: "GET / 200 12ms",
            color: "text-zinc-500",
            delay: 200
          },
          {
            text: "GET /assets/app.css 304 2ms",
            color: "text-zinc-500",
            delay: 180
          },
          { text: "", delay: 400 },
          {
            text: "… attached (ctrl+c to detach)",
            color: "text-muted-foreground",
            delay: 300
          }
        ]
      }
    ],
    [t]
  );

  const [activeTab, setActiveTab] = useState(0);
  const [showReset, setShowReset] = useState(false);

  const handleActiveTabChange = useCallback((index: number) => {
    setActiveTab(index);
    setShowReset(false);
  }, []);

  const handleTabAnimationComplete = useCallback(
    (tabIndex: number) => {
      if (tabIndex < landingTerminalTabs.length - 1) {
        setActiveTab(tabIndex + 1);
        return;
      }
      setShowReset(true);
    },
    [landingTerminalTabs.length]
  );

  const handleReset = useCallback(() => {
    setShowReset(false);
    setActiveTab(0);
  }, []);

  return (
    <TerminalAnimationRoot
      tabs={landingTerminalTabs}
      activeTab={activeTab}
      onActiveTabChange={handleActiveTabChange}
      onTabAnimationComplete={handleTabAnimationComplete}
      tabAnimationCompleteDwellMs={900}
      hideCursorOnComplete={false}
    >
      <TerminalAnimationContainer>
        <TerminalAnimationWindow
          animateOnVisible={false}
          minHeight="min(36rem, 58vh)"
          className="rounded-xl rounded-b-none border-border/50"
        >
          <TerminalAnimationContent className="min-h-64">
            <TerminalAnimationCommandBar className="text-base sm:text-lg" />
            <TerminalAnimationOutput className="text-base sm:text-lg" />
            <TerminalAnimationTrailingPrompt className="text-base sm:text-lg" />
          </TerminalAnimationContent>
          <div className="flex flex-wrap items-center gap-3 border-t border-border/50 bg-background/50 p-4">
            <TerminalAnimationTabList className="min-w-0 flex flex-1 flex-wrap gap-2 border-0 bg-transparent p-0">
              {landingTerminalTabs.map((tab, index) => (
                <TerminalAnimationTabTrigger key={tab.label} index={index}>
                  {tab.label}
                </TerminalAnimationTabTrigger>
              ))}
            </TerminalAnimationTabList>
            {showReset ? (
              <button
                type="button"
                onClick={handleReset}
                className="animate-in fade-in zoom-in-95 slide-in-from-right-2 duration-500 shrink-0 rounded-md border border-border/60 bg-background/70 px-2.5 py-1.5 text-xs font-medium text-muted-foreground outline-none transition-colors hover:border-border hover:bg-accent/55 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={t("terminal.resetAria")}
              >
                {t("terminal.reset")}
              </button>
            ) : null}
          </div>
        </TerminalAnimationWindow>
      </TerminalAnimationContainer>
    </TerminalAnimationRoot>
  );
};
