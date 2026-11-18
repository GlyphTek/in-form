# IN-FORM

Personal orientation tool. See `docs/PROJECT_BRIEF.md` for the roadmap.

## Run locally

Requires Node 20+.

```sh
npm install
cp .env.example .env      # optional; defaults work for local dev
npm start                 # http://127.0.0.1:3000
npm test
```

The server applies pending SQL migrations (`server/migrations/`) on startup.
`npm run migrate` applies them without starting the server.

## Layout

- `public/` — the frontend (static; served by the same Fastify process)
- `server/` — Fastify app, config, SQLite access and migrations
- `test/` — `node:test` suites
- `docs/` — brief and planning notes

## Feed ingestion (`server/ingest/`)

A source is whatever the user types: a topic keyword, a site URL, or a feed URL.

| File | Job |
|---|---|
| `detect.js` | Classify input as `keyword` / `site` / `feed` (no network) |
| `ssrf.js` | URL validation and private-address blocking |
| `fetcher.js` | Hardened fetch: timeout, size cap, per-hop redirect checks |
| `parse.js` | RSS/Atom to clean items (tags stripped, http(s) links only) |
| `discover.js` | Find a site's feed from `<link rel="alternate">` or common paths |
| `normalize.js` | URL/title normalisation and deduplication |
| `service.js` | Cache, conditional GET, backoff, stale-on-failure, health |

Keywords become a Google News RSS search fetched by the server. This is an
unofficial endpoint, but it sits behind the same cache and health tracking as
any other feed.

Check live fetching on your own machine or server (the dev sandbox blocks
outbound requests):

```sh
npm run ingest -- "quantum computing" bbc.com https://example.com/feed.xml
```

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` deliberately when deploying |
| `LOG_LEVEL` | `info` | `silent` disables logging |
| `DATABASE_PATH` | `data/inform.db` | Point at a persistent volume in production |
