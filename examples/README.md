# Example projects

Small repos you can push to GitHub and connect to Deployher.

## Routes by example

| Example | Routes / URLs |
|--------|----------------|
| **node-npm-static**, **node-pnpm-static**, **node-yarn-static**, **node-bun-static** | `/` (or `/index.html`) — single-page UI: stats, search, status chips, pagination |
| **bun-server-api** | `/` HTML index · `GET /health` · `GET /api/hello` (optional `?name=`) · `GET /api/version` · `GET /api/time` · `OPTIONS` for CORS |
| **bun-server-pagination** | `/` interactive UI · `GET /health` · `GET /api/items` (`page`, `limit`, optional `status=ready,building,failed`) · `GET /api/items/:id` |
| **bun-server-client** | `/` dashboard · `GET /health` · `GET /api/info` · `GET /api/demo` (same-origin stub when `API_BASE_URL` unset) |
| **python-mkdocs-pip** | MkDocs site: `/` home, `/guide/`, `/features/` (paths depend on MkDocs `use_directory_urls`; default is pretty URLs) |
| **python-deployher-pip** | Static `/` from `dist/index.html` after `buildCommand` |
| **python-server-stream** | `/` HTML + SSE UI · `GET /health` (plain `ok`) · `GET /api/info` (JSON) · `GET /stream` (SSE) |
| **react-vite-static** | SPA at `/` after `vite build` → static `dist/` (client-side routing stays on `/` unless you add a router) |
| **react-vite-server** | SPA at `/` served by `vite preview` on the runtime port (default **3000** via `PORT` / `deployher.toml`) |

## Using these with Deployher

1. Copy or fork one of these directories into its own Git repository.
2. Commit and push to GitHub.
3. Create a Deployher project using that repo URL and branch.

## Notes

- Deployher runs **`npm ci`** for Node installs, so **`package-lock.json` must be committed** and kept in sync with `package.json` (run `npm install` after dependency changes).
- `bun-server-api` sends CORS headers suitable for browser calls from another origin (e.g. `bun-server-client` with `API_BASE_URL`).
- `python-server-stream` uses a **Dockerfile** — not the static Python build path; see that folder’s `README.md` for Server preview / build strategy.
- **Vite ports:** `npm run dev` uses **5173** by default (local only). Deployher does not use the dev server: **static** examples ship `dist/`; **react-vite-server** runs `vite preview`, which reads `preview.port` from `vite.config.ts` — we set it from `process.env.PORT` so it matches `runtime_container_port` (default **3000**). Change both places if you pick another port.
