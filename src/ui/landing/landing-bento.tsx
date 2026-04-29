import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

const enterCard = {
  initial: { opacity: 0, y: 32, filter: "blur(10px)" },
  whileInView: { opacity: 1, y: 0, filter: "blur(0px)" },
  viewport: { once: true, margin: "-100px" }
} as const

const enterHeading = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
} as const

export const LandingBento = () => {
  const { t } = useTranslation()

  return (
    <section
      id="landing-features"
      className="scroll-mt-28 py-28 md:py-40"
      aria-labelledby="landing-bento-heading"
    >
      <div className="mx-auto max-w-[min(92rem,calc(100vw-2rem))] px-5 md:px-10">
        <motion.div {...enterHeading} className="max-w-4xl">
          <p className="text-muted-foreground font-mono text-sm tracking-tight">
            {t("landing.bento.eyebrow")}
          </p>
          <h2
            id="landing-bento-heading"
            className="text-foreground mt-4 font-serif text-3xl font-semibold tracking-[-0.025em] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
          >
            {t("landing.bento.title")}
          </h2>
          <p className="text-muted-foreground mt-6 text-xl sm:text-2xl md:text-3xl">
            {t("landing.bento.subtitle")}
          </p>
        </motion.div>

        <div className="mt-20 grid gap-5 md:grid-cols-6 md:gap-6">
          <BentoCard
            className="md:col-span-4"
            label={t("landing.bento.c1Title")}
            body={t("landing.bento.c1Body")}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          >
            <DeployTimelineMock />
          </BentoCard>

          <BentoCard
            className="md:col-span-2"
            label={t("landing.bento.c2Title")}
            body={t("landing.bento.c2Body")}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            <StatusPillsMock />
          </BentoCard>

          <BentoCard
            className="md:col-span-2"
            label={t("landing.bento.c3Title")}
            body={t("landing.bento.c3Body")}
            transition={{ duration: 0.7, delay: 0.16, ease: [0.22, 1, 0.36, 1] }}
          >
            <EnvEditorMock />
          </BentoCard>

          <BentoCard
            className="md:col-span-3"
            label={t("landing.bento.c4Title")}
            body={t("landing.bento.c4Body")}
            transition={{ duration: 0.7, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <LogStreamMock />
          </BentoCard>

          <BentoCard
            className="md:col-span-3"
            label={t("landing.bento.c5Title")}
            body={t("landing.bento.c5Body")}
            transition={{ duration: 0.7, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <RollbackMock />
          </BentoCard>

          <BentoCard
            className="md:col-span-3"
            label={t("landing.bento.c6Title")}
            body={t("landing.bento.c6Body")}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <DeploymentHistoryMock />
          </BentoCard>
        </div>
      </div>
    </section>
  )
}

type BentoCardProps = {
  className?: string
  label: string
  body: string
  children: React.ReactNode
  transition?: object
}

const BentoCard = ({ className, label, body, children, transition }: BentoCardProps) => {
  return (
    <motion.article
      {...enterCard}
      transition={transition}
      className={cn(
        "border-border/70 bg-card group relative flex flex-col overflow-hidden rounded-2xl border shadow-sm backdrop-blur-sm",
        "transition-colors hover:border-border",
        className
      )}
    >
      <div className="relative min-h-56 flex-1 overflow-hidden border-b border-border/60 bg-linear-to-br from-muted/40 via-transparent to-transparent p-6 md:min-h-64 md:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, color-mix(in oklab, var(--foreground) 18%, transparent), transparent)"
          }}
        />
        {children}
      </div>
      <div className="px-6 py-6 md:px-8 md:py-8">
        <h3 className="text-foreground text-lg font-semibold tracking-tight sm:text-xl">{label}</h3>
        <p className="text-muted-foreground mt-2 text-base sm:text-lg md:text-xl">{body}</p>
      </div>
    </motion.article>
  )
}

const DeployTimelineMock = () => {
  const steps = [
    { name: "clone", time: "0.4s", state: "ok" },
    { name: "install", time: "12.1s", state: "ok" },
    { name: "build", time: "24.7s", state: "ok" },
    { name: "image", time: "8.3s", state: "ok" },
    { name: "deploy", time: "1.9s", state: "live" }
  ] as const
  return (
    <div className="flex h-full min-h-64 flex-col gap-5">
      <div className="flex items-center justify-between font-mono text-sm">
        <div className="flex items-center gap-2">
          <span className="size-2 animate-pulse-slow rounded-full bg-emerald-500 shadow-[0_0_10px_color-mix(in_oklab,#10b981_70%,transparent)]" />
          <span className="text-muted-foreground">deployment</span>
          <span className="text-foreground">dpl_8a2f</span>
        </div>
        <span className="text-muted-foreground">main · b3f1c0a</span>
      </div>

      <ol className="flex-1 space-y-3 font-mono text-[0.9375rem]">
        {steps.map((s, i) => (
          <li key={s.name} className="flex items-center gap-3">
            <span className="text-muted-foreground tabular-nums w-4 text-right">{i + 1}</span>
            <span
              className={cn(
                "size-1.5 rounded-full",
                s.state === "live"
                  ? "bg-emerald-500 shadow-[0_0_8px_color-mix(in_oklab,#10b981_70%,transparent)]"
                  : "bg-foreground/40"
              )}
            />
            <span className="text-foreground/90 flex-1">{s.name}</span>
            <span className="text-muted-foreground tabular-nums">{s.time}</span>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-xs font-medium tracking-tight",
                s.state === "live"
                  ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/25"
                  : "bg-muted text-muted-foreground"
              )}
            >
              {s.state}
            </span>
          </li>
        ))}
      </ol>

      <div className="border-border/60 mt-auto border-t pt-3 font-mono text-xs">
        <span className="text-muted-foreground">total </span>
        <span className="text-foreground tabular-nums">47.4s</span>
        <span className="text-muted-foreground"> · </span>
        <span className="text-foreground">https://app.acme.dev</span>
      </div>
    </div>
  )
}

const StatusPillsMock = () => {
  const projects = [
    { name: "marketing-site", state: "live", color: "emerald" },
    { name: "api-edge", state: "building", color: "amber" },
    { name: "worker-cron", state: "live", color: "emerald" },
    { name: "preview-runner", state: "queued", color: "blue" }
  ] as const

  const dotByColor = {
    emerald: "bg-emerald-500 shadow-[0_0_8px_color-mix(in_oklab,#10b981_70%,transparent)]",
    amber: "bg-amber-500 shadow-[0_0_8px_color-mix(in_oklab,#f59e0b_70%,transparent)]",
    blue: "bg-sky-500 shadow-[0_0_8px_color-mix(in_oklab,#0ea5e9_70%,transparent)]"
  } as const

  return (
    <div className="flex h-full min-h-64 flex-col gap-3">
      {projects.map((p) => (
        <div
          key={p.name}
          className="border-border/50 bg-background/40 flex items-center gap-3 rounded-md border px-3 py-2.5"
        >
          <span className={cn("size-2 rounded-full", dotByColor[p.color], p.color === "amber" && "animate-pulse-slow")} />
          <span className="text-foreground/90 font-mono text-xs flex-1">{p.name}</span>
          <span className="text-muted-foreground font-mono text-xs tracking-tight">{p.state}</span>
        </div>
      ))}
    </div>
  )
}

const EnvEditorMock = () => {
  const rows = [
    { k: "DATABASE_URL", v: "postgres://••••••", scope: "runtime" },
    { k: "STRIPE_SECRET", v: "sk_live_••••••", scope: "runtime" },
    { k: "NEXT_PUBLIC_URL", v: "https://acme.dev", scope: "build" }
  ] as const
  return (
    <div className="flex h-full min-h-64 flex-col gap-3 font-mono text-sm">
      <div className="text-muted-foreground flex items-center justify-between text-xs tracking-tight">
        <span>3 vars · scoped</span>
        <span>+ add</span>
      </div>
      {rows.map((r) => (
        <div
          key={r.k}
          className="border-border/50 bg-background/40 grid grid-cols-[1fr_auto] items-center gap-2 rounded-md border px-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-foreground/90 truncate">{r.k}</div>
            <div className="text-muted-foreground truncate text-[11px]">{r.v}</div>
          </div>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs tracking-tight",
              r.scope === "runtime"
                ? "bg-foreground/10 text-foreground/80 ring-1 ring-foreground/15"
                : "bg-sky-500/15 text-sky-500 ring-1 ring-sky-500/25"
            )}
          >
            {r.scope}
          </span>
        </div>
      ))}
    </div>
  )
}

const LogStreamMock = () => {
  const lines = [
    { t: "12:04:21", lvl: "info", msg: "→ POST /api/checkout 201 · 84ms" },
    { t: "12:04:22", lvl: "info", msg: "stripe.webhook ok evt_1OZx…" },
    { t: "12:04:23", lvl: "warn", msg: "queue depth=12 (soft limit 10)" },
    { t: "12:04:24", lvl: "info", msg: "→ GET /healthz 200 · 2ms" },
    { t: "12:04:25", lvl: "info", msg: "worker.cron ran cleanup() in 412ms" },
    { t: "12:04:26", lvl: "info", msg: "→ GET / 200 · 11ms" }
  ] as const
  const lvlColor = {
    info: "text-emerald-500",
    warn: "text-amber-500",
    err: "text-red-500"
  } as const
  return (
    <div className="flex h-full min-h-64 flex-col font-mono text-sm leading-relaxed">
      <div className="text-muted-foreground mb-3 flex items-center justify-between text-xs tracking-tight">
        <span>tail · /var/log/api.log</span>
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 animate-pulse-slow rounded-full bg-emerald-500" />
          live
        </span>
      </div>
      <div className="flex-1 space-y-1 overflow-hidden">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-3">
            <span className="text-muted-foreground tabular-nums">{l.t}</span>
            <span className={cn("tracking-tight", lvlColor[l.lvl as keyof typeof lvlColor])}>{l.lvl}</span>
            <span className="text-foreground/90 truncate">{l.msg}</span>
          </div>
        ))}
        <div className="flex gap-3">
          <span className="text-muted-foreground tabular-nums">12:04:27</span>
          <span className="text-emerald-500 tracking-tight">info</span>
          <span className="text-foreground/90 inline-flex items-center">
            <span className="bg-foreground/80 ml-1 inline-block h-3.5 w-1.5 animate-caret-blink" />
          </span>
        </div>
      </div>
    </div>
  )
}

const RollbackMock = () => {
  const releases = [
    { id: "dpl_8a2f", commit: "b3f1c0a", state: "current" },
    { id: "dpl_77c1", commit: "9a10f21", state: "ready" },
    { id: "dpl_61aa", commit: "44e2b90", state: "stable" }
  ] as const

  return (
    <div className="flex h-full min-h-64 flex-col gap-3 font-mono text-sm">
      <div className="text-muted-foreground flex items-center justify-between text-xs tracking-tight">
        <span>production releases</span>
        <span>rollback ready</span>
      </div>
      {releases.map((release) => (
        <div
          key={release.id}
          className="border-border/50 bg-background/40 grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border px-3 py-2.5"
        >
          <div className="min-w-0">
            <div className="text-foreground/90 truncate">{release.id}</div>
            <div className="text-muted-foreground truncate text-[11px]">main · {release.commit}</div>
          </div>
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs tracking-tight",
              release.state === "current"
                ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/25"
                : "bg-muted text-muted-foreground"
            )}
          >
            {release.state}
          </span>
        </div>
      ))}
      <button
        type="button"
        className="border-border/60 bg-foreground text-background mt-auto inline-flex h-10 items-center justify-center rounded-md border text-sm font-semibold"
      >
        Roll back to dpl_77c1
      </button>
    </div>
  )
}

const DeploymentHistoryMock = () => {
  const rows = [
    { branch: "main", commit: "b3f1c0a", status: "live", ago: "2m ago" },
    { branch: "main", commit: "9a10f21", status: "success", ago: "1h ago" },
    { branch: "feature/api", commit: "70e4a90", status: "preview", ago: "3h ago" },
    { branch: "main", commit: "1b821df", status: "failed", ago: "yesterday" }
  ] as const

  return (
    <div className="flex h-full min-h-64 flex-col font-mono text-sm">
      <div className="text-muted-foreground mb-3 grid grid-cols-[1fr_auto_auto] gap-3 text-xs tracking-tight">
        <span>commit</span>
        <span>status</span>
        <span>when</span>
      </div>
      <div className="flex-1 space-y-2">
        {rows.map((row) => (
          <div
            key={`${row.branch}-${row.commit}`}
            className="border-border/50 bg-background/40 grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-md border px-3 py-2"
          >
            <span className="text-foreground/90 min-w-0 truncate">
              {row.branch} · {row.commit}
            </span>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-xs tracking-tight",
                row.status === "failed"
                  ? "bg-red-500/15 text-red-500 ring-1 ring-red-500/25"
                  : "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/25"
              )}
            >
              {row.status}
            </span>
            <span className="text-muted-foreground text-xs">{row.ago}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
