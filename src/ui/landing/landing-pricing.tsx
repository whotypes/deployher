import { Check } from "lucide-react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Link } from "@/spa/routerCompat"

import { GitHubMark } from "@/ui/GitHubMark"

const GITHUB_URL = "https://github.com/whotypes/deployher"

export const LandingPricing = () => {
  const { t } = useTranslation()

  const features = [
    t("landing.pricing.tier1F1"),
    t("landing.pricing.tier1F2"),
    t("landing.pricing.tier1F3"),
    t("landing.pricing.tier2F2"),
    t("landing.pricing.tier2F3"),
    t("landing.pricing.tier3F1")
  ]

  const typicalSetup = [
    t("landing.pricing.costVps"),
    t("landing.pricing.costDomain"),
    t("landing.pricing.costStorage")
  ]

  return (
    <section
      id="landing-pricing"
      className="relative scroll-mt-28 py-28 md:py-40"
      aria-labelledby="landing-pricing-heading"
    >
      <div className="mx-auto max-w-[min(88rem,calc(100vw-2rem))] px-5 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto max-w-4xl text-center"
        >
          <p className="text-muted-foreground font-mono text-sm tracking-tight">
            {t("landing.pricing.subtitle")}
          </p>
          <h2
            id="landing-pricing-heading"
            className="text-foreground mt-4 font-serif text-4xl font-semibold tracking-[-0.03em] sm:text-5xl md:text-7xl lg:text-8xl"
          >
            {t("landing.pricing.title")}
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 36, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="relative mt-20"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-12 -z-10 opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(ellipse 60% 50% at 50% 50%, color-mix(in oklab, var(--chart-2) 28%, transparent), transparent 60%)"
            }}
          />
          <div className="border-border/70 bg-card relative overflow-hidden rounded-3xl border shadow-sm backdrop-blur-xl">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-12 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in oklab, var(--chart-2) 90%, white), transparent)"
              }}
            />
            <div className="grid items-center gap-12 p-10 md:grid-cols-[1.1fr_1fr] md:gap-16 md:p-16">
              <div>
                <div className="flex items-baseline gap-3">
                  <span className="text-foreground font-serif text-5xl font-semibold tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">$0</span>
                  <span className="text-muted-foreground font-mono text-base">{t("landing.pricing.priceUnit")}</span>
                </div>
                <p className="text-foreground/90 mt-8 text-2xl leading-tight sm:text-3xl md:text-4xl">
                  {t("landing.pricing.panelLead")}{" "}
                  <span className="text-muted-foreground">{t("landing.pricing.panelLeadMuted")}</span>
                </p>
                <div className="border-border/60 bg-background/45 mt-8 rounded-2xl border p-5">
                  <p className="text-foreground font-mono text-sm tracking-tight">{t("landing.pricing.costTitle")}</p>
                  <ul className="mt-4 grid gap-2 text-base text-muted-foreground sm:text-lg">
                    {typicalSetup.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="mt-10 flex flex-wrap items-center gap-3">
                  <Link
                    to="/login"
                    className="bg-primary text-primary-foreground hover:opacity-95 inline-flex h-14 items-center gap-2.5 rounded-md px-8 text-lg font-semibold no-underline shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_88%,black)] ring-1 ring-primary/35 transition-opacity"
                  >
                    <GitHubMark className="size-6" />
                    {t("landing.signInGithub")}
                  </Link>
                  <a
                    href={GITHUB_URL}
                    rel="noopener noreferrer"
                    className="border-input bg-background/60 hover:bg-accent/80 text-foreground inline-flex h-14 items-center rounded-md border px-8 text-lg font-medium no-underline transition-colors"
                  >
                    {t("landing.githubRepo")}
                  </a>
                </div>
              </div>

              <ul className="grid gap-4 font-mono text-base md:text-lg">
                {features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5">
                    <span className="bg-red-500/15 ring-red-500/35 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1">
                      <Check className="size-3.5 text-red-600 dark:text-red-400" aria-hidden />
                    </span>
                    <span className="text-foreground/90">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
