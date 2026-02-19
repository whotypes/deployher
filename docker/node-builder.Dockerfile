FROM node:22-bookworm

RUN corepack enable \
  && corepack prepare pnpm@9.15.9 --activate \
  && pnpm --version
