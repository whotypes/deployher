export type PipelineStepState = "pending" | "active" | "done" | "failed";

export type PipelineStep = { label: string; state: PipelineStepState };

export const buildPipelineModel = (status: string): PipelineStep[] => {
  const s = status.toLowerCase();
  if (s === "queued") {
    return [
      { label: "Prepare", state: "active" },
      { label: "Build", state: "pending" },
      { label: "Publish", state: "pending" }
    ];
  }
  if (s === "building") {
    return [
      { label: "Prepare", state: "done" },
      { label: "Build", state: "active" },
      { label: "Publish", state: "pending" }
    ];
  }
  if (s === "success") {
    return [
      { label: "Prepare", state: "done" },
      { label: "Build", state: "done" },
      { label: "Publish", state: "done" }
    ];
  }
  if (s === "failed") {
    return [
      { label: "Prepare", state: "done" },
      { label: "Build", state: "failed" },
      { label: "Publish", state: "pending" }
    ];
  }
  return [
    { label: "Prepare", state: "pending" },
    { label: "Build", state: "pending" },
    { label: "Publish", state: "pending" }
  ];
};

const iconCheck = (): string =>
  '<svg class="size-3.5 stroke-[2.5]" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

const iconX = (): string =>
  '<svg class="size-3.5 stroke-[2.5]" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';

const iconLoader = (): string =>
  '<svg class="size-3.5 animate-spin stroke-[2.5]" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>';

const stepCircleClass = (state: PipelineStepState): string => {
  const base = "flex size-7 items-center justify-center rounded-full text-xs font-semibold";
  if (state === "done") {
    return `${base} bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30`;
  }
  if (state === "failed") {
    return `${base} bg-destructive/20 text-[color-mix(in_oklab,var(--destructive)_85%,white)] ring-1 ring-destructive/35`;
  }
  if (state === "active") {
    return `${base} bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/35`;
  }
  return `${base} bg-muted/50 text-muted-foreground ring-1 ring-border/60`;
};

const stepInner = (step: PipelineStep, index: number): string => {
  if (step.state === "done") return iconCheck();
  if (step.state === "failed") return iconX();
  if (step.state === "active") return iconLoader();
  return `<span class="text-[0.65rem] opacity-70">${index + 1}</span>`;
};

export const buildDeploymentPipelineHtml = (status: string): string => {
  const steps = buildPipelineModel(status);
  const parts: string[] = [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]!;
    const next = steps[i + 1];
    const connectorDone =
      step.state === "done" && next && (next.state === "done" || next.state === "failed");
    parts.push(`<div class="flex w-16 shrink-0 flex-col items-center gap-1.5 sm:w-18">`);
    parts.push(
      `<div class="${stepCircleClass(step.state)}" aria-hidden="true">${stepInner(step, i)}</div>`
    );
    parts.push(
      `<span class="text-center text-[0.6rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">${step.label}</span>`
    );
    parts.push(`</div>`);
    if (i < steps.length - 1) {
      const lineClass = connectorDone ? "bg-emerald-500/45" : "bg-border/80";
      parts.push(
        `<div class="mx-0.5 mt-3.5 h-0.5 min-w-3 flex-1 rounded-full self-start ${lineClass}" aria-hidden="true"></div>`
      );
    }
  }
  return parts.join("");
};
