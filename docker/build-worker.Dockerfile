# syntax=docker/dockerfile:1

FROM oven/bun:1.3.5 AS base
WORKDIR /usr/src/app

RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    unzip \
    nodejs \
    npm \
    python3 \
    python3-pip \
    python3-venv \
  && install -m 0755 -d /etc/apt/keyrings \
  && curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc \
  && chmod a+r /etc/apt/keyrings/docker.asc \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null \
  && apt-get update -qq \
  && apt-get install -y --no-install-recommends docker-ce-cli docker-buildx-plugin \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && ln -sf /usr/bin/pip3 /usr/local/bin/pip \
  && npm install -g pnpm@10 yarn@1 \
  && curl -LsSf https://astral.sh/uv/install.sh | sh \
  && mv /root/.local/bin/uv /usr/local/bin/uv \
  && python3 -m pip install --no-cache-dir --break-system-packages poetry==1.8.4

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --production

FROM base AS release
WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV APP_ENV=production

COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY src ./src
COPY drizzle ./drizzle
COPY examples ./examples
COPY auth.ts ./auth.ts
COPY migrate.ts ./migrate.ts
COPY package.json ./package.json
COPY tsconfig.json ./tsconfig.json

CMD ["bun", "src/workers/runBuildWorker.ts"]
