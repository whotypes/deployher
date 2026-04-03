import { renderToReadableStream } from "react-dom/server";

const LandingPage = () => (
  <html lang="en" className="dark">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <title>pdploy – Self-hosted PaaS</title>
      <link rel="stylesheet" href="/assets/app.css" />
    </head>
    <body className="bg-background text-foreground min-h-svh flex items-center justify-center">
      <div className="w-full max-w-sm mx-4 rounded-lg border border-border bg-card p-8 shadow-lg">
        <h1 className="text-xl font-semibold mb-2">pdploy</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Self-hosted PaaS. Deploy from GitHub, preview on subdomains.
        </p>
        <a
          href="/login"
          className="inline-flex items-center justify-center w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium transition-colors hover:bg-primary/90 no-underline hover:no-underline"
          aria-label="Sign in to pdploy"
        >
          Sign in with GitHub
        </a>
      </div>
    </body>
  </html>
);

export const renderLandingPage = () =>
  renderToReadableStream(<LandingPage />);
