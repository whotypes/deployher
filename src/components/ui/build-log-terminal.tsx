import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type BuildLogTerminalProps = {
  logPath: string;
  children: ReactNode;
  className?: string;
  streamSlot?: ReactNode;
};

export const BuildLogTerminal = ({ logPath, children, className, streamSlot }: BuildLogTerminalProps) => {
  return (
    <div
      className={cn(
        "build-log-terminal relative w-full overflow-hidden rounded-xl border border-border/80 shadow-[0_24px_64px_-28px_rgba(0,0,0,0.85)]",
        className
      )}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.4]"
        aria-hidden
        style={{
          backgroundImage: `
            linear-gradient(to right, color-mix(in oklab, var(--foreground) 8%, transparent) 1px, transparent 1px),
            linear-gradient(to bottom, color-mix(in oklab, var(--foreground) 8%, transparent) 1px, transparent 1px)
          `,
          backgroundSize: "20px 20px"
        }}
      />
      <div className="relative z-1 flex min-h-0 flex-col bg-zinc-950/55 supports-backdrop-filter:backdrop-blur-md dark:bg-zinc-950/65">
        <div className="flex h-11 shrink-0 items-center gap-3 border-b border-border/70 bg-zinc-900/85 px-3">
          <div className="flex shrink-0 gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-red-500/90 shadow-[0_0_6px_rgba(239,68,68,0.45)]" />
            <span className="size-2.5 rounded-full bg-amber-400/90 shadow-[0_0_6px_rgba(251,191,36,0.4)]" />
            <span className="size-2.5 rounded-full bg-emerald-500/90 shadow-[0_0_6px_rgba(52,211,153,0.45)]" />
          </div>
          <p
            className="min-w-0 flex-1 truncate text-center font-mono text-[0.65rem] tabular-nums text-muted-foreground"
            title={logPath}
          >
            {logPath}
          </p>
          <div
            id="log-stream-state"
            className="flex min-h-5 max-w-[45%] shrink-0 items-center justify-end gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground sm:max-w-none"
          >
            {streamSlot}
          </div>
        </div>
        <div className="relative min-h-0 flex-1">{children}</div>
      </div>
    </div>
  );
};
