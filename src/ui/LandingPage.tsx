import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LandingTerminalDemo } from "./client/landing-page";
import { GitHubMark } from "./GitHubMark";
import { LandingBento } from "./landing/landing-bento";
import { LandingComparison } from "./landing/landing-comparison";
import { LandingCtaBanner } from "./landing/landing-cta-banner";
import { LandingFaq } from "./landing/landing-faq";
import { LandingLogoMarquee } from "./landing/landing-logo-marquee";
import { LandingMarketingFooter } from "./landing/landing-marketing-footer";
import { LandingNav } from "./landing/landing-nav";
import { LandingPricing } from "./landing/landing-pricing";
import { LandingWorkflow } from "./landing/landing-workflow";
import { LandingHeroPhotoLayer } from "./landing/landing-hero-photo";

export type LandingPageProps = {
  authenticated: boolean;
};

const GITHUB_URL = "https://github.com/whotypes/deployher";

const LandingPage = ({ authenticated }: LandingPageProps) => {
  const { t } = useTranslation();
  return (
    <div className="deployher-landing-page bg-background text-foreground min-h-svh scroll-smooth font-sans text-base">
      <LandingNav authenticated={authenticated} />
      <a
        href="#landing-main"
        className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("common.skipToMain")}
      </a>

      <div className="relative isolate overflow-hidden pt-22">
        <LandingHeroPhotoLayer />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-1 h-36 bg-linear-to-b from-transparent to-background"
          aria-hidden
        />

        <main id="landing-main" className="relative z-10">
          <section
            aria-labelledby="landing-hero-heading"
            className="mx-auto flex w-full max-w-[min(92rem,calc(100vw-2rem))] flex-col px-5 pb-28 pt-14 md:px-10 md:pb-36 md:pt-20"
          >
            <div className="grid items-stretch gap-16 lg:grid-cols-2 lg:gap-24">
              <div className="flex flex-col gap-8">
                <div className="deployher-enter flex flex-wrap items-center gap-3">
                  <span className="border-border/60 bg-background/60 supports-backdrop-filter:bg-background/40 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-mono text-xs tracking-tight text-muted-foreground backdrop-blur">
                    <span className="size-1.5 animate-pulse-slow rounded-full bg-red-500 shadow-[0_0_10px_color-mix(in_oklab,var(--chart-2)_75%,transparent)]" />
                    {t("landing.chip")}
                  </span>
                  <Link
                    to="/why"
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-base font-medium no-underline transition-colors hover:no-underline"
                  >
                    {t("landing.whySelfHost")}
                    <span aria-hidden>→</span>
                  </Link>
                </div>
                <h1
                  id="landing-hero-heading"
                  className="deployher-enter deployher-enter-delay-1 font-serif text-pretty text-3xl font-semibold tracking-[-0.03em] leading-[1.16] sm:text-4xl sm:leading-[1.14] md:text-5xl md:leading-[1.12] lg:text-6xl lg:leading-[1.1] xl:text-7xl xl:leading-[1.08] 2xl:text-8xl 2xl:leading-[1.06]"
                >
                  <span className="bg-linear-to-b from-foreground via-foreground to-muted-foreground/80 bg-clip-text text-transparent">
                    {t("landing.heroTitle")}
                  </span>
                </h1>
                <p className="deployher-enter deployher-enter-delay-2 text-base leading-snug text-muted-foreground sm:text-lg md:text-xl lg:text-2xl xl:text-3xl 2xl:text-4xl">
                  {t("landing.heroSubtitle")}
                </p>
                <div className="deployher-enter deployher-enter-delay-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <Link
                    id="sign-in"
                    to="/login"
                    className="inline-flex h-14 items-center justify-center gap-2.5 rounded-md bg-primary px-8 text-lg font-semibold text-primary-foreground no-underline shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_88%,black)] ring-1 ring-primary/35 transition-opacity duration-200 hover:no-underline hover:opacity-95"
                    aria-label={t("landing.signInGithubAria")}
                  >
                    <GitHubMark className="size-5 text-primary-foreground" />
                    {t("landing.signInGithub")}
                  </Link>
                  <a
                    href={GITHUB_URL}
                    className="border-input bg-background/60 text-foreground hover:bg-accent/80 inline-flex h-14 items-center justify-center rounded-md border px-8 text-lg font-medium no-underline backdrop-blur transition-colors hover:no-underline"
                    rel="noopener noreferrer"
                  >
                    {t("landing.githubRepo")}
                  </a>
                </div>
              </div>

              <div className="deployher-enter deployher-enter-delay-4 animate-float-soft relative flex w-full min-h-[min(26rem,52svh)] flex-col lg:h-full lg:min-h-0 lg:justify-self-end">
                <div
                  className="pointer-events-none absolute -inset-12 opacity-[0.85] blur-3xl"
                  aria-hidden
                  style={{
                    background:
                      "radial-gradient(ellipse 80% 60% at 50% 80%, color-mix(in oklab, var(--chart-2) 30%, transparent), transparent 70%)"
                  }}
                />
                <div className="border-border/50 bg-card relative flex min-h-0 flex-1 flex-col rounded-2xl border p-2 shadow-2xl backdrop-blur-xl sm:p-4">
                  <div
                    id="landing-terminal-root"
                    className="flex min-h-0 flex-1 flex-col"
                    aria-busy="true"
                    aria-label={t("landing.terminalDemoAria")}
                  >
                    <LandingTerminalDemo />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>

      <LandingLogoMarquee />
      <LandingBento />
      <LandingWorkflow />
      <LandingComparison />
      <LandingPricing />
      <LandingFaq />
      <LandingCtaBanner />
      <LandingMarketingFooter authenticated={authenticated} />
    </div>
  );
};

export { LandingPage };
