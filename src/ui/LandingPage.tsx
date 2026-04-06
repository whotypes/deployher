import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { LandingTerminalDemo } from "./client/landing-page";
import { GitHubMark } from "./GitHubMark";

export type LandingPageProps = {
  authenticated: boolean;
};

const GITHUB_URL = "https://github.com/whotypes/deployher";

const LandingPage = ({ authenticated }: LandingPageProps) => {
  const { t } = useTranslation();
  return (
  <div className="bg-background text-foreground min-h-svh font-sans text-base">
      <a
        href="#landing-main"
        className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        {t("common.skipToMain")}
      </a>
      <div className="relative flex min-h-svh flex-col overflow-hidden">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          aria-hidden
          style={{
            backgroundImage: `linear-gradient(color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 1px),
              linear-gradient(90deg, color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 1px)`,
            backgroundSize: "56px 56px"
          }}
        />
        <div
          className="deployher-landing-glow pointer-events-none absolute -left-1/4 top-1/4 h-[min(560px,75vw)] w-[min(560px,75vw)] rounded-full blur-3xl animate-pulse-slow"
          style={{ background: "color-mix(in oklab, var(--primary) 28%, transparent)" }}
          aria-hidden
        />
        <div
          className="deployher-landing-glow-alt pointer-events-none absolute -right-1/4 bottom-1/4 h-[min(480px,65vw)] w-[min(480px,65vw)] rounded-full blur-3xl animate-pulse-slow"
          style={{ background: "color-mix(in oklab, var(--chart-2) 24%, transparent)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[min(720px,95vw)] w-[min(720px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center, color-mix(in oklab, var(--chart-2) 35%, transparent) 0%, transparent 65%)"
          }}
          aria-hidden
        />

        <main id="landing-main" className="relative z-1 flex flex-1 flex-col">
          <section
            aria-labelledby="landing-hero-heading"
            className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-5 py-20 md:px-8 md:py-28"
          >
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
              <div className="flex flex-col gap-8">
                <div className="deployher-enter flex flex-wrap items-center gap-3">
                  <span className="topbar-chip text-muted-foreground px-4 py-2 text-sm">
                    {t("landing.chip")}
                  </span>
                  <Link
                    to="/why"
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                  >
                    {t("landing.whySelfHost")}
                    <span aria-hidden>→</span>
                  </Link>
                </div>
                <h1
                  id="landing-hero-heading"
                  className="deployher-enter deployher-enter-delay-1 font-serif text-pretty text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-7xl lg:leading-[1.02]"
                >
                  <span className="bg-linear-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                    {t("landing.heroTitle")}
                  </span>
                </h1>
                <p className="deployher-enter deployher-enter-delay-2 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  {t("landing.heroSubtitle")}
                </p>
                <div className="deployher-enter deployher-enter-delay-3 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
                  <Link
                    id="sign-in"
                    to="/login"
                    className="inline-flex h-12 items-center justify-center gap-2.5 rounded-md bg-primary px-7 text-base font-semibold text-primary-foreground no-underline shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_88%,black)] ring-1 ring-primary/35 transition-[opacity,transform] duration-200 hover:no-underline hover:opacity-95 active:scale-[0.99]"
                    aria-label={t("landing.signInGithubAria")}
                  >
                    <GitHubMark className="size-5 text-primary-foreground" />
                    {t("landing.signInGithub")}
                  </Link>
                  <a
                    href={GITHUB_URL}
                    className="border-input bg-background/60 text-foreground hover:bg-accent/80 inline-flex h-12 items-center justify-center rounded-md border px-7 text-base font-semibold no-underline backdrop-blur-sm transition-colors hover:no-underline"
                    rel="noopener noreferrer"
                  >
                   {t("landing.seeSource")}
                  </a>
                  <span className="font-mono text-sm text-muted-foreground sm:pl-1">
                    {t("common.oauthRepoScoped")}
                  </span>
                </div>
              </div>

              <div className="deployher-enter deployher-enter-delay-4 relative w-full lg:justify-self-end">
                <div
                  className="pointer-events-none absolute -inset-10 opacity-80 blur-2xl"
                  aria-hidden
                  style={{
                    background:
                      "radial-gradient(ellipse 80% 60% at 50% 80%, color-mix(in oklab, var(--primary) 22%, transparent), transparent 70%)"
                  }}
                />
                <div className="border-border/15 bg-accent/5 relative rounded-2xl border border-t-border/25 p-2 shadow-2xl sm:p-3">
                  <div
                    id="landing-terminal-root"
                    className="min-h-[min(36rem,58vh)]"
                    aria-busy="true"
                    aria-label={t("landing.terminalDemoAria")}
                  >
                    <LandingTerminalDemo />
                  </div>
                </div>
              </div>
            </div>

            <ul
              className="deployher-enter deployher-enter-delay-5 mt-16 grid gap-4 sm:grid-cols-3 lg:mt-20"
              aria-label={t("common.highlights")}
            >
              <li className="border-border/60 bg-card/40 rounded-2xl border px-5 py-5 backdrop-blur-sm">
                <p className="text-foreground text-base font-semibold sm:text-lg">{t("landing.highlight1Title")}</p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
                  {t("landing.highlight1Body")}
                </p>
              </li>
              <li className="border-border/60 bg-card/40 rounded-2xl border px-5 py-5 backdrop-blur-sm">
                <p className="text-foreground text-base font-semibold sm:text-lg">{t("landing.highlight2Title")}</p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
                  {t("landing.highlight2Body")}
                </p>
              </li>
              <li className="border-border/60 bg-card/40 rounded-2xl border px-5 py-5 backdrop-blur-sm">
                <p className="text-foreground text-base font-semibold sm:text-lg">{t("landing.highlight3Title")}</p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
                  {t("landing.highlight3Body")}
                </p>
              </li>
            </ul>
          </section>

          <footer className="border-border/80 relative z-1 border-t py-12 md:py-14">
            <nav
              aria-label={t("common.footer")}
              className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-10 px-5 text-base md:px-8"
            >
              <a
                href={GITHUB_URL}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2.5 font-medium transition-colors"
                rel="noopener noreferrer"
              >
                <GitHubMark className="size-5" />
                {t("common.github")}
              </a>
              {authenticated ? (
                <Link
                  to="/dashboard"
                  className="text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  {t("common.dashboard")}
                </Link>
              ) : (
                <Link
                  to="/login"
                  className="text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  {t("common.logIn")}
                </Link>
              )}
            </nav>
          </footer>
        </main>
      </div>
  </div>
  );
};

export { LandingPage };
