# syntax=docker/dockerfile:1

FROM oven/bun:1.3.5 AS base
WORKDIR /usr/src/app

# unzip is required by deployment workers when extracting GitHub zipballs.
RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps-dev
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS deps-prod
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS builder
COPY --from=deps-dev /usr/src/app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run build:client

FROM base AS release
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV APP_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV SKIP_CLIENT_BUILD=1
ENV RUN_MIGRATIONS=1

COPY --from=deps-prod /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/src ./src
COPY --from=builder /usr/src/app/drizzle ./drizzle
COPY --from=builder /usr/src/app/dist/client ./dist/client
COPY --from=builder /usr/src/app/auth.ts ./auth.ts
COPY --from=builder /usr/src/app/migrate.ts ./migrate.ts
COPY --from=builder /usr/src/app/package.json ./package.json
COPY --from=builder /usr/src/app/tsconfig.json ./tsconfig.json
COPY --from=builder /usr/src/app/docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh \
  && chown -R bun:bun /usr/src/app

USER bun
EXPOSE 3000/tcp
ENTRYPOINT ["./docker/entrypoint.sh"]
