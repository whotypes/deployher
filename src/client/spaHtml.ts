import path from "node:path";
import { getEmbeddedClientAsset } from "./embeddedAssets";
import { clientOutDir } from "./build";

const indexPath = () => path.join(clientOutDir, "index.html");

export const readSpaIndexHtml = async (): Promise<string | null> => {
  const file = Bun.file(indexPath());
  if (await file.exists()) {
    return file.text();
  }
  const embedded = getEmbeddedClientAsset("index.html");
  if (embedded) {
    return embedded.blob.text();
  }
  return null;
};

export const buildSpaHtmlResponse = (html: string, csrfToken: string): Response => {
  const injected =
    csrfToken.length > 0
      ? html.replace(
          "<head>",
          `<head>\n    <meta name="csrf-token" content="${csrfToken.replace(/"/g, "&quot;")}" />`
        )
      : html;
  return new Response(injected, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });
};

export const spaHtmlUnavailable = (): Response =>
  new Response(
    "<!doctype html><html><body><p>Client not built. Run <code>bun run build:client</code>.</p></body></html>",
    { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
