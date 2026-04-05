import { renderToReadableStream } from "react-dom/server";
import { GoogleFontsLinks } from "./GoogleFontsLinks";

const WhyPage = () => {
  const year = new Date().getUTCFullYear();

  return (
    <html lang="en" className="dark font-sans">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="dark" />
        <meta name="theme-color" content="#000000" />
        <title>Manifesto - Deployher</title>
        <meta
          name="description"
          content="Why self-host deploys: ownership, straight logs, and no surprise landlord roadmaps."
        />
        <GoogleFontsLinks />
        <link rel="stylesheet" href="/assets/app.css" />
      </head>
      <body className="bg-background text-foreground min-h-svh font-sans">
        <a
          href="#why-main"
          className="bg-background text-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to article
        </a>
        <div className="relative flex min-h-svh flex-col overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.04]"
            aria-hidden
            style={{
              backgroundImage: `linear-gradient(color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 1px),
              linear-gradient(90deg, color-mix(in oklab, var(--foreground) 18%, transparent) 1px, transparent 1px)`,
              backgroundSize: "56px 56px"
            }}
          />
          <div
            className="deployher-landing-glow pointer-events-none absolute -left-1/4 top-1/4 h-[min(520px,70vw)] w-[min(520px,70vw)] rounded-full blur-3xl animate-pulse-slow opacity-80"
            style={{ background: "color-mix(in oklab, var(--primary) 22%, transparent)" }}
            aria-hidden
          />
          <div
            className="deployher-landing-glow-alt pointer-events-none absolute -right-1/4 bottom-1/3 h-[min(420px,60vw)] w-[min(420px,60vw)] rounded-full blur-3xl animate-pulse-slow opacity-70"
            style={{ background: "color-mix(in oklab, var(--chart-2) 20%, transparent)" }}
            aria-hidden
          />

          <main
            id="why-main"
            className="relative z-1 mx-auto flex w-full max-w-xl flex-1 flex-col px-5 py-10 md:px-10 md:py-14 lg:py-16"
          >
            <article className="flex flex-col gap-8 md:gap-10">
              <a
                href="/"
                className="deployher-enter text-muted-foreground hover:text-chart-2 inline-flex w-fit items-center gap-1 rounded-md p-2 text-sm font-medium transition-colors focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="size-5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7 7-7m4" />
                </svg>
                Back
              </a>

              <header className="deployher-enter deployher-enter-delay-1 text-center">
                <h1 className="deployher-manifesto-title font-serif text-pretty text-4xl font-semibold leading-[1.08] tracking-tight md:text-5xl lg:text-6xl">
                  Manifesto
                </h1>
              </header>

              <div className="deployher-enter deployher-enter-delay-2 space-y-6 text-sm leading-relaxed text-muted-foreground md:text-base">
                <p>
                  All your pet projects don&apos;t have to die when the vendor does.
                  <br />
                  <br />
                  Free tiers vanished.
                  <br />
                  Replit turned into an AI-shill.
                  <br />
                  Vercel's CEO is friends with Netanyahu.
                  <br />
                  Heroku saw rapid growth and bailed on free tiers like it was nothing.
                </p>
                <p>
                  Every time a platform gets great for us developers:
                  <br />
                  <br />
                  Billing footnotes multiply,
                  <br />
                  Legacy plans sunset,
                  <br />
                  Things seem to be enshittified at record speed.
                </p>
                <p className="font-medium text-chart-2">But not on your metal.</p>
                <p>
                  Self-hosting isn&apos;t "just for nerds".
                  <br />
                  It's about being in control.
                </p>
                <p>
                  To the code you wrote.
                  <br />
                  The pet projects you had no where to run.
                  <br />
                  The commit you shipped at 3AM.
                  <br />
                  —still there on Monday.
                </p>
                <p>
                  Some say the easy-deploy era is over.
                  <br />
                  I think it never ended.
                  <br />
                  It just needed a home.
                </p>
                <p>
                  So I built Deployher. Not to replace the cloud.
                  <br />
                  <br />
                  But to keep what's yours, yours.
                </p>
                <p className="text-foreground group mt-8 text-lg font-medium italic md:text-xl">
                  So before the roadmap turns on us again,{" "}
                  <span className="relative inline-block not-italic">
                    <span
                      className="bg-chart-2/35 absolute -inset-x-1 -inset-y-0.5 -z-10 rounded-sm transition-transform duration-200 ease-out -rotate-1 group-hover:rotate-0"
                      aria-hidden
                    />
                    <a
                      href="/login"
                      className="text-foreground relative z-10 px-0.5 underline decoration-chart-2/50 underline-offset-4 transition-colors hover:decoration-chart-2"
                    >
                      run your own thing
                    </a>
                  </span>
                  .
                </p>
              </div>
            </article>

            <footer className="border-border/80 mt-16 border-t pt-10">
              <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-8 gap-y-3 text-sm">
                <a
                  href="/"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  Home
                </a>
                <a
                  href="https://deployher.com"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  rel="noopener noreferrer"
                >
                  Website
                </a>
                <a href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                  Sign in
                </a>
              </nav>
              <p className="text-muted-foreground mt-6 text-center text-xs">
                © {year} Deployher · Bun, containers, straight logs.
              </p>
            </footer>
          </main>
        </div>
      </body>
    </html>
  );
};

export const renderWhyPage = () => renderToReadableStream(<WhyPage />);
