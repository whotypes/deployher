import { useState } from "react"
import { Languages } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Link } from "@/spa/routerCompat"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const DOCS_URL = "https://github.com/whotypes/deployher/tree/main/docs"

const LandingNavLocale = () => {
  const { t, i18n } = useTranslation()
  const current = i18n.language.startsWith("fr") ? "fr" : "en"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground border-border/60 hover:bg-accent/50 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border bg-transparent px-2.5 text-xs font-semibold tracking-wide transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label={t("layoutPrefs.language")}
        >
          <Languages className="size-3.5" aria-hidden />
          <span aria-hidden>{current.toUpperCase()}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} collisionPadding={12} className="w-40">
        <DropdownMenuRadioGroup
          value={current}
          onValueChange={(lng) => {
            void i18n.changeLanguage(lng)
          }}
        >
          <DropdownMenuRadioItem value="en">{t("layoutPrefs.english")}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="fr">{t("layoutPrefs.french")}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const AnimatedNavLink = ({
  href,
  children,
  onNavigate,
  target,
  rel
}: {
  href: string
  children: React.ReactNode
  onNavigate?: () => void
  target?: string
  rel?: string
}) => {
  return (
    <a
      href={href}
      onClick={onNavigate}
      target={target}
      rel={rel}
      className="text-muted-foreground hover:text-foreground shrink-0 text-base leading-5 whitespace-nowrap no-underline hover:underline underline-offset-4 transition-colors"
    >
      {children}
    </a>
  )
}

export type LandingNavProps = {
  authenticated: boolean
}

export const LandingNav = ({ authenticated }: LandingNavProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  const close = () => setOpen(false)

  const links = [
    { href: "#landing-features", label: t("landing.nav.features") },
    { href: "#landing-workflow", label: t("landing.nav.workflow") },
    { href: "#landing-pricing", label: t("landing.nav.pricing") },
    { href: DOCS_URL, label: t("landing.nav.docs"), external: true },
    { href: "/why", label: t("landing.whySelfHost") }
  ]

  return (
    <header className="fixed top-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 justify-center">
      <div
        className={cn(
          "border-border/80 bg-background/75 supports-backdrop-filter:bg-background/60 flex w-full min-w-0 max-w-full flex-col rounded-full border px-4 py-3 shadow-sm backdrop-blur-xl transition-[border-radius] duration-300 sm:px-5",
          open && "rounded-2xl"
        )}
      >
        <div className="flex min-w-0 items-center justify-between gap-3 sm:gap-6 md:gap-10">
          <Link
            to="/"
            className="font-serif shrink-0 text-lg font-semibold tracking-tight text-foreground no-underline hover:no-underline md:text-xl"
          >
            {t("common.deployherBrand")}
          </Link>

          <nav
            className="hidden shrink-0 flex-nowrap items-center gap-4 md:flex md:gap-6"
            aria-label={t("landing.nav.aria")}
          >
            {links.map((l) => (
              <AnimatedNavLink
                key={l.href}
                href={l.href}
                target={l.external ? "_blank" : undefined}
                rel={l.external ? "noopener noreferrer" : undefined}
              >
                {l.label}
              </AnimatedNavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <LandingNavLocale />
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground flex h-9 w-9 items-center justify-center rounded-full"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={open ? t("landing.nav.closeMenu") : t("landing.nav.openMenu")}
            >
              {open ? (
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>

          <div className="hidden shrink-0 items-center gap-2 md:flex">
            <LandingNavLocale />
            {authenticated ? (
              <Link
                to="/dashboard"
                className="border-input bg-background text-foreground hover:bg-accent inline-flex h-11 shrink-0 items-center rounded-full border px-5 text-base font-medium whitespace-nowrap no-underline transition-colors"
              >
                {t("common.dashboard")}
              </Link>
            ) : (
              <Link
                to="/login"
                className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-11 shrink-0 items-center rounded-full px-5 text-base font-semibold whitespace-nowrap no-underline shadow-sm transition-colors"
              >
                {t("landing.nav.startFree")}
              </Link>
            )}
          </div>
        </div>

        {open ? (
          <div className="flex flex-col gap-3 border-t border-border/60 pt-4 md:hidden">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target={l.external ? "_blank" : undefined}
                rel={l.external ? "noopener noreferrer" : undefined}
                className="text-muted-foreground hover:text-foreground py-1 text-sm"
                onClick={close}
              >
                {l.label}
              </a>
            ))}
            {authenticated ? (
              <Link
                to="/dashboard"
                className="bg-primary text-primary-foreground mt-1 inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold no-underline"
                onClick={close}
              >
                {t("common.dashboard")}
              </Link>
            ) : (
              <Link
                to="/login"
                className="bg-primary text-primary-foreground mt-1 inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold no-underline"
                onClick={close}
              >
                {t("landing.nav.startFree")}
              </Link>
            )}
          </div>
        ) : null}
      </div>
    </header>
  )
}
