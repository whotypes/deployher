import { renderToReadableStream } from "react-dom/server";

const ERROR_BG_STYLE = `
  .error-bg {
    background-image: url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%201600%20900%22%3E%3Cpath%20fill%3D%22%230066cc%22%20d%3D%22M957%20450%20539%20900h857z%22%2F%3E%3Cpath%20fill%3D%22%230052a3%22%20d%3D%22m957%20450-84.1%20450H1396zM-60%20900l458-238%20418%20238z%22%2F%3E%3Cpath%20fill%3D%22%230052a3%22%20d%3D%22m337%20900%2061-238%20418%20238zm866-354%20349%20354H876z%22%2F%3E%3Cpath%20fill%3D%22%23003d7a%22%20d%3D%22m1203%20546%20349%20354h-390z%22%2F%3E%3Cpath%20fill%3D%22%230066cc%22%20d%3D%22m641%20695%20245%20205H367z%22%2F%3E%3Cpath%20fill%3D%22%230052a3%22%20d%3D%22m587%20900%2054-205%20245%20205zm1123%200-309-268-305%20268z%22%2F%3E%3Cpath%20fill%3D%22%23003d7a%22%20d%3D%22m1710%20900-309-268-36%20268z%22%2F%3E%3Cpath%20fill%3D%22%230066cc%22%20d%3D%22M1210%20900%20971%20687%20725%20900z%22%2F%3E%3Cpath%20fill%3D%22%230052a3%22%20d%3D%22M943%20900h267L971%20687z%22%2F%3E%3C%2Fsvg%3E");
  }
`;

const NotFoundPage = () => (
  <html lang="en" className="dark">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <title>Page not found – pdploy</title>
      <link rel="stylesheet" href="/assets/app.css" />
      <style dangerouslySetInnerHTML={{ __html: ERROR_BG_STYLE }} />
    </head>
    <body>
      <div className="error-bg min-h-svh flex items-center justify-center bg-cover bg-fixed">
        <div className="text-center text-white mt-[-13rem]">
          <h1 className="text-[8rem] font-bold leading-none tracking-tight drop-shadow-lg" aria-hidden="true">
            <span>4</span>
            <span>0</span>
            <span>4</span>
          </h1>
          <h2 className="text-xl font-semibold mt-4">Page not found</h2>
          <p className="text-white/80 mt-2 mb-8">
            Hey, looks like you&apos;ve hit a mountain. The page you&apos;re looking for doesn&apos;t exist.
          </p>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md px-6 py-2 text-sm font-medium text-white border border-white/40 bg-white/10 hover:bg-white/20 transition-colors no-underline hover:no-underline"
            aria-label="Return to home"
          >
            Return to home
          </a>
        </div>
      </div>
    </body>
  </html>
);

export const renderNotFoundPage = () =>
  renderToReadableStream(<NotFoundPage />);
