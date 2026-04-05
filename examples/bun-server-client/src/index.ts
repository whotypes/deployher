import path from "path";

const port = Number(process.env.PORT) || 3000;
const hostname = process.env.HOST ?? "0.0.0.0";

const indexPath = path.join(import.meta.dir, "..", "public", "index.html");

const loadIndexHtml = async (): Promise<string> => {
  const raw = await Bun.file(indexPath).text();
  const apiBaseJson = JSON.stringify(process.env.API_BASE_URL ?? "");
  return raw.replaceAll("__API_BASE__", apiBaseJson);
};

Bun.serve({
  hostname,
  port,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const html = await loadIndexHtml();
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "bun-server-client" }), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (url.pathname === "/api/info") {
      const base = process.env.API_BASE_URL?.trim() ?? "";
      return new Response(
        JSON.stringify({
          service: "bun-server-client",
          apiBaseUrl: base || null,
          mode: base ? "remote_api" : "same_origin_stub"
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.pathname === "/api/demo") {
      return new Response(
        JSON.stringify({
          message: "hello from bun-server-client (same-origin stub)",
          hint: "Set API_BASE_URL to a bun-server-api origin to call /api/hello remotely."
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
});

console.log(`bun-server-client listening on http://${hostname}:${port}`);
