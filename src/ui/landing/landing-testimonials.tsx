import { motion } from "motion/react"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { cn } from "@/lib/utils"

type CardData = {
  handle: string
  name: string
  initials: string
  body: string
  date: string
}

const TwitterIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
)

type CardProps = {
  data: CardData
  baseClass: string
  spreadClass: string
  index: number
  onHover: (i: number | null) => void
  isFocused: boolean
}

const TweetCard = ({ data, baseClass, spreadClass, index, onHover, isFocused }: CardProps) => {
  return (
    <a
      href="#landing-pricing"
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "border-border/70 bg-card/90 supports-backdrop-filter:bg-card/70 relative flex h-auto w-[min(100vw-2rem,340px)] sm:w-[min(100vw-3rem,480px)] -skew-y-[8deg] select-none flex-col rounded-2xl border px-5 py-5 backdrop-blur-md transition-[filter,transform,opacity] duration-500 ease-out hover:border-border no-underline hover:no-underline",
        "before:absolute before:inset-0 before:rounded-2xl before:bg-background/55 before:opacity-100 before:transition-opacity before:duration-500 before:content-[''] hover:before:opacity-0",
        "grayscale transition-[filter,transform,opacity] hover:grayscale-0",
        baseClass,
        isFocused ? "" : spreadClass
      )}
    >
      <div className="relative z-10 mb-3 flex items-start gap-3">
        <span className="bg-foreground text-background flex size-12 shrink-0 items-center justify-center rounded-full font-mono text-sm font-semibold">
          {data.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-foreground truncate text-base font-bold">{data.name}</div>
          <div className="text-muted-foreground truncate text-sm">{data.handle}</div>
        </div>
        <TwitterIcon className="text-foreground size-5 shrink-0" />
      </div>
      <p className="text-foreground/90 relative z-10 line-clamp-4 text-lg leading-relaxed md:text-xl">
        {data.body}
      </p>
      <div className="text-muted-foreground relative z-10 mt-4 flex items-center justify-between text-sm">
        <span>{data.date}</span>
        <div className="flex items-center gap-3 font-mono">
          <span>♥ {142 + index * 27}</span>
          <span>↺ {18 + index * 5}</span>
        </div>
      </div>
    </a>
  )
}

export const LandingTestimonials = () => {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState<number | null>(null)

  const cards: CardData[] = [
    {
      handle: "@alxkim",
      name: t("landing.testimonials.t1Name"),
      initials: "AK",
      body: t("landing.testimonials.t1Quote"),
      date: "Apr 18"
    },
    {
      handle: "@morganreed",
      name: t("landing.testimonials.t2Name"),
      initials: "MR",
      body: t("landing.testimonials.t2Quote"),
      date: "Apr 12"
    },
    {
      handle: "@samliu_dev",
      name: t("landing.testimonials.t3Name"),
      initials: "SL",
      body: t("landing.testimonials.t3Quote"),
      date: "Apr 02"
    }
  ]

  // when hovering a back card, push the cards in front of it down/right
  const spreadFor = (i: number) => {
    if (hovered === null) return ""
    if (hovered === 0 && i === 1) return "!translate-y-32 !translate-x-24"
    if (hovered === 0 && i === 2) return "!translate-y-44 !translate-x-40"
    if (hovered === 1 && i === 2) return "!translate-y-40 !translate-x-40"
    return ""
  }

  // base offset position per card
  const baseClassFor = (i: number) => {
    if (i === 0) return "[grid-area:stack] hover:-translate-y-10"
    if (i === 1) return "[grid-area:stack] translate-x-16 translate-y-10 hover:-translate-y-1"
    return "[grid-area:stack] translate-x-32 translate-y-20 hover:translate-y-10"
  }

  return (
    <section
      className="border-border/60 relative overflow-hidden border-y bg-muted/20 py-32 md:py-44"
      aria-labelledby="landing-testimonials-heading"
    >
      {/* faded background gradient on the right side */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-1/4 top-1/2 h-160 w-160 -translate-y-1/2 rounded-full opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--chart-2) 28%, transparent), transparent 70%)"
        }}
      />

      <div className="mx-auto grid max-w-[min(92rem,calc(100vw-2rem))] gap-20 px-5 md:grid-cols-2 md:items-center md:gap-24 md:px-10">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.75, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="text-muted-foreground font-mono text-sm tracking-tight">
            {t("landing.testimonials.subtitle")}
          </p>
          <h2
            id="landing-testimonials-heading"
            className="text-foreground mt-4 font-serif text-3xl font-semibold tracking-[-0.025em] sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl"
          >
            {t("landing.testimonials.title")}
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
          whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
          className="grid min-h-88 place-items-center [grid-template-areas:'stack'] md:min-h-104"
        >
          {cards.map((c, i) => (
            <TweetCard
              key={c.handle}
              data={c}
              index={i}
              baseClass={baseClassFor(i)}
              spreadClass={spreadFor(i)}
              onHover={setHovered}
              isFocused={hovered === i}
            />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
