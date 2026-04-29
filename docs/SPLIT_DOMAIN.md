# Split-domain production setup (marketing, dash, API)

Use this when **apex** serves the static Astro landing, **`dash.`** serves the dashboard SPA + `/login`, and **`api.`** serves Better Auth and `/api/*`. The repo routes all public hostnames through **`deployher-edge`** (Caddy); see [`docker/edge-entry.sh`](../docker/edge-entry.sh).

## 1. DNS (e.g. Spaceship)

Point **every** hostname below at the **same** public IPv4/IPv6 or load balancer that reaches **`deployher-edge:3000`** (often via an outer TLS proxy on the host).

| Name | Type | Typical value | Role |
|------|------|----------------|------|
| `@` (apex) | A | your server / LB IP | Landing (`marketing` nginx, Astro static build) |
| `www` | A or CNAME | same as apex | Optional second landing hostname |
| `dash` | A or CNAME | same target | Dashboard SPA |
| `api` | A or CNAME | same target | Better Auth + API |
| `*` (wildcard) | A or CNAME | same target | Deployment previews (`*.yourdomain.com`) |

After saving records, verify with `dig deployher.com`, `dig dash.deployher.com`, `dig api.deployher.com`, and a wildcard label before debugging TLS or the app.

## 2. Edge: host-based routing

In `.env` (used by Compose for **`edge`**):

```bash
DEPLOYHER_EDGE_USE_PATH_ROUTING=0
DEPLOYHER_PRIMARY_DOMAIN=deployher.com
DEPLOYHER_LANDING_HOSTNAMES=deployher.com www.deployher.com
DEPLOYHER_DASH_HOSTNAME=dash.deployher.com
DEPLOYHER_API_HOSTNAME=api.deployher.com
```

`DEPLOYHER_LANDING_HOSTNAMES` must list every hostname that should serve the **marketing** container. Omit `www` from the list if you do not use it.

## 3. Runtime environment (`app-api`, workers, secrets)

Set at least the following in `.env` (same file Compose loads for **`app-api`**):

```bash
PROD_PROTOCOL=https
PROD_DOMAIN=deployher.com
DEPLOYHER_COOKIE_DOMAIN=.deployher.com
BETTER_AUTH_URL=https://api.deployher.com
```

- **`BETTER_AUTH_URL`** must be the **public origin of the API host** (no trailing slash).
- **`DEPLOYHER_COOKIE_DOMAIN`** is usually **`.deployher.com`** so session cookies work across `api` and `dash` subdomains.
- **`PROD_DOMAIN`** must match the apex used for preview URLs (`<id>.<PROD_DOMAIN>`).

Optional: **`DEPLOYHER_EXTRA_TRUSTED_ORIGINS`** for staging or extra origins (see [`.env.example`](../.env.example)).

## 4. GitHub OAuth

In the GitHub OAuth App settings, set **Authorization callback URL** to:

```text
https://api.deployher.com/api/auth/callback/github
```

Use your real **`DEPLOYHER_API_HOSTNAME`** instead of `api.deployher.com` if it differs. This must match **`BETTER_AUTH_URL`** + `/api/auth/callback/github`.

## 5. Frontend build args (dashboard + marketing)

When **`dash`** and **`api`** differ by hostname, bake public origins at **image build** time:

```bash
export VITE_PUBLIC_API_ORIGIN=https://api.deployher.com
export VITE_PUBLIC_DASH_ORIGIN=https://dash.deployher.com
docker compose build --no-cache app-api marketing
docker compose up -d
```

Compose passes these as build args to [`Dockerfile`](../Dockerfile) (`build:web`) and [`docker/marketing.Dockerfile`](../docker/marketing.Dockerfile) (`build:marketing`). Change them whenever public URLs change, then rebuild **both** images.

## 6. TLS and outer reverse proxy

If Nginx (or another proxy) terminates HTTPS and forwards to **`127.0.0.1:3000`** (Caddy), preserve the original host and client IP so Bun and preview routing behave:

```nginx
proxy_set_header Host $host;
proxy_set_header X-Forwarded-Host $host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
```

Use long timeouts and disable buffering for streaming routes (see [SETUP.md](./SETUP.md) “Hetzner Ubuntu VPS with Nginx”).

## 7. Smoke test

1. Open `https://deployher.com` — static marketing loads from **`marketing`**.
2. Click sign-in / dashboard — browser goes to `https://dash.deployher.com/...`.
3. OAuth completes via `https://api.deployher.com`; session works on **`dash`** for `/api/*` calls with credentials.

## See also

- [DEPLOYMENT.md](./DEPLOYMENT.md) — container roles and preview host routing
- [SETUP.md](./SETUP.md) — OAuth, env, and production notes
