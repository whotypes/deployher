"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from "react";
import { Slot } from "@radix-ui/react-slot";

import { cn } from "@/lib/utils";

export interface TerminalLine {
  text: string;
  color?: string;
  delay?: number;
}

export interface TabContent {
  label: string;
  /** Shown in the command line before the typed command (default `$`). */
  prompt?: string;
  /** Main window chrome title; falls back to `TerminalAnimationTitleBar` `productName` when omitted. */
  windowTitle?: string;
  /** When false, no blinking prompt line after output completes (default true). */
  showTrailingPrompt?: boolean;
  command: string;
  lines: TerminalLine[];
}

export type TerminalAnimationRootProps = React.ComponentProps<"div"> & {
  tabs: TabContent[];
  defaultActiveTab?: number;
  activeTab?: number;
  onActiveTabChange?: (index: number) => void;
  /** Fired once after all output lines for `tabIndex` are visible, following `tabAnimationCompleteDwellMs`. */
  onTabAnimationComplete?: (tabIndex: number) => void;
  tabAnimationCompleteDwellMs?: number;
  backgroundImage?: string;
  alwaysDark?: boolean;
  hideCursorOnComplete?: boolean;
};

interface TerminalAnimationContextValue {
  activeTab: number;
  setActiveTab: (index: number) => void;
  commandTyped: string;
  isTypingCommand: boolean;
  showCursor: boolean;
  visibleLines: number;
  currentTab: TabContent;
  tabs: TabContent[];
  idPrefix: string;
}

const TerminalAnimationContext = createContext<TerminalAnimationContextValue | undefined>(undefined);

function useTerminalAnimationContext() {
  const ctx = useContext(TerminalAnimationContext);
  if (!ctx) {
    throw new Error("TerminalAnimation components must be used within TerminalAnimationRoot");
  }
  return ctx;
}

export function TerminalAnimationRoot({
  tabs,
  defaultActiveTab = 0,
  activeTab: activeTabProp,
  onActiveTabChange,
  onTabAnimationComplete,
  tabAnimationCompleteDwellMs = 1100,
  backgroundImage,
  alwaysDark = false,
  hideCursorOnComplete = true,
  className,
  children,
  ...props
}: TerminalAnimationRootProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultActiveTab);
  const isControlled = activeTabProp !== undefined;
  const activeTab = isControlled ? activeTabProp : uncontrolled;

  const setActiveTab = useCallback(
    (index: number) => {
      onActiveTabChange?.(index);
      if (!isControlled) {
        setUncontrolled(index);
      }
    },
    [isControlled, onActiveTabChange]
  );

  const [visibleLines, setVisibleLines] = useState(0);
  const [commandTyped, setCommandTyped] = useState("");
  const [isTypingCommand, setIsTypingCommand] = useState(true);
  const [showCursor, setShowCursor] = useState(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onTabAnimationCompleteRef = useRef(onTabAnimationComplete);
  onTabAnimationCompleteRef.current = onTabAnimationComplete;
  const reactId = useId();
  const idPrefix = `term-${reactId.replace(/:/g, "")}`;

  const clearTimeouts = useCallback(() => {
    for (const t of timeoutRef.current) {
      clearTimeout(t);
    }
    timeoutRef.current = [];
  }, []);

  const animateTab = useCallback(
    (tabIndex: number) => {
      clearTimeouts();
      setVisibleLines(0);
      setCommandTyped("");
      setIsTypingCommand(true);
      setShowCursor(true);

      const tab = tabs[tabIndex];
      if (!tab) {
        return;
      }

      const command = tab.command;
      let charIndex = 0;

      const showLines = (lineIndex: number) => {
        if (lineIndex <= tab.lines.length) {
          setVisibleLines(lineIndex);
          if (lineIndex < tab.lines.length) {
            const delay = tab.lines[lineIndex]?.delay ?? 100;
            const t = setTimeout(() => showLines(lineIndex + 1), delay);
            timeoutRef.current.push(t);
          } else {
            if (hideCursorOnComplete) {
              const t = setTimeout(() => setShowCursor(false), 600);
              timeoutRef.current.push(t);
            }
            const dwell = tabAnimationCompleteDwellMs;
            const completedFor = tabIndex;
            const t = setTimeout(() => {
              onTabAnimationCompleteRef.current?.(completedFor);
            }, dwell);
            timeoutRef.current.push(t);
          }
        }
      };

      const typeCommand = () => {
        if (charIndex <= command.length) {
          setCommandTyped(command.slice(0, charIndex));
          charIndex += 1;
          const t = setTimeout(typeCommand, 25 + Math.random() * 35);
          timeoutRef.current.push(t);
        } else {
          const t = setTimeout(() => {
            setIsTypingCommand(false);
            showLines(0);
          }, 250);
          timeoutRef.current.push(t);
        }
      };

      const t = setTimeout(typeCommand, 300);
      timeoutRef.current.push(t);
    },
    [clearTimeouts, hideCursorOnComplete, tabAnimationCompleteDwellMs, tabs]
  );

  useEffect(() => {
    animateTab(activeTab);
    return clearTimeouts;
  }, [activeTab, animateTab, clearTimeouts]);

  const currentTab = tabs[activeTab] ?? tabs[0];
  if (!currentTab) {
    throw new Error("TerminalAnimationRoot requires at least one tab");
  }
  const safeActiveTab = Math.min(Math.max(activeTab, 0), tabs.length - 1);

  const value: TerminalAnimationContextValue = {
    activeTab: safeActiveTab,
    setActiveTab,
    commandTyped,
    isTypingCommand,
    showCursor,
    visibleLines,
    currentTab,
    tabs,
    idPrefix
  };

  return (
    <TerminalAnimationContext.Provider value={value}>
      <div
        className={cn(alwaysDark && "text-zinc-100", className)}
        data-terminal-theme={alwaysDark ? "dark" : undefined}
        {...props}
      >
        {backgroundImage ? (
          <div
            className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-40"
            style={{ backgroundImage: `url(${backgroundImage})` }}
            aria-hidden
          />
        ) : null}
        {children}
      </div>
    </TerminalAnimationContext.Provider>
  );
}

export type TerminalAnimationBackgroundGradientProps = React.ComponentProps<"div">;

export function TerminalAnimationBackgroundGradient({ className, ...props }: TerminalAnimationBackgroundGradientProps) {
  return (
    <div
      className={cn(
        "absolute inset-0 bg-linear-to-br from-violet-600/40 via-fuchsia-600/30 to-indigo-950",
        className
      )}
      {...props}
    />
  );
}

export type TerminalAnimationContainerProps = React.ComponentProps<"div">;

export function TerminalAnimationContainer({ className, ...props }: TerminalAnimationContainerProps) {
  return <div className={cn("relative w-full", className)} {...props} />;
}

export type TerminalAnimationWindowProps = React.ComponentProps<"div"> & {
  backgroundColor?: string;
  minHeight?: string;
  animateOnVisible?: boolean;
};

export function TerminalAnimationWindow({
  className,
  backgroundColor,
  minHeight = "28rem",
  animateOnVisible = true,
  style,
  ...props
}: TerminalAnimationWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null);
  const [hasAnimated, setHasAnimated] = useState(!animateOnVisible);

  useEffect(() => {
    if (!animateOnVisible || !windowRef.current) {
      return;
    }
    const el = windowRef.current;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setHasAnimated(true);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [animateOnVisible]);

  return (
    <div
      ref={windowRef}
      className={cn(
        "group/terminal relative flex flex-col overflow-hidden rounded-t-xl border border-border/60 bg-card/90 shadow-xl shadow-black/6 backdrop-blur-md transition-[opacity,transform,box-shadow] duration-500 dark:shadow-black/25",
        "hover:border-border/70 hover:shadow-2xl hover:shadow-black/8 dark:hover:shadow-black/35",
        animateOnVisible && !hasAnimated && "translate-y-4 opacity-0",
        animateOnVisible && hasAnimated && "translate-y-0 opacity-100",
        className
      )}
      style={{ minHeight, backgroundColor, ...style }}
      {...props}
    />
  );
}

export type TerminalAnimationTitleBarProps = React.ComponentProps<"div"> & {
  productName?: string;
};

export function TerminalAnimationTitleBar({
  productName = "Terminal",
  className,
  ...props
}: TerminalAnimationTitleBarProps) {
  const { currentTab } = useTerminalAnimationContext();
  const chromeTitle = currentTab.windowTitle ?? productName;
  const chromeKey = `${chromeTitle}-${currentTab.label}`;

  return (
    <div
      className={cn(
        "select-none flex shrink-0 items-center gap-2 border-b border-border/50 bg-linear-to-b from-muted/30 to-transparent px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5",
        className
      )}
      {...props}
    >
      <div className="flex w-11 shrink-0 items-center gap-1 sm:w-[52px] sm:gap-1.5" aria-hidden="true">
        <span className="size-2.5 rounded-full bg-[#ff5f57] ring-1 ring-black/10 transition duration-200 hover:brightness-110 active:scale-90 sm:size-3" />
        <span className="size-2.5 rounded-full bg-[#febc2e] ring-1 ring-black/10 transition duration-200 hover:brightness-110 active:scale-90 sm:size-3" />
        <span className="size-2.5 rounded-full bg-[#28c840] ring-1 ring-black/10 transition duration-200 hover:brightness-110 active:scale-90 sm:size-3" />
      </div>
      <div className="min-w-0 flex-1 text-center">
        <div
          key={chromeKey}
          className="truncate font-mono text-[11px] font-semibold tracking-tight text-foreground/90 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 sm:text-xs"
        >
          {chromeTitle}
        </div>
        <div className="relative h-3.5 overflow-hidden sm:h-4" aria-live="polite">
          <span
            key={currentTab.label}
            className="absolute inset-x-0 top-0 block truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/75 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 sm:text-[11px] sm:tracking-[0.18em]"
          >
            {currentTab.label}
          </span>
        </div>
      </div>
      <div className="w-11 shrink-0 sm:w-[52px]" aria-hidden="true" />
    </div>
  );
}

export type TerminalAnimationContentProps = React.ComponentProps<"div"> & {
  tabPanel?: boolean;
};

export function TerminalAnimationContent({ className, tabPanel = false, children, ...rest }: TerminalAnimationContentProps) {
  const { activeTab, idPrefix } = useTerminalAnimationContext();

  return (
    <div
      className={cn(
        "relative isolate flex flex-1 flex-col overflow-hidden px-5 py-5 sm:px-8 sm:py-7",
        "selection:bg-primary/15",
        className
      )}
      id={tabPanel ? `${idPrefix}-panel` : undefined}
      role={tabPanel ? "tabpanel" : undefined}
      aria-labelledby={tabPanel ? `${idPrefix}-tab-${activeTab}` : undefined}
      {...rest}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-20%,color-mix(in_oklab,var(--chart-2)_12%,transparent),transparent_65%)] opacity-90" />
        <div
          className={cn(
            "absolute inset-0 bg-size-[24px_24px] bg-[linear-gradient(color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--foreground)_4%,transparent)_1px,transparent_1px)] opacity-[0.12] transition-opacity duration-500",
            "group-hover/terminal:opacity-[0.18] motion-reduce:opacity-[0.08]"
          )}
        />
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}

export type TerminalAnimationBlinkingCursorProps = React.ComponentProps<"span">;

export function TerminalAnimationBlinkingCursor({ className, ...props }: TerminalAnimationBlinkingCursorProps) {
  return (
    <span
      className={cn("animate-caret-blink ml-px inline-block w-2 bg-current align-middle", className)}
      {...props}
    />
  );
}

export type TerminalAnimationCommandBarProps = React.ComponentProps<"div"> & {
  cursor?: ReactNode;
};

export function TerminalAnimationCommandBar({ className, cursor, ...props }: TerminalAnimationCommandBarProps) {
  const { commandTyped, isTypingCommand, showCursor, currentTab } = useTerminalAnimationContext();
  const prompt = currentTab.prompt ?? "$";

  const defaultCursor = <TerminalAnimationBlinkingCursor className="h-4" aria-hidden />;

  return (
    <div className={cn("font-mono text-sm leading-relaxed text-foreground", className)} {...props}>
      <span className="text-chart-2">{prompt.endsWith(" ") ? prompt : `${prompt} `}</span>
      <span className="text-foreground/95">{commandTyped}</span>
      {isTypingCommand && showCursor ? (cursor ?? defaultCursor) : null}
    </div>
  );
}

export type TerminalAnimationOutputLineProps = React.ComponentProps<"div"> & {
  line: TerminalLine;
  visible: boolean;
};

export function TerminalAnimationOutputLine({ line, visible, className, ...props }: TerminalAnimationOutputLineProps) {
  if (!visible) {
    return null;
  }
  return (
    <div
      className={cn(
        "font-mono text-sm leading-relaxed motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-left-2 motion-safe:duration-300",
        line.color ?? "text-muted-foreground",
        className
      )}
      {...props}
    >
      {line.text || "\u00A0"}
    </div>
  );
}

export type TerminalAnimationOutputProps = React.ComponentProps<"div"> & {
  renderLine?: (line: TerminalLine, index: number, visible: boolean) => ReactNode;
};

export function TerminalAnimationOutput({ className, renderLine, ...props }: TerminalAnimationOutputProps) {
  const { isTypingCommand, visibleLines, currentTab, activeTab } = useTerminalAnimationContext();

  if (isTypingCommand) {
    return null;
  }

  return (
    <div className={cn("mt-3 space-y-1", className)} {...props}>
      {currentTab.lines.map((line, i) => {
        const visible = i < visibleLines;
        const key = `${activeTab}-${i}`;
        if (renderLine) {
          const content = renderLine(line, i, visible);
          if (!visible && !content) {
            return null;
          }
          return <div key={key}>{content}</div>;
        }
        return <TerminalAnimationOutputLine key={key} line={line} visible={visible} />;
      })}
    </div>
  );
}

export type TerminalAnimationTrailingPromptProps = React.ComponentProps<"div">;

export function TerminalAnimationTrailingPrompt({ className, ...props }: TerminalAnimationTrailingPromptProps) {
  const { isTypingCommand, showCursor, visibleLines, currentTab } = useTerminalAnimationContext();
  const prompt = currentTab.prompt ?? "$";
  const promptSpan = prompt.endsWith(" ") ? prompt : `${prompt} `;
  const trailingEnabled = currentTab.showTrailingPrompt !== false;

  const show =
    trailingEnabled && !isTypingCommand && showCursor && visibleLines >= currentTab.lines.length;

  if (!show) {
    return null;
  }

  return (
    <div className={cn("font-mono mt-2 text-sm text-muted-foreground", className)} {...props}>
      <span className="text-chart-2">{promptSpan}</span>
      <TerminalAnimationBlinkingCursor className="h-4" aria-hidden />
    </div>
  );
}

export type TerminalAnimationTabListProps = React.ComponentProps<"div">;

export function TerminalAnimationTabList({ className, onKeyDown, ...props }: TerminalAnimationTabListProps) {
  const { activeTab, setActiveTab } = useTerminalAnimationContext();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) {
      return;
    }
    const navKeys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!navKeys.includes(e.key)) {
      return;
    }
    const list = e.currentTarget;
    const tabButtons = Array.from(list.querySelectorAll<HTMLButtonElement>('button[role="tab"]'));
    if (tabButtons.length === 0) {
      return;
    }
    const focused = document.activeElement;
    let i = tabButtons.findIndex((btn) => btn === focused);
    if (i < 0) {
      i = activeTab;
    }
    let next = i;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (i + 1) % tabButtons.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (i - 1 + tabButtons.length) % tabButtons.length;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = tabButtons.length - 1;
    }
    e.preventDefault();
    setActiveTab(next);
    tabButtons[next]?.focus();
  };

  return (
    <div
      className={cn("flex flex-wrap gap-2", className)}
      role="tablist"
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      {...props}
    />
  );
}

export type TerminalAnimationTabTriggerProps = React.ComponentPropsWithoutRef<"button"> & {
  index: number;
  asChild?: boolean;
};

export function TerminalAnimationTabTrigger({
  index,
  asChild = false,
  className,
  children,
  type = "button",
  onClick,
  ...props
}: TerminalAnimationTabTriggerProps) {
  const { activeTab, setActiveTab, idPrefix } = useTerminalAnimationContext();
  const isActive = activeTab === index;
  const tabId = `${idPrefix}-tab-${index}`;
  const panelId = `${idPrefix}-panel`;

  const mergedClassName = cn(
    "rounded-md border border-border/60 px-3 py-2 text-sm font-medium outline-none transition-[color,background-color,border-color,box-shadow,transform] duration-200",
    "hover:-translate-y-px active:translate-y-0 active:scale-[0.98]",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    isActive
      ? "border-primary/50 bg-primary/18 text-foreground shadow-sm ring-2 ring-inset ring-primary/30"
      : "bg-background/40 text-muted-foreground hover:border-border hover:bg-accent/50 hover:text-foreground",
    className
  );

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    if (!e.defaultPrevented) {
      setActiveTab(index);
    }
  };

  if (asChild) {
    return (
      <Slot
        id={tabId}
        role="tab"
        tabIndex={isActive ? 0 : -1}
        aria-selected={isActive}
        aria-controls={panelId}
        data-state={isActive ? "active" : "inactive"}
        className={mergedClassName}
        onClick={handleClick as React.MouseEventHandler<HTMLElement>}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      type={type}
      id={tabId}
      role="tab"
      tabIndex={isActive ? 0 : -1}
      aria-selected={isActive}
      aria-controls={panelId}
      data-state={isActive ? "active" : "inactive"}
      className={mergedClassName}
      onClick={handleClick}
      {...props}
    >
      {children}
    </button>
  );
}

export function useTerminalAnimation() {
  return useTerminalAnimationContext();
}
