"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
    tabs
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
        "relative flex flex-col overflow-hidden rounded-t-xl border border-border/60 bg-card/90 shadow-xl backdrop-blur-md transition-[opacity,transform] duration-500",
        animateOnVisible && !hasAnimated && "translate-y-4 opacity-0",
        animateOnVisible && hasAnimated && "translate-y-0 opacity-100",
        className
      )}
      style={{ minHeight, backgroundColor, ...style }}
      {...props}
    />
  );
}

export type TerminalAnimationContentProps = React.ComponentProps<"div">;

export function TerminalAnimationContent({ className, ...props }: TerminalAnimationContentProps) {
  return <div className={cn("flex flex-1 flex-col px-5 py-5 sm:px-8 sm:py-7", className)} {...props} />;
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
  const { commandTyped, isTypingCommand, showCursor } = useTerminalAnimationContext();

  const defaultCursor = <TerminalAnimationBlinkingCursor className="h-4" aria-hidden />;

  return (
    <div className={cn("font-mono text-sm leading-relaxed text-foreground", className)} {...props}>
      <span className="text-chart-2">$ </span>
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
    <div className={cn("font-mono text-sm leading-relaxed", line.color ?? "text-muted-foreground", className)} {...props}>
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

  const show =
    !isTypingCommand && showCursor && visibleLines >= currentTab.lines.length;

  if (!show) {
    return null;
  }

  return (
    <div className={cn("font-mono mt-2 text-sm text-muted-foreground", className)} {...props}>
      <span className="text-chart-2">$ </span>
      <TerminalAnimationBlinkingCursor className="h-4" aria-hidden />
    </div>
  );
}

export type TerminalAnimationTabListProps = React.ComponentProps<"div">;

export function TerminalAnimationTabList({ className, ...props }: TerminalAnimationTabListProps) {
  return <div className={cn("flex flex-wrap gap-2", className)} role="tablist" {...props} />;
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
  const { activeTab, setActiveTab } = useTerminalAnimationContext();
  const isActive = activeTab === index;

  const mergedClassName = cn(
    "rounded-md border border-border/60 px-3 py-2 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200",
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
        role="tab"
        aria-selected={isActive}
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
      role="tab"
      aria-selected={isActive}
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
