const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST ?? "0.0.0.0";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...Object.fromEntries(new Headers(init.headers ?? {}))
    }
  });

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, {
    ...init,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...Object.fromEntries(new Headers(init.headers ?? {}))
    }
  });

const routesDoc = [
  { path: "/health", note: "liveness JSON" },
  { path: "/api/hello", note: "greeting; optional ?name=" },
  { path: "/api/version", note: "build metadata" },
  { path: "/api/time", note: "server time (ISO)" }
] as const;

Bun.serve({
  hostname,
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (url.pathname === "/" || url.pathname === "") {
      const list = routesDoc
        .map(
          (r) =>
            `<li><a href="${r.path}"><code>${r.path}</code></a> — ${r.note}</li>`
        )
        .join("");
      return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>bun-server-api</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.5; }
    body { margin: 0 auto; max-width: 40rem; padding: 1.5rem 1rem 3rem; }
    h1 { font-size: 1.35rem; }
    ul { padding-left: 1.1rem; }
    code { font-size: 0.9em; }
    .panel { margin-top: 1.25rem; padding: 1rem; border-radius: 0.5rem; border: 1px solid color-mix(in srgb, CanvasText 14%, transparent); }
    .hint { color: color-mix(in srgb, CanvasText 55%, transparent); font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>bun-server-api</h1>
  <p class="hint">JSON API with CORS for split frontends. Try the links below or call from <code>bun-server-client</code> with <code>API_BASE_URL</code>.</p>
  <div class="panel">
    <p><strong>Routes</strong></p>
    <ul>${list}</ul>
  </div>
</body>
</html>`);
    }
    if (url.pathname === "/health") {
      return json({ ok: true, service: "bun-server-api" });
    }
    if (url.pathname === "/api/hello") {
      const name = url.searchParams.get("name")?.trim();
      return json({
        message: name ? `hello, ${name}` : "hello from bun-server-api",
        echoedName: name ?? null
      });
    }
    if (url.pathname === "/api/version") {
      return json({
        name: "bun-server-api",
        runtime: typeof Bun !== "undefined" ? `bun ${Bun.version}` : "unknown"
      });
    }
    if (url.pathname === "/api/time") {
      return json({ iso: new Date().toISOString() });
    }
    return json({ error: "not_found" }, { status: 404 });
  }
});

console.log(`bun-server-api listening on http://${hostname}:${port}`);
