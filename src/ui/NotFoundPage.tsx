import { renderToReadableStream } from "react-dom/server";
import { GoogleFontsLinks } from "./GoogleFontsLinks";

const NotFoundPage = () => (
  <html lang="en" className="dark font-sans">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <meta name="theme-color" content="#000000" />
      <title>Page not found – Deployher</title>
      <GoogleFontsLinks />
      <link rel="stylesheet" href="/assets/app.css" />
    </head>
    <body className="bg-background text-foreground min-h-svh font-sans">
      <div className="flex min-h-svh flex-col items-center justify-center px-4 py-16">
        <div className="dashboard-surface w-full max-w-md px-8 py-10 text-center">
          <p className="eyebrow-label mb-3">Routing</p>
          <p
            className="font-serif text-[clamp(4.5rem,18vw,7rem)] font-semibold leading-none tracking-tight text-primary/90"
            aria-hidden="true"
          >
            404
          </p>
          <h1 className="mt-4 font-serif text-2xl font-semibold tracking-tight text-foreground">Page not found</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            The path you requested is not mapped to an app route. Double-check the URL or return to the dashboard.
          </p>
          <a
            href="/dashboard"
            className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground no-underline ring-1 ring-primary/30 transition-[opacity,transform] duration-200 hover:no-underline hover:opacity-95 active:scale-[0.99]"
            aria-label="Go to dashboard"
          >
            Back to dashboard
          </a>
        </div>
      </div>
    </body>
  </html>
);

export const renderNotFoundPage = () =>
  renderToReadableStream(<NotFoundPage />);
