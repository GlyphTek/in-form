# syntax=docker/dockerfile:1

# --- Install production dependencies (all pure JavaScript; SQLite is built into Node) ---
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

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
