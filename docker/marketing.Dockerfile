# syntax=docker/dockerfile:1

FROM oven/bun:1.3.5 AS base
WORKDIR /usr/src/app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM base AS build
ARG VITE_PUBLIC_API_ORIGIN=
ARG VITE_PUBLIC_DASH_ORIGIN=
ENV VITE_PUBLIC_API_ORIGIN=$VITE_PUBLIC_API_ORIGIN
ENV VITE_PUBLIC_DASH_ORIGIN=$VITE_PUBLIC_DASH_ORIGIN
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
RUN bun run build:marketing

FROM nginx:1.27-alpine
COPY docker/marketing-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /usr/src/app/apps/marketing/dist /usr/share/nginx/html
EXPOSE 80
