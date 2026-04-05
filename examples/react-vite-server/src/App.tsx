import { useCallback, useMemo, useState, type KeyboardEvent } from "react";

type DeploymentStatus = "ready" | "building" | "failed";

type Deployment = {
  id: string;
  name: string;
  status: DeploymentStatus;
};

const PAGE_SIZE = 5;

const INITIAL: Deployment[] = [
  { id: "dpl_8k2m", name: "marketing-site", status: "ready" },
  { id: "dpl_9x1q", name: "api-worker", status: "building" },
  { id: "dpl_3n7p", name: "docs", status: "ready" },
  { id: "dpl_2h4w", name: "preview-app", status: "failed" },
  { id: "dpl_6r9t", name: "dashboard", status: "ready" },
  { id: "dpl_1a5c", name: "blog", status: "ready" },
  { id: "dpl_7b3d", name: "auth-service", status: "building" },
  { id: "dpl_4e8f", name: "cdn-assets", status: "ready" },
  { id: "dpl_0z6g", name: "experiments", status: "failed" },
  { id: "dpl_5y2h", name: "status-page", status: "ready" },
  { id: "dpl_9j1k", name: "checkout-ui", status: "ready" },
  { id: "dpl_3l4m", name: "admin", status: "building" }
];

const statusClass = (s: DeploymentStatus): string => {
  if (s === "ready") return "status-ready";
  if (s === "building") return "status-building";
  return "status-failed";
};

const App = () => {
  const [rows, setRows] = useState<Deployment[]>(() => [...INITIAL]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DeploymentStatus>("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((d) => {
      if (statusFilter !== "all" && d.status !== statusFilter) return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q) || d.id.toLowerCase().includes(q);
    });
  }, [query, rows, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const counts = useMemo(() => {
    let ready = 0;
    let building = 0;
    let failed = 0;
    for (const d of filtered) {
      if (d.status === "ready") ready += 1;
      else if (d.status === "building") building += 1;
      else failed += 1;
    }
    return { ready, building, failed };
  }, [filtered]);

  const handleShuffle = useCallback(() => {
    setRows((prev) => [...prev].sort(() => Math.random() - 0.5));
    setPage(1);
  }, []);

  const handlePrev = useCallback(() => {
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const handleNext = useCallback(() => {
    setPage((p) => Math.min(totalPages, p + 1));
  }, [totalPages]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    },
    [handleNext, handlePrev]
  );

  return (
    <div className="app" onKeyDown={handleKeyDown} role="presentation" tabIndex={0}>
      <header className="header">
        <h1>react-vite-server</h1>
        <p>
          Same UI as the static example, but Deployher runs <code>vite preview</code> after{" "}
          <code>npm run build</code>. The preview server binds <code>0.0.0.0</code> and uses{" "}
          <code>process.env.PORT</code> (default container port <strong>3000</strong>), not Vite dev&apos;s{" "}
          <strong>5173</strong>. See <code>deployher.toml</code> and <code>package.json#deployher</code>.
        </p>
      </header>

      <main className="main">
        <div className="stats" aria-label="Filtered deployment counts">
          <div className="stat">
            <strong>{counts.ready}</strong>
            <span>Ready</span>
          </div>
          <div className="stat">
            <strong>{counts.building}</strong>
            <span>Building</span>
          </div>
          <div className="stat">
            <strong>{counts.failed}</strong>
            <span>Failed</span>
          </div>
        </div>

        <div className="filters">
          <label className="sr-only" htmlFor="search-q">
            Filter by name or id
          </label>
          <input
            id="search-q"
            type="search"
            className="search"
            placeholder="Filter by name or deployment id…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            autoComplete="off"
            aria-label="Filter by name or deployment id"
          />
          <div className="chips" role="group" aria-label="Filter by status">
            {(["all", "ready", "building", "failed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                aria-pressed={statusFilter === s}
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
              >
                {s === "all" ? "All" : s}
              </button>
            ))}
          </div>
        </div>

        <section className="panel" aria-labelledby="deploy-heading">
          <h2 id="deploy-heading">Recent deployments</h2>
          <p className="hint" aria-live="polite">
            {filtered.length === rows.length
              ? `Showing all ${rows.length} mock deployments.`
              : `Showing ${filtered.length} of ${rows.length} deployments.`}{" "}
            Focus the page (click outside inputs) and use ← → to paginate.
          </p>
          <ul className="list">
            {slice.length === 0 ? (
              <li className="empty">No deployments match the current filters.</li>
            ) : (
              slice.map((d) => (
                <li key={d.id}>
                  <span className="name">{d.name}</span>
                  <span className="meta">
                    <span className="id">{d.id}</span>
                    <span className={`status ${statusClass(d.status)}`} aria-label="Status">
                      {d.status}
                    </span>
                  </span>
                </li>
              ))
            )}
          </ul>
          <div className="toolbar">
            <div className="pager">
              <button type="button" onClick={handlePrev} disabled={safePage <= 1} aria-label="Previous page">
                Previous
              </button>
              <span aria-live="polite">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={handleNext}
                disabled={safePage >= totalPages}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
            <button type="button" className="primary" onClick={handleShuffle} aria-label="Shuffle demo data">
              Shuffle demo
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;
