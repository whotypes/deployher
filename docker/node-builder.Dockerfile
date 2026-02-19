ARG NEXUS_REGISTRY=localhost:8082
FROM ${NEXUS_REGISTRY}/node:22-bookworm

RUN corepack enable \
  && corepack prepare pnpm@9.15.9 --activate \
  && pnpm --version
