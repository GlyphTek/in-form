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

## Configuration

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | |
| `HOST` | `127.0.0.1` | Set `0.0.0.0` deliberately when deploying |
| `LOG_LEVEL` | `info` | `silent` disables logging |
| `DATABASE_PATH` | `data/inform.db` | Point at a persistent volume in production |
