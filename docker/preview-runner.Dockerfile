# syntax=docker/dockerfile:1

FROM oven/bun:1.3.5
WORKDIR /usr/src/app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY config ./config
COPY src/env ./src/env
COPY src/lib/proxyHeaders.ts ./src/lib/proxyHeaders.ts
COPY src/preview.ts ./src/preview.ts
COPY src/preview-runner ./src/preview-runner

ENV PORT=8787
EXPOSE 8787/tcp

CMD ["bun", "src/preview-runner/index.ts"]
