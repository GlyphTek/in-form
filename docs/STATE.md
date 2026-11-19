# IN-FORM: current state

Short handover for a fresh session. Update it after each step. The roadmap is in
`PROJECT_BRIEF.md`; how things work is in `README.md`.

## Settled decisions

- Node 22.13+, Fastify 5, SQLite through built-in `node:sqlite` (no native build).
- One owner account, one shared password (`INFORM_PASSWORD`, 12+ chars). Cookie
  session, hashed token stored. Magic link or passkeys later, same tables.
- Sources are topic chips (`topic:<id>`, `server/topics.js`) plus a tucked-away "add your own" box for free text (keyword, site URL or feed URL, auto-detected). Topic phrases are unverified against live Google News: check with `npm run ingest -- "topic:science"`.
  Keywords use Google News RSS (30-day window, `NEWS_WINDOW`). The old
  "platforms" idea was removed (the setup is topics, sites and feeds only).
- Up to 3 items per RAKE channel, best first. Cue-based channels (Attention,
  Experience, Knowing) fill first; Relevant takes the best of the rest.
- Each item is shown once per account. Pressing TIFA again gives the next
  batch; when everything is seen the app says "Nothing new".
- Removing a source in setup forgets what was shown from it; adding it back
  starts it fresh (limited to what the source still serves). Dismissed items
  stay hidden. History rows are kept for learning (`cleared_at`).
- Relevant takes only items from the last 48 hours (`RELEVANT_MAX_AGE_HOURS`),
  so it runs dry like the other cards. Until Step 6 it means "newest unseen",
  not "relevant to you".
- Learning only nudges (0.5x to 1.5x) and never hides; it is rule-based and each
  item says why. `GET /api/learning` shows what counts most.
- No placeholder content, ever. Empty or failed states are stated plainly.
- Hosting target: Fly.io, one machine, SQLite on a volume (`docs/DEPLOY.md`).
- Working style: small steps, summary after each, wait for confirmation.

## Done

Steps 1 to 6: small fixes, ingestion (SSRF-safe, cached, health), ranking,
password auth, account-stored setup, stored signals with open, Useful and
Dismiss, then learned ranking (per-source and per-word weights from opens,
Useful and Dismiss, with a Why line on each item). Branch `phase1-backend`; `main` is still the old static prototype.

## Verified on the owner's machine (Windows, Node 24)

Install, start, sign-in off mode, live feeds, 3 items per card, Attention
filling when sources carry alert-style headlines.

## Not yet verified

- Docker build and `fly deploy` (no Docker in the dev sandbox).
- GitHub Actions deploy workflow (needs `FLY_API_TOKEN`).
- Step 5 and 6 behaviour against live feeds (tested with local fixtures only).
  In particular whether the learned boost feels right after real use.

## Known gaps and ideas

- Attention needs alert-style words; the word list may be too narrow
  (candidates: hack, attack, leak, scam, security, threat).
- An empty card does not yet say why. No way to reset what has been learned
  (apart from deleting the database).
- Stored signals are never pruned, and "seen" is permanent: there is no way to
  see an item again once it has gone (removing and re-adding a source is the way
  back; a "Seen" history list or a time window are options if that proves too
  strict).
- An item counts as seen when the server sends it, even if the browser never
  displayed it (for example the connection dropped mid-response).
- Feed health is shared across users; needs per-user scoping (Step 7).

## Next

Step 7 (observability, per-user feed health, degraded messaging), then Step 8
(dogfood and cut over from GitHub Pages). Open question: hosting. Cloudflare
free tier would need a port (Workers + D1, 10 ms CPU limit is the risk); an
Oracle Always Free VM could run the app unchanged.

## Region choice (Step C)

- Local / Global / Both plus a continent, stored on the account (migration 006).
  Applies only to topics with `local: true` (News, Sport, Education).
- Local = English Google News editions per continent (`server/regions.js`).
  UNVERIFIED against live Google News: check with
  `npm run ingest -- "topic:news@nz"` (and gb, in, za, us).
- Not built: country-level refinement (the fallback chain is continent, then
  global); non-English editions; per-edition health shown separately.

## Windows package and setup backup (Step D)

- `npm run package:win` -> `dist/in-form-<v>-win-x64.zip`: node.exe + server + public +
  production node_modules + start.bat + README.txt. Portable folder, NOT a single exe
  (a single exe via Node SEA is possible later; it could not be tested without Windows).
- start.bat: INFORM_AUTH=off, HOST=127.0.0.1, data in %APPDATA%\IN-FORM\inform.db,
  opens the browser via a delayed `start`. UNTESTED on real Windows: the packaged tree
  was run under Linux Node with the same environment and worked; start.bat itself
  (especially the delayed browser launch) needs a first run on Windows.
- node.exe comes from npm `node-win-x64@22.23.4` (hash pinned). Its sha256 should equal
  the win-x64/node.exe line at nodejs.org/dist/v22.23.4/SHASUMS256.txt; not checkable from
  the build sandbox, so CI does it (`release.yml`, never run yet).
- Setup export/import is client-side (`in-form-setup.json`: app, version, exportedAt,
  sources, region). Loading fills the screen; START saves. Learning history is not in the file.
- Source reports now carry `editions` (per regional fetch) and the generate log line lists
  them, e.g. `topic:news@nz ok 14`.
- Unsigned binaries: SmartScreen warnings are expected; signing needs a paid certificate.
- Package size: full zip about 34 MB (node.exe is about 33 MB of that); `--lite` zip about
  2 MB uses the Node already installed (start.bat checks it is 22.13+). node_modules is pruned
  (docs, .d.ts, maps, tests; licences kept). The pruned tree passes the test suite.

## Step E (public README, video, release checklist)

- README.md is now the public overview; the old developer README moved to docs/DEVELOPMENT.md.
- docs/VIDEO_SCRIPT.md (shot list, real app only) and docs/FIRST_RELEASE.md (checklist) added.
- The Michroma font is bundled (public/fonts, SIL OFL licence alongside), replacing the
  Google Fonts import, so the page requests nothing from other sites. A test guards this.
- OPEN: no LICENSE file; the licence choice is the owner's. The release workflow has never run.
- OPEN: README claims "answers only your own computer" and "no analytics": true of the code now.
