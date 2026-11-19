# IN-FORM

Personal orientation tool. See `docs/PROJECT_BRIEF.md` for the roadmap.

## Run locally

Requires Node 22.13 or newer. SQLite is Node's built-in `node:sqlite`, so there is
nothing to compile (no Python or C++ tools needed on Windows). Node prints an
"experimental" notice for it at startup; that is expected.

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

A source is a topic chip (`topic:<id>`, defined in `server/topics.js`: Technology, Science, News, Sport, Education, Religion, Relationships and wellbeing) or, under "Add your own", a keyword, a site URL, or a feed URL. `GET /api/topics` lists the chips. A topic is fetched as a Google News search for its tuned phrase and stored as a `keyword` row.

| File | Job |
|---|---|
| `detect.js` | Classify input as `topic` / `keyword` / `site` / `feed` (no network) |
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
/api/config` read and replace the account's sources; `PUT`
rejects sources that could never be fetched, with a reason for each.

The frontend works in three modes, detected on load: **local** (no server
answers, e.g. static hosting: setup stays in the browser and signals show as
unavailable), **sign-in required**, and **signed in** (setup follows you across
devices). The first time a browser signs in to an empty account, the setup
already saved in that browser is carried over once.

Your topics and sources are saved in the account, not the browser, so
clearing browser storage or cache does not remove them. Edits on the setup
screen (adding or removing) only take effect when you press START; until then
the screen says "Changes not saved yet" and the browser asks before you leave
the page.

## Signals API

The old "where do you participate" platforms were removed. Older pages may still
send a `platforms` field; it is accepted and ignored. The unused `platforms`
database table is left in place.

`POST /api/signals/generate` with `{ "sources": ["..."] }` (omit it to use the saved sources)
returns:

- `status`: `ok`, `partial`, `unavailable` or `no_sources`
- `channels`: `relevant`, `attention`, `knowing`, `experience`; each is
  an array of up to 3 items, best first, each
  `{ id, title, link, linkText, source, published, score (1-10), reason, useful }`
  (`reason` is plain language, including any learned boost); an
  empty array means nothing suitable exists
- `hidden`: `{ seen, dismissed }`, how many items were left out because you were
  already shown them, or dismissed them
- `sources`: per-source health (`ok` / `stale` / `error`, item count, error)

Channel assignment (`server/signals/rank.js`) is rule-based: recency decay plus
whole-word cue lists for Attention, Knowing and Experience. Cue-based
channels fill first and Relevant takes the best of what is left from the last 48
hours, so it runs dry when nothing recent remains. An item appears
in at most one channel, and a channel with nothing suitable stays short or empty
rather than being padded. A card's bar shows the score of its best item. The endpoint is rate limited and validates input strictly.

The frontend never shows placeholder signals. If the server cannot be reached
it says so and shows empty channels.

## Stored signals and feedback

Every item shown is stored per account (table `signals`, migration 004), keyed
by its normalised link, so the same story on another day is the same row. Each
item in a response carries that row's `id`.

- `POST /api/signals/:id/open` records that the link was opened (`204`).
- `PUT /api/signals/:id/state` with `{ "dismissed": bool, "useful": bool }`
  (either or both); `false` undoes either one.
- **Each item is offered once.** Anything already shown to you is removed before
  ranking on later runs, so pressing again gives the next batch (up to 3 per
  channel) from what is left, never the same items. When everything has been
  seen, the app says "Nothing new" instead of repeating or inventing content.
- **Starting a source fresh.** Saving a setup that drops a source forgets what
  was shown from it (case and outer spaces are ignored). Add the same topic,
  site or URL back later and everything it still serves counts as new again.
  What you get back is limited to what the source itself still publishes; IN-FORM
  does not archive content. Opens, Useful marks and dismissals are kept, and a
  dismissed item stays hidden. Saving without removing a source changes nothing.
  Dismissing is a stronger "not wanted" signal for learning; undoing a dismissal
  does not make the item new again.
- An id that is not yours answers `404`, the same as one that does not exist.

In the app each item has **Useful** and **Dismiss** buttons, and opening a link
is recorded. A dismissed item shows an **Undo** until the next run. A failed
save is shown on the item. This data is what Step 6 will learn from.

## Learning from what you do

Ranking is nudged by your own feedback (`server/signals/learn.js`). No model,
just two kinds of weight worked out from your opens, **Useful** marks and
dismissals: one per source, one per word in titles.

- Opened counts +1, Useful +2, Dismissed -2. Ignoring an item counts as nothing.
- Feedback fades with a 30-day half-life, so changing interests take over.
- Each weight is `sum / (total + 4)`, so one click barely matters and a pattern
  matters a lot; likes and dismissals of the same thing cancel out.
- An item's pull is half its source and half its three strongest words. It scales
  the item's score between 0.5x and 1.5x, so taste nudges the order but never
  hides anything: a dismissed topic still appears, just later.
- With no feedback the scale is exactly 1, so nothing changes until you use the
  buttons.
- Each item shows why, for example `matches attention cues; boosted: topics you
  like (quantum, error)` or `ranked lower: a source you dismiss`.
- `GET /api/learning` lists the sources and words that currently count most.
  Only the 500 most recent items with feedback are used.

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
| `NEWS_WINDOW` | `30d` | How far back keyword searches look (`7d`, `30d`, `12h`) |
| `RELEVANT_MAX_AGE_HOURS` | `48` | Relevant only takes items newer than this (1 to 720); undated items are allowed |
| `ALLOWED_ORIGINS` | (none) | Comma separated; only if a proxy rewrites `Host` |
| `GENERATE_RATE_LIMIT_PER_MINUTE` | `12` | Per client, `/api/signals/generate` |

## Region (Local / Global / Both)

The setup screen asks where News, Sport and Education should come from: Local,
Global or Both, with a continent (Europe, Africa, Asia, Oceania, North America,
South America). The suggested continent is guessed from the browser's time zone
and is only saved when the user presses START. The choice is stored on the account
(`users.region_scope`, `users.region_area`) and can be sent with a generate
request as `region: { scope, area }`.

- Only topics marked `local: true` in `server/topics.js` are affected. Other topics
  and anything typed under "Add your own" are fetched once, as before.
- Local means the English-language Google News editions listed per continent in
  `server/regions.js` (for example Oceania: NZ and AU). A signal run turns
  `topic:news` into `topic:news@nz`, `topic:news@au` and so on, merges them back into
  one source, and keeps the source name so learning is not split by edition.
- South America has no English edition yet. The app says so rather than
  substituting anything: Local shows an explicit message for those topics, Both
  falls back to the global feed with a note.
- The editions are not yet checked against live Google News. Try one with
  `npm run ingest -- "topic:news@nz"`.
