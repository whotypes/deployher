import { CheckCircle2, XCircle } from "lucide-react"
import { motion } from "motion/react"
import { useTranslation } from "react-i18next"

type CompareRow = {
  feature: string
  deployher: string
  vercel: string
}

type ProofCard = {
  value: string
  label: string
}

export const LandingComparison = () => {
  const { t } = useTranslation()

  const rows: CompareRow[] = [
    {
      feature: t("landing.compare.row1Feature"),
      deployher: t("landing.compare.row1Us"),
      vercel: t("landing.compare.row1Them")
    },
    {
      feature: t("landing.compare.row2Feature"),
      deployher: t("landing.compare.row2Us"),
      vercel: t("landing.compare.row2Them")
    },
    {
      feature: t("landing.compare.row3Feature"),
      deployher: t("landing.compare.row3Us"),
      vercel: t("landing.compare.row3Them")
    },
    {
      feature: t("landing.compare.row4Feature"),
      deployher: t("landing.compare.row4Us"),
      vercel: t("landing.compare.row4Them")
    },
    {
      feature: t("landing.compare.row5Feature"),
      deployher: t("landing.compare.row5Us"),
      vercel: t("landing.compare.row5Them")
    },
    {
      feature: t("landing.compare.row6Feature"),
      deployher: t("landing.compare.row6Us"),
      vercel: t("landing.compare.row6Them")
    }
  ]

  const proofCards: ProofCard[] = [
    { value: t("landing.trust.v1"), label: t("landing.trust.l1") },
    { value: t("landing.trust.v2"), label: t("landing.trust.l2") },
    { value: t("landing.trust.v3"), label: t("landing.trust.l3") },
    { value: t("landing.trust.v4"), label: t("landing.trust.l4") }
  ]

  return (
    <section
      id="landing-comparison"
      className="border-y border-border/40 bg-muted/15 py-28 md:py-40"
      aria-labelledby="landing-comparison-heading"
    >
      <div className="mx-auto max-w-[min(88rem,calc(100vw-2rem))] px-5 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl"
        >
          <p className="text-muted-foreground font-mono text-sm tracking-tight">{t("landing.compare.eyebrow")}</p>
          <h2
            id="landing-comparison-heading"
            className="text-foreground mt-4 font-serif text-3xl font-semibold tracking-[-0.025em] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
          >
            {t("landing.compare.title")}
          </h2>
          <p className="text-muted-foreground mt-6 text-xl sm:text-2xl md:text-3xl">{t("landing.compare.subtitle")}</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 32, filter: "blur(10px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.85, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="border-border/70 bg-card mt-16 overflow-hidden rounded-3xl border shadow-sm backdrop-blur-sm"
        >
          <div className="grid grid-cols-[1.25fr_1fr_1fr] border-b border-border/70 bg-background/45 px-5 py-4 font-mono text-xs tracking-tight text-muted-foreground md:px-8 md:text-sm">
            <span>{t("landing.compare.colFeature")}</span>
            <span>{t("landing.compare.colDeployher")}</span>
            <span>{t("landing.compare.colVercel")}</span>
          </div>
          <div className="divide-y divide-border/60">
            {rows.map((row) => (
              <div
                key={row.feature}
                className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-[1.25fr_1fr_1fr] md:items-center md:px-8"
              >
                <div className="text-foreground text-lg font-semibold tracking-tight">{row.feature}</div>
                <div className="flex items-center gap-2 text-base text-foreground/90 md:text-lg">
                  <CheckCircle2 className="size-5 shrink-0 text-emerald-500" aria-hidden />
                  <span>{row.deployher}</span>
                </div>
                <div className="flex items-center gap-2 text-base text-muted-foreground md:text-lg">
                  <XCircle className="size-5 shrink-0 text-muted-foreground/70" aria-hidden />
                  <span>{row.vercel}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {proofCards.map((card, index) => (
            <motion.div
              key={card.value}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
              className="border-border/70 bg-card/70 rounded-2xl border p-5"
            >
              <div className="text-foreground font-serif text-3xl font-semibold tracking-tight">{card.value}</div>
              <p className="text-muted-foreground mt-2 text-base leading-relaxed">{card.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
