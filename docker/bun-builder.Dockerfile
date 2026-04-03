ARG NEXUS_REGISTRY=localhost:8082
FROM ${NEXUS_REGISTRY}/oven/bun:1

RUN apt-get update -qq \
  && apt-get install -y --no-install-recommends \
    build-essential \
    pkg-config \
    python3 \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
  && rm -rf /var/lib/apt/lists/* \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && ln -sf /usr/bin/python3 /usr/local/bin/python3
