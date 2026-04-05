import { renderToReadableStream } from "react-dom/server";
import { GitHubMark } from "./GitHubMark";
import { GoogleFontsLinks } from "./GoogleFontsLinks";

export type LandingPageProps = {
  authenticated: boolean;
};

const GITHUB_URL = "https://github.com/whotypes/deployher";

const LandingPage = ({ authenticated }: LandingPageProps) => (
  <html lang="en" className="dark font-sans">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <meta name="theme-color" content="#000000" />
      <title>Deployher – Self-hosted PaaS</title>
      <meta
        name="description"
        content="Deployher connects GitHub to isolated builds and previews. Learn more at deployher.com."
      />
      <GoogleFontsLinks />
      <link rel="stylesheet" href="/assets/app.css" />
    </head>
    <body className="bg-background text-foreground min-h-svh font-sans text-base">
      <a
        href="#landing-main"
        className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
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
                    Self-hosted PaaS
                  </span>
                  <a
                    href="/why"
                    className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm font-medium transition-colors"
                  >
                    Why self-host
                    <span aria-hidden>→</span>
                  </a>
                </div>
                <h1
                  id="landing-hero-heading"
                  className="deployher-enter deployher-enter-delay-1 font-serif text-pretty text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl lg:text-7xl lg:leading-[1.02]"
                >
                  <span className="bg-linear-to-b from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                    Finally. Your metal, your rules.
                  </span>
                </h1>
                <p className="deployher-enter deployher-enter-delay-2 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                  Deployher is a self-hosted PaaS that runs on a single VPS node, featuring isolated builds, log streams, and live previews.
                </p>
                <div className="deployher-enter deployher-enter-delay-3 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center">
                  <a
                    id="sign-in"
                    href="/login"
                    className="inline-flex h-12 items-center justify-center gap-2.5 rounded-md bg-primary px-7 text-base font-semibold text-primary-foreground no-underline shadow-[0_14px_40px_-18px_color-mix(in_oklab,var(--primary)_88%,black)] ring-1 ring-primary/35 transition-[opacity,transform] duration-200 hover:no-underline hover:opacity-95 active:scale-[0.99]"
                    aria-label="Sign in to Deployher with GitHub"
                  >
                    <GitHubMark className="size-5 text-primary-foreground" />
                    Sign in with GitHub
                  </a>
                  <a
                    href={GITHUB_URL}
                    className="border-input bg-background/60 text-foreground hover:bg-accent/80 inline-flex h-12 items-center justify-center rounded-md border px-7 text-base font-semibold no-underline backdrop-blur-sm transition-colors hover:no-underline"
                    rel="noopener noreferrer"
                  >
                   See The Source
                  </a>
                  <span className="font-mono text-sm text-muted-foreground sm:pl-1">
                    OAuth · repo-scoped
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
                    aria-label="Animated terminal demo: build, deploy, and logs"
                  >
                    <div className="text-muted-foreground flex min-h-[min(36rem,58vh)] items-center justify-center rounded-xl border border-dashed border-border/40 bg-background/30 p-8 text-center font-mono text-lg">
                      Loading terminal demo…
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <ul
              className="deployher-enter deployher-enter-delay-5 mt-16 grid gap-4 sm:grid-cols-3 lg:mt-20"
              aria-label="Highlights"
            >
              <li className="border-border/60 bg-card/40 rounded-2xl border px-5 py-5 backdrop-blur-sm">
                <p className="text-foreground text-base font-semibold sm:text-lg">Isolated workers</p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
                  Containerized builds, no noisy neighbors.
                </p>
              </li>
              <li className="border-border/60 bg-card/40 rounded-2xl border px-5 py-5 backdrop-blur-sm">
                <p className="text-foreground text-base font-semibold sm:text-lg">Honest logs</p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
                  Stream stdout like you are SSH’d in.
                </p>
              </li>
              <li className="border-border/60 bg-card/40 rounded-2xl border px-5 py-5 backdrop-blur-sm">
                <p className="text-foreground text-base font-semibold sm:text-lg">Bun-native</p>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed sm:text-base">
                  Fast toolchain for Node-style apps.
                </p>
              </li>
            </ul>
          </section>

          <footer className="border-border/80 relative z-1 border-t py-12 md:py-14">
            <nav
              aria-label="Footer"
              className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-10 px-5 text-base md:px-8"
            >
              <a
                href={GITHUB_URL}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2.5 font-medium transition-colors"
                rel="noopener noreferrer"
              >
                <GitHubMark className="size-5" />
                GitHub
              </a>
              {authenticated ? (
                <a
                  href="/dashboard"
                  className="text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  Dashboard
                </a>
              ) : (
                <a
                  href="/login"
                  className="text-muted-foreground hover:text-foreground font-medium transition-colors"
                >
                  Log in
                </a>
              )}
            </nav>
          </footer>
        </main>
      </div>
      <script src="/assets/landing-page.js" type="module" />
    </body>
  </html>
);

export const renderLandingPage = (props: LandingPageProps) =>
  renderToReadableStream(<LandingPage {...props} />);
