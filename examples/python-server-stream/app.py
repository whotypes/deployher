import asyncio
import json

from starlette.applications import Starlette
from starlette.responses import HTMLResponse, PlainTextResponse, StreamingResponse
from starlette.routing import Route

INDEX_HTML = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>python-server-stream</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: ui-sans-serif, system-ui, sans-serif;
        line-height: 1.5;
      }
      body {
        margin: 2rem auto;
        max-width: 36rem;
        padding: 0 1rem;
      }
      pre {
        margin: 0;
        padding: 1rem;
        border-radius: 0.35rem;
        background: color-mix(in srgb, CanvasText 6%, Canvas);
        overflow: auto;
        font-size: 0.85rem;
      }
      button {
        font: inherit;
        margin-top: 1rem;
        padding: 0.45rem 0.85rem;
        border-radius: 0.35rem;
        cursor: pointer;
      }
      button:focus-visible {
        outline: 2px solid Highlight;
        outline-offset: 2px;
      }
    </style>
  </head>
  <body>
    <h1>python-server-stream</h1>
    <p>Server-Sent Events from Starlette, streamed into the log below. JSON discovery at
      <a href="/api/info">/api/info</a>, plain health at <a href="/health">/health</a>.</p>
    <pre id="meta" aria-label="Service metadata" style="margin-bottom:0.75rem;font-size:0.8rem;"></pre>
    <pre id="log" aria-live="polite"></pre>
    <button type="button" id="replay">Replay stream</button>
    <script>
      const logEl = document.getElementById("log");
      const metaEl = document.getElementById("meta");
      const replayBtn = document.getElementById("replay");
      let source = null;

      fetch("/api/info")
        .then((r) => r.json())
        .then((j) => {
          metaEl.textContent = JSON.stringify(j, null, 2);
        })
        .catch(() => {
          metaEl.textContent = "(could not load /api/info)";
        });

      const appendLine = (text) => {
        logEl.textContent += (logEl.textContent ? "\\n" : "") + text;
      };

      const startStream = () => {
        if (source) {
          source.close();
        }
        logEl.textContent = "";
        source = new EventSource("/stream");
        source.onmessage = (ev) => {
          try {
            const data = JSON.parse(ev.data);
            if (data.done) {
              appendLine("— done —");
              source.close();
              source = null;
              return;
            }
            appendLine(`step ${data.step}: ${data.message}`);
          } catch {
            appendLine(ev.data);
          }
        };
        source.onerror = () => {
          appendLine("(connection closed)");
          source.close();
          source = null;
        };
      };

      replayBtn.addEventListener("click", startStream);
      startStream();
    </script>
  </body>
</html>
"""


async def homepage(_request):
    return HTMLResponse(INDEX_HTML)


async def health(_request):
    return PlainTextResponse("ok")


async def api_info(_request):
    return PlainTextResponse(
        '{"service":"python-server-stream","routes":["/","/health","/api/info","/stream"]}',
        media_type="application/json",
    )


async def stream(_request):
    async def event_generator():
        for i in range(8):
            payload = json.dumps({"step": i, "message": f"chunk {i}"})
            yield f"data: {payload}\n\n".encode()
            await asyncio.sleep(0.22)
        yield f"data: {json.dumps({'done': True})}\n\n".encode()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


app = Starlette(
    routes=[
        Route("/", homepage),
        Route("/health", health),
        Route("/api/info", api_info),
        Route("/stream", stream),
    ],
)
