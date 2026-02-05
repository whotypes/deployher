import { renderToReadableStream } from "react-dom/server";

const LANDING_STYLE = `
  .landing-root {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0a0a0a;
    color: #ededed;
  }
  .landing-root .box {
    background: #111;
    border: 1px solid #333;
    max-width: 28rem;
  }
  .landing-root .button.is-primary {
    background: #fff;
    color: #000;
  }
  .landing-root .button.is-primary:hover {
    background: #e0e0e0;
    color: #000;
  }
`;

const LandingPage = () => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>pdploy – Self-hosted PaaS</title>
      <link
        rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css"
      />
      <style dangerouslySetInnerHTML={{ __html: LANDING_STYLE }} />
    </head>
    <body>
      <div className="landing-root">
        <div className="box px-6 py-6">
          <h1 className="title is-4" style={{ color: "#ededed" }}>
            pdploy
          </h1>
          <p className="mb-5" style={{ color: "#888" }}>
            Self-hosted PaaS. Deploy from GitHub, preview on subdomains.
          </p>
          <a
            href="/login"
            className="button is-primary"
            aria-label="Sign in to pdploy"
          >
            Sign in with GitHub
          </a>
        </div>
      </div>
    </body>
  </html>
);

export const renderLandingPage = () =>
  renderToReadableStream(<LandingPage />);
