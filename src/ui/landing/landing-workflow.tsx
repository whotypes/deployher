import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

type Step = {
  n: string
  title: string
  body: string
  code: { line: string; comment?: string }[]
}

export const LandingWorkflow = () => {
  const { t } = useTranslation()

  const steps: Step[] = [
    {
      n: "01",
      title: t("landing.workflow.s1Title"),
      body: t("landing.workflow.s1Body"),
      code: [
        { line: "$ pdploy login", comment: "repo-scoped github oauth" },
        { line: "→ choose org/repo access" }
      ]
    },
    {
      n: "02",
      title: t("landing.workflow.s2Title"),
      body: t("landing.workflow.s2Body"),
      code: [
        { line: "$ pdploy detect" },
        { line: "framework: next.js · bun" },
        { line: "dockerfile: optional" }
      ]
    },
    {
      n: "03",
      title: t("landing.workflow.s3Title"),
      body: t("landing.workflow.s3Body"),
      code: [
        { line: "$ git push origin main" },
        { line: "build → image → release" },
        { line: "live at app.acme.dev · 47.4s" }
      ]
    },
    {
      n: "04",
      title: t("landing.workflow.s4Title"),
      body: t("landing.workflow.s4Body"),
      code: [
        { line: "$ pdploy logs --tail" },
        { line: "GET / 200 14ms" },
        { line: "health, previews, history" }
      ]
    }
  ]

  return (
    <section
      id="landing-workflow"
      className="scroll-mt-28 border-y border-border/40 bg-muted/15 py-28 md:py-40"
      aria-labelledby="landing-workflow-heading"
    >
      <div className="mx-auto max-w-[min(88rem,calc(100vw-2rem))] px-5 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="mb-20 max-w-4xl"
        >
          <p className="text-muted-foreground font-mono text-sm tracking-tight">
            {t("landing.workflow.eyebrow")}
          </p>
          <h2
            id="landing-workflow-heading"
            className="text-foreground mt-4 font-serif text-3xl font-semibold tracking-[-0.025em] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
          >
            {t("landing.workflow.title")}
          </h2>
        </motion.div>

        <ol className="relative space-y-14 md:space-y-20">
          <span
            aria-hidden
            className="bg-border/60 absolute left-[22px] top-2 bottom-2 w-px md:left-[30px]"
          />
          {steps.map((step, i) => (
            <motion.li
              key={step.n}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] }}
              className="relative grid items-start gap-8 pl-14 md:grid-cols-[1fr_1.1fr] md:gap-12 md:pl-20"
            >
              <span
                aria-hidden
                className={cn(
                  "border-background bg-card text-muted-foreground absolute left-0 top-0 flex size-12 items-center justify-center rounded-full border-4 font-mono text-sm font-semibold md:size-16 md:text-base",
                  "ring-border/60 ring-1"
                )}
              >
                {step.n}
              </span>

              <div>
                <h3 className="text-foreground text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl">{step.title}</h3>
                <p className="text-muted-foreground mt-4 text-lg sm:text-xl md:text-2xl">{step.body}</p>
              </div>

              <div className="border-border/60 bg-card rounded-xl border shadow-sm backdrop-blur-sm md:rounded-2xl">
                <div className="border-border/60 flex items-center gap-2 border-b px-4 py-2.5 md:px-5">
                  <span className="size-2 rounded-full bg-red-500/70" />
                  <span className="size-2 rounded-full bg-amber-500/70" />
                  <span className="size-2 rounded-full bg-emerald-500/70" />
                  <span className="text-muted-foreground ml-auto font-mono text-xs tracking-tight">
                    pdploy · zsh
                  </span>
                </div>
                <pre className="m-0 overflow-hidden bg-transparent px-4 py-4 font-mono text-[13px] leading-relaxed md:px-5 md:py-5 md:text-sm">
                  {step.code.map((c, idx) => (
                    <div key={idx} className="flex gap-3">
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          c.line.startsWith("$") ? "text-foreground" : "text-foreground/70"
                        )}
                      >
                        {c.line}
                      </span>
                      {c.comment ? <span className="text-muted-foreground shrink-0">// {c.comment}</span> : null}
                    </div>
                  ))}
                </pre>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  )
}
