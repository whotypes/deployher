# python-server-stream

Minimal Starlette app that streams **Server-Sent Events** from `GET /stream`. The home page uses `EventSource` to print each chunk.

This is **not** the usual Deployher Python path (`pyproject.toml` + static `dist/`). The hosted Python strategy only publishes static HTML. To run this app as a **server** preview, point Deployher at the Dockerfile.

## Deployher project settings

With default project settings, the worker reads **`deployher.toml`** in this folder and applies server + Dockerfile + port `3000`. Once you change those fields in the dashboard, the repo file no longer overrides them.

1. **Preview type**: Server (not Static), or leave Auto if `deployher.toml` is present with defaults.
2. **Skip host strategy build**: Skipped (Dockerfile-only), or rely on `deployher.toml` when project settings are still defaults.
3. **Runtime container port**: `3000` (matches `EXPOSE` and `uvicorn --port`).
4. **Runtime image mode**: `dockerfile` (always build from this Dockerfile) or `auto` if you rely on the repo Dockerfile when present.

See [docs/DEPLOYMENT.md](../../docs/DEPLOYMENT.md) for workspace roots, `dockerfilePath`, and security notes on Dockerfile builds.

## Docker (local)

`docker compose up --build` maps host **3000** → container **3000** (see `docker-compose.yml`).

## Local run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 3000
```

Open http://127.0.0.1:3000 — the log fills as SSE events arrive. `GET /health` returns plain `ok`.
