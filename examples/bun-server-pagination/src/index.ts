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

type ItemStatus = "building" | "failed" | "ready";

const ITEMS: Array<{ id: string; title: string; status: ItemStatus }> = Array.from(
  { length: 47 },
  (_, i) => ({
    id: `item-${i + 1}`,
    title: `Deployment ${i + 1}`,
    status: (i % 5 === 0 ? "building" : i % 7 === 0 ? "failed" : "ready") as ItemStatus
  })
);

const clampInt = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null || value === "") return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const parseStatusFilter = (raw: string | null): ItemStatus[] | null => {
  if (raw === null || raw === "") return null;
  const allowed: ItemStatus[] = ["building", "failed", "ready"];
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const picked = parts.filter((p): p is ItemStatus => allowed.includes(p as ItemStatus));
  return picked.length ? picked : null;
};

Bun.serve({
  hostname,
  port,
  fetch(req) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (url.pathname === "/health") {
      return json({ ok: true, service: "bun-server-pagination" });
    }

    const itemMatch = /^\/api\/items\/([^/]+)$/.exec(url.pathname);
    if (itemMatch) {
      const id = itemMatch[1];
      const item = ITEMS.find((x) => x.id === id);
      if (!item) return json({ error: "not_found" }, { status: 404 });
      return json({ item });
    }

    if (url.pathname === "/api/items") {
      const statusFilter = parseStatusFilter(url.searchParams.get("status"));
      const base = statusFilter
        ? ITEMS.filter((x) => statusFilter.includes(x.status))
        : ITEMS;
      const limit = clampInt(url.searchParams.get("limit"), 10, 1, 50);
      const total = base.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      let page = clampInt(url.searchParams.get("page"), 1, 1, totalPages);
      page = Math.min(page, totalPages);
      const start = (page - 1) * limit;
      const items = base.slice(start, start + limit);
      return json({
        items,
        page,
        limit,
        total,
        totalPages,
        statusFilter: statusFilter ?? "all"
      });
    }

    if (url.pathname === "/" || url.pathname === "") {
      return html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>bun-server-pagination</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: #f4f4f5;
      --surface: #fff;
      --text: #18181b;
      --muted: #71717a;
      --border: #e4e4e7;
      --accent: #2563eb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #09090b;
        --surface: #18181b;
        --text: #fafafa;
        --muted: #a1a1aa;
        --border: #27272a;
        --accent: #3b82f6;
      }
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; font-family: ui-sans-serif, system-ui, sans-serif; background: var(--bg); color: var(--text); line-height: 1.5; }
    header { padding: 1.25rem 1rem; border-bottom: 1px solid var(--border); background: var(--surface); }
    header h1 { margin: 0 0 0.35rem; font-size: 1.2rem; }
    header p { margin: 0; color: var(--muted); font-size: 0.9rem; max-width: 44rem; }
    main { max-width: 44rem; margin: 0 auto; padding: 1rem 1rem 2.5rem; }
    .controls { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; margin-bottom: 1rem; }
    label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; color: var(--muted); }
    select, input { font: inherit; padding: 0.35rem 0.5rem; border-radius: 0.35rem; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
    button { font: inherit; cursor: pointer; padding: 0.4rem 0.85rem; border-radius: 0.35rem; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
    button.primary { background: var(--accent); color: #fff; border-color: var(--accent); }
    button:focus-visible, select:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem 1rem; }
    ul { list-style: none; margin: 0; padding: 0; }
    li { display: flex; justify-content: space-between; gap: 0.75rem; padding: 0.55rem 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
    li:last-child { border-bottom: none; }
    .badge { font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; padding: 0.15rem 0.4rem; border-radius: 0.25rem; }
    .ready { background: color-mix(in srgb, #22c55e 20%, transparent); color: #16a34a; }
    .building { background: color-mix(in srgb, var(--accent) 22%, transparent); color: var(--accent); }
    .failed { background: color-mix(in srgb, #ef4444 20%, transparent); color: #dc2626; }
    .meta { font-size: 0.8rem; color: var(--muted); margin-top: 0.5rem; }
    .error { color: #dc2626; font-size: 0.9rem; }
    .json-link { font-size: 0.85rem; margin-top: 1rem; }
    .json-link a { color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <h1>bun-server-pagination</h1>
    <p>Live UI backed by <code>/api/items</code> with <code>page</code>, <code>limit</code>, and optional <code>status</code> (comma-separated: ready, building, failed).</p>
  </header>
  <main>
    <div class="controls">
      <label>Status
        <select id="status" aria-label="Filter by status">
          <option value="">All</option>
          <option value="ready">Ready</option>
          <option value="building">Building</option>
          <option value="failed">Failed</option>
          <option value="ready,building">Ready + building</option>
        </select>
      </label>
      <label>Per page
        <input id="limit" type="number" min="1" max="50" value="10" aria-label="Items per page" />
      </label>
      <button type="button" class="primary" id="reload">Reload</button>
    </div>
    <p id="err" class="error" role="alert" hidden></p>
    <div class="panel">
      <ul id="list" aria-live="polite"></ul>
      <div class="meta" id="summary"></div>
      <div style="display:flex; gap:0.5rem; margin-top:0.75rem; flex-wrap:wrap;">
        <button type="button" id="prev" aria-label="Previous page">Previous</button>
        <button type="button" id="next" aria-label="Next page">Next</button>
      </div>
    </div>
    <p class="json-link">Raw JSON: <a id="raw" href="/api/items">/api/items</a> · single item: <a href="/api/items/item-1">/api/items/item-1</a></p>
  </main>
  <script>
    const listEl = document.getElementById("list");
    const summaryEl = document.getElementById("summary");
    const errEl = document.getElementById("err");
    const statusEl = document.getElementById("status");
    const limitEl = document.getElementById("limit");
    const prevBtn = document.getElementById("prev");
    const nextBtn = document.getElementById("next");
    const rawLink = document.getElementById("raw");
    let page = 1;
    let totalPages = 1;

    const badgeClass = (s) => (s === "ready" ? "ready" : s === "building" ? "building" : "failed");

    const buildQuery = () => {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", limitEl.value || "10");
      const st = statusEl.value;
      if (st) params.set("status", st);
      return params.toString();
    };

    const syncRawLink = () => {
      rawLink.href = "/api/items?" + buildQuery();
    };

    const load = async () => {
      errEl.hidden = true;
      syncRawLink();
      const res = await fetch("/api/items?" + buildQuery());
      if (!res.ok) {
        errEl.textContent = "Request failed (" + res.status + ")";
        errEl.hidden = false;
        return;
      }
      const data = await res.json();
      totalPages = data.totalPages;
      page = data.page;
      listEl.innerHTML = "";
      for (const it of data.items) {
        const li = document.createElement("li");
        li.innerHTML = '<span></span><span class="badge"></span>';
        li.children[0].textContent = it.title + " (" + it.id + ")";
        const b = li.children[1];
        b.textContent = it.status;
        b.classList.add("badge", badgeClass(it.status));
        listEl.appendChild(li);
      }
      summaryEl.textContent = "Page " + data.page + " of " + data.totalPages + " · " + data.total + " items (filter: " + (Array.isArray(data.statusFilter) ? data.statusFilter.join(", ") : data.statusFilter) + ")";
      prevBtn.disabled = page <= 1;
      nextBtn.disabled = page >= totalPages;
    };

    document.getElementById("reload").addEventListener("click", () => { page = 1; load(); });
    prevBtn.addEventListener("click", () => { page = Math.max(1, page - 1); load(); });
    nextBtn.addEventListener("click", () => { page = Math.min(totalPages, page + 1); load(); });
    statusEl.addEventListener("change", () => { page = 1; load(); });
    limitEl.addEventListener("change", () => { page = 1; load(); });
    load();
  </script>
</body>
</html>`);
    }
    return json({ error: "not_found" }, { status: 404 });
  }
});

console.log(`bun-server-pagination listening on http://${hostname}:${port}`);
