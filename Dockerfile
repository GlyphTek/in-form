# syntax=docker/dockerfile:1

# --- Install production dependencies (better-sqlite3 is a native module) ------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Prebuilt binaries are used when available; the toolchain is only a fallback.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm ci --omit=dev

# --- Runtime image --------------------------------------------------------------
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY server ./server
COPY public ./public

# The SQLite database lives on a mounted volume at /data (see fly.toml). The
# process runs as root because freshly mounted volumes are root-owned; the
# machine itself is an isolated single-app VM.
RUN mkdir -p /data
EXPOSE 3000

CMD ["node", "server/index.js"]
