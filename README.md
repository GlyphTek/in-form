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

## Deploying

See `docs/DEPLOY.md` (Fly.io with a volume for the database; GitHub Pages cannot run the server).

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

## Authentication and accounts

One shared password unlocks one account (the dogfood phase; magic links or
passkeys can replace the password later without changing the tables).

- **`INFORM_PASSWORD`** (12+ characters) turns sign-in on. The server refuses to
  start without it, so a forgotten variable can never leave a deployed instance
  open. For local development only, `INFORM_AUTH=off` skips sign-in entirely:
  every request acts as the owner, so never use it on a network-facing server.
- Signing in sets an opaque session token in an `httpOnly`, `SameSite=Lax`
  cookie (`Secure` over HTTPS). Only a SHA-256 hash of the token is stored, so a
  leaked database cannot be replayed as live sessions. Sessions last 30 days;
  signing out deletes the session on the server.
- Login is rate limited and gives one generic failure message.
- API writes are checked against the `Origin` header, and bodies must be JSON,
  which closes off cross-site form posts. If a reverse proxy rewrites the `Host`
  header, list your public origin in `ALLOWED_ORIGINS`.
- Behind a proxy (Fly.io, nginx) also set `TRUST_PROXY=true` so rate limits see
  real client IPs and cookies are marked `Secure`.

`GET /api/auth/me` reports `{ authRequired, authenticated }`; `POST
/api/auth/login` and `POST /api/auth/logout` do what they say. `GET/PUT
/api/config` read and replace the account's sources and platforms; `PUT`
rejects sources that could never be fetched, with a reason for each.

The frontend works in three modes, detected on load: **local** (no server
answers, e.g. static hosting: setup stays in the browser and signals show as
unavailable), **sign-in required**, and **signed in** (setup follows you across
devices). The first time a browser signs in to an empty account, the setup
already saved in that browser is carried over once.

## Signals API

`POST /api/signals/generate` with `{ "sources": ["..."], "platforms": ["..."] }`
returns:

- `status`: `ok`, `partial`, `unavailable` or `no_sources`
- `channels`: `relevant`, `attention`, `knowing`, `experience`; each is
  `{ title, link, linkText, source, published, score (1-10), reason }` or `null`
  when nothing suitable exists
- `sources`: per-source health (`ok` / `stale` / `error`, item count, error)
- `platforms`: link-outs only (`url` is `null` when the name is not a known
  platform or domain)

Channel assignment (`server/signals/rank.js`) is rule-based: recency decay plus
whole-word cue lists for Attention, Knowing and Experience. An item appears in
at most one channel, and a channel with nothing suitable stays empty rather
than being padded. The endpoint is rate limited and validates input strictly.

The frontend never shows placeholder signals. If the server cannot be reached
it says so and shows empty channels.

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` deliberately when deploying |
| `LOG_LEVEL` | `info` | `silent` disables logging |
| `DATABASE_PATH` | `data/inform.db` | Point at a persistent volume in production |
| `TRUST_PROXY` | `false` | Set `true` behind Fly.io or nginx so rate limits use real client IPs |
| `RATE_LIMIT_PER_MINUTE` | `120` | Per client, API routes |
| `INFORM_PASSWORD` | (required) | 12+ characters; or `INFORM_AUTH=off` for local development only |
| `INFORM_USER_EMAIL` | `owner@in-form.local` | Identity of the single account |
| `SESSION_DAYS` | `30` | Session lifetime |
| `LOGIN_RATE_LIMIT_PER_MINUTE` | `8` | Per client |
| `ALLOWED_ORIGINS` | (none) | Comma separated; only if a proxy rewrites `Host` |
| `GENERATE_RATE_LIMIT_PER_MINUTE` | `12` | Per client, `/api/signals/generate` |
