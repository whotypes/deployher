import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";

import { InfiniteSlider } from "./infinite-slider";

type StackLogo = {
  src: string
  alt: string
  hideLabel?: boolean
  forceWhite?: boolean
}

const STACK: StackLogo[] = [
  { src: "https://svgl.app/library/bun.svg", alt: "Bun" },
  { src: "https://svgl.app/library/nodejs.svg", alt: "Node.js" },
  { src: "https://svgl.app/library/python.svg", alt: "Python" },
  { src: "https://svgl.app/library/javascript.svg", alt: "JavaScript" },
  { src: "https://svgl.app/library/typescript.svg", alt: "TypeScript" },
  { src: "https://svgl.app/library/react_dark.svg", alt: "React" },
  { src: "https://svgl.app/library/reactrouter.svg", alt: "React Router" },
  { src: "https://svgl.app/library/tailwindcss.svg", alt: "Tailwind CSS" },
  { src: "https://svgl.app/library/vite.svg", alt: "Vite" },
  { src: "https://svgl.app/library/motion_dark.svg", alt: "Motion" },
  { src: "https://svgl.app/library/docker.svg", alt: "Docker" },
  { src: "https://svgl.app/library/postgresql.svg", alt: "PostgreSQL" },
  { src: "https://svgl.app/library/redis.svg", alt: "Redis" },
  { src: "https://svgl.app/library/sqlite.svg", alt: "SQLite" },
  { src: "https://svgl.app/library/drizzle-orm_dark.svg", alt: "Drizzle ORM" },
  {
    src: "https://svgl.app/library/github_wordmark_light.svg",
    alt: "GitHub",
    hideLabel: true,
    forceWhite: true
  },
  { src: "https://svgl.app/library/nginx.svg", alt: "NGINX" },
  { src: "https://svgl.app/library/cloudflare-workers.svg", alt: "Cloudflare Workers" },
  { src: "https://svgl.app/library/vercel_dark.svg", alt: "Vercel" }
]

// the actual stack the product runs on. no fake "trusted by 1000+ companies".
export const LandingLogoMarquee = () => {
  const { t } = useTranslation()

  return (
    <section
      className="border-border/60 relative border-y py-24 md:py-32"
      aria-labelledby="landing-logo-marquee-heading"
    >
      <div className="mx-auto max-w-[min(92rem,calc(100vw-2rem))] px-5 md:px-10">
        <h2 id="landing-logo-marquee-heading" className="sr-only">
          {t("landing.logoMarquee.srOnly")}
        </h2>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-muted-foreground/80 text-center font-mono text-sm tracking-tight md:text-base"
        >
          {t("landing.logoMarquee.eyebrow")}
        </motion.p>
      </div>

      <div className="perspective-distant relative z-10 mx-auto mt-14 h-48 max-w-[min(92rem,calc(100vw-2rem))] overflow-hidden px-4 md:h-64 md:px-8">
        <div className="transform-3d flex h-full items-center transform-[rotateX(10deg)_rotateY(-28deg)]">
          <InfiniteSlider
            className="w-full overflow-visible"
            gap={72}
            speed={40}
            speedOnHover={12}
            reverse
          >
            {STACK.map((logo) => (
              <div
                key={logo.alt}
                className="border-border/70 bg-card/90 flex shrink-0 transform-[translateZ(0)] items-center gap-3.5 rounded-full border px-7 py-[1.35rem] shadow-lg shadow-black/25 backdrop-blur-sm md:gap-4 md:px-9 md:py-[1.65rem]"
              >
                <img
                  src={logo.src}
                  alt={logo.hideLabel ? logo.alt : ""}
                  width={180}
                  height={48}
                  className={cn(
                    "pointer-events-none h-11 w-auto select-none md:h-15",
                    logo.forceWhite && "brightness-0 invert"
                  )}
                  loading="lazy"
                  decoding="async"
                />
                {!logo.hideLabel && (
                  <span className="text-muted-foreground/75 hidden font-mono text-[0.95rem] tracking-tight md:inline md:text-lg">
                    {logo.alt}
                  </span>
                )}
              </div>
            ))}
          </InfiniteSlider>
        </div>

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,var(--background)_0%,transparent_16%,transparent_84%,var(--background)_100%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,var(--background)_0%,transparent_18%,transparent_82%,var(--background)_100%)]" />
      </div>
    </section>
  )
}
