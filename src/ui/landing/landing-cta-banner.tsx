import { motion } from "motion/react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { GitHubMark } from "@/ui/GitHubMark"

const GITHUB_URL = "https://github.com/whotypes/deployher"

export const LandingCtaBanner = () => {
  const { t } = useTranslation()

  return (
    <section className="py-24 md:py-32" aria-labelledby="landing-cta-heading">
      <div className="mx-auto max-w-[min(88rem,calc(100vw-2rem))] px-5 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 32, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          className="border-border/60 bg-card relative overflow-hidden rounded-3xl border p-12 shadow-xl md:p-16"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 80% 60% at 80% 20%, color-mix(in oklab, var(--chart-2) 28%, transparent), transparent 55%), radial-gradient(ellipse 60% 50% at 10% 90%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 50%)"
            }}
          />
          <div className="relative z-10 flex flex-col gap-10 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl">
              <h2
                id="landing-cta-heading"
                className="text-foreground font-serif text-3xl font-semibold tracking-[-0.025em] sm:text-4xl md:text-5xl lg:text-6xl"
              >
                {t("landing.cta.title")}
              </h2>
              <p className="text-muted-foreground mt-4 text-xl sm:text-2xl md:text-3xl">{t("landing.cta.subtitle")}</p>
            </div>
            <div className="flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center">
              <Button size="lg" className="h-14 px-10 text-lg font-semibold shadow-md" asChild>
                <Link to="/login" className="inline-flex items-center gap-2.5 no-underline hover:no-underline">
                  <GitHubMark className="size-5" />
                  {t("landing.signInGithub")}
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-14 border-border/80 bg-background/60 px-10 text-lg backdrop-blur-sm"
                asChild
              >
                <a href={GITHUB_URL} rel="noopener noreferrer" target="_blank" className="no-underline hover:no-underline">
                  {t("landing.githubRepo")}
                </a>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
