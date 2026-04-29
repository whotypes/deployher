import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"

import { GitHubMark } from "@/ui/GitHubMark"

const GITHUB_URL = "https://github.com/whotypes/deployher"
const DOCS_URL = "https://github.com/whotypes/deployher/tree/main/docs"

export type LandingMarketingFooterProps = {
  authenticated: boolean
}

export const LandingMarketingFooter = ({ authenticated }: LandingMarketingFooterProps) => {
  const { t } = useTranslation()

  return (
    <footer className="border-border/80 border-t bg-muted/10 py-20 md:py-28" aria-labelledby="landing-footer-heading">
      <div className="mx-auto max-w-[min(92rem,calc(100vw-2rem))] px-5 md:px-10">
        <h2 id="landing-footer-heading" className="sr-only">
          {t("landing.footer.srOnly")}
        </h2>
        <div className="grid gap-12 md:grid-cols-4">
          <div className="md:col-span-1">
            <p className="font-serif text-2xl font-semibold tracking-tight">{t("common.deployherBrand")}</p>
            <p className="text-muted-foreground mt-3 text-base leading-relaxed">{t("landing.footer.tagline")}</p>
          </div>
          <div>
            <p className="text-foreground text-sm font-semibold tracking-tight">
              {t("landing.footer.colProduct")}
            </p>
            <ul className="mt-4 space-y-3">
              <li>
                <a href="#landing-features" className="text-muted-foreground hover:text-foreground text-base no-underline transition-colors">
                  {t("landing.nav.features")}
                </a>
              </li>
              <li>
                <a
                  href={DOCS_URL}
                  className="text-muted-foreground hover:text-foreground text-base no-underline transition-colors"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t("landing.nav.docs")}
                </a>
              </li>
              <li>
                <a href="#landing-pricing" className="text-muted-foreground hover:text-foreground text-base no-underline transition-colors">
                  {t("landing.nav.pricing")}
                </a>
              </li>
              <li>
                <a href="#landing-faq" className="text-muted-foreground hover:text-foreground text-base no-underline transition-colors">
                  {t("landing.nav.faq")}
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-foreground text-sm font-semibold tracking-tight">
              {t("landing.footer.colCompany")}
            </p>
            <ul className="mt-4 space-y-3">
              <li>
                <a
                  href={GITHUB_URL}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-base no-underline transition-colors"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <GitHubMark className="size-4" />
                  {t("common.github")}
                </a>
              </li>
              <li>
                <Link
                  to="/why"
                  className="text-muted-foreground hover:text-foreground text-base no-underline transition-colors"
                >
                  {t("landing.whySelfHost")}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-foreground text-sm font-semibold tracking-tight">
              {t("landing.footer.colAccount")}
            </p>
            <ul className="mt-4 space-y-3">
              {authenticated ? (
                <li>
                  <Link
                    to="/dashboard"
                    className="text-muted-foreground hover:text-foreground text-base no-underline transition-colors"
                  >
                    {t("common.dashboard")}
                  </Link>
                </li>
              ) : (
                <li>
                  <Link
                    to="/login"
                    className="text-muted-foreground hover:text-foreground text-base no-underline transition-colors"
                  >
                    {t("common.logIn")}
                  </Link>
                </li>
              )}
            </ul>
          </div>
        </div>
        <div className="text-muted-foreground mt-14 border-t border-border/60 pt-8 text-sm">
          <p>{t("landing.footer.copy")}</p>
        </div>
      </div>
    </footer>
  )
}
