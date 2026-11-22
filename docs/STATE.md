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
- Licence: MIT, "JV7T9 - GlyphTek Project" (LICENSE, package.json, README, shipped in the Windows zip). The release workflow has never run.
- OPEN: README claims "answers only your own computer" and "no analytics": true of the code now.

## The DONE ending (Step F)

- generate response has `caughtUp`: true only when every source is `ok` (not error, stale or
  timed out) and no channel has anything to show. Never true with no sources.
- Client: when caughtUp, the subtitle reads "You're caught up. Nothing more right now." and PRESS
  becomes DONE. DONE goes back to the landing screen (screen reset only; seen history is kept on
  the server). While caught up the card no longer starts runs. A failing source shows its error and
  PRESS, never DONE.
- Replaces the old "Nothing new right now. To see a source's items again, remove it in setup..."
  line in the healthy case (that hint is still reachable in the partial case).
- Known gap: the early middle (presses 3 to 15) has no nudge; DONE only appears when content runs out
  (about 20+ presses in the builder's test). Revisit after real use. OPEN also still goes to setup, then
  START, rather than straight to the cards.

## Press rate limit (found in the builder's test)

- The builder pressed PRESS 13 times and it stopped (then 12 on a second run). Cause: the generate
  limit was 12 per minute per client; the next press got a 429 shown as "Live signals unavailable".
  Reproduced in a browser.
- Fix: default is 120/min when auth is off (one person, local) and still 12 with a password;
  start.bat sets 120; a refused press now keeps the last batch on screen with "That was a little
  fast. Wait a few seconds, then press again." and PRESS stays.
- This means the builder's "13 presses to the end" may have been the limit, not the content running
  out, so how many presses it really takes to reach DONE is not yet known.

## Download page (GitHub Pages)

- `index.html` at the repo root is a static download page in the app's look (fonts from public/fonts,
  no outside requests; a test guards this). Pages serves it from main / (root); docs/*.md still render
  at /docs/*.html. Its Download button points at /releases/latest, so merge it AFTER the first release.
- No demo video on it yet (none exists). Add the link once recorded.

## Windows installer (v0.2.0)

- `installer/`: `IN-FORM.cs` (launcher, compiled in CI by the .NET Framework `csc` that ships with
  Windows, so C# 5 only; a test guards that), `inform.iss` (Inno Setup script), `inform.ico` and
  `make-icon.py`. Per-user install into %LOCALAPPDATA%\Programs\IN-FORM, no admin prompt, Start menu
  icon, optional desktop icon, "Stop IN-FORM" shortcut, uninstaller that asks before deleting
  %APPDATA%\IN-FORM.
- The launcher is start.bat without the console: same env (auth off, 127.0.0.1, 120 presses/min), same
  data folder, so the portable zip and the installer share a setup. Server output goes to
  %APPDATA%\IN-FORM\inform.log. A second click reuses a running server (health check). `--stop`
  kills the cmd.exe tree it recorded in inform.pid; `--quiet` suppresses dialogs.
- The server keeps running after the browser tab closes, until sign-out, restart or Stop. Possible
  later: exit when idle for some hours.
- release.yml is now three jobs: packages (Linux) -> installer (windows-latest: builds the launcher and
  setup, then silently installs, starts, queries /api/health, /, /api/topics, relaunches, stops and
  uninstalls) -> publish (checksums for setup exe and zips, release). Run "Run workflow" first to test
  without publishing. VERIFIED: v0.2.0 was published by this workflow, and on the builder's Windows PC
  the Start menu and desktop icons open IN-FORM with no black window and Stop IN-FORM works.
  Lesson: Start-Process -Wait also waits for the background server and hung the CI test; the workflow
  now waits for the launcher itself with a limit (and every job has a timeout).
- Unsigned: SmartScreen still warns. Version bumped to 0.2.0 (file names come from package.json).

## Showcase on the download page

- `media/`: `inform-showcase.mp4` (the builder's 79-second recording, from the second Clipchamp export (298x536, 9:16),
  black frames trimmed, about 5 MB), a poster, and four stills pulled with ffmpeg at 10 s, 64 s, 34 s and
  46 s (setup, cards, "why" line, DONE; captions cropped off). Real app, no mock data. Self-hosted, so the
  page still loads nothing from other sites; a test checks every media file referenced exists, stays
  small, has alt text, has controls and no autoplay.
- The recording is only 298 px wide (Clipchamp would not export larger), so text is a little soft. One caption still says "Select a new platform" (about 58 s); platforms no longer exist.
- The install-explainer video does not exist yet. Link it from the Install section when it does (a
  plain link, not an embed).

## Phone, step 1: installable shell (mobile-shell branch)

Plan agreed with the builder (decisions): phone state lives ON THE PHONE (no accounts); the hosted version
is TOPICS ONLY at first (no custom sites/feeds, so the server is not an open fetch proxy); hosting on
Fly.io (files exist in Dockerfile, fly.toml, deploy.yml, never run). Steps: 1 installable shell (this),
2 stateless generate (client sends topics, region, seen ids; server fetches, ranks, keeps nothing),
3 on-device state, 4 hosting, 5 real-phone polish and testing, 6 one combined video.

- `public/manifest.webmanifest`, `public/icons/*` (from `scripts/make-pwa-icons.py`; same four-square
  design as the installer icon; maskable icon for Android; 180px apple-touch icon), head tags in index.html.
- `public/sw.js`: network-first copy of the app's OWN files only, 4 s timeout then the saved copy. Never
  touches /api/, other origins or non-GET, so it cannot show old news. Registered at the end of app.js.
  It also registers on the Windows desktop app (localhost is a secure context): if the server is stopped,
  an old tab or bookmark opens the saved shell, which then reports it cannot reach the server.
- style.css: 44px minimum tap targets on small or touch screens only (chips, Useful/Dismiss, PRESS, Active
  Sources, region menu, add-source row, the item link's hit area), safe-area padding, 100dvh. Measured in
  Chromium at 390px: 0 controls under 44px, no sideways scroll.
- Verified in Chromium: worker active, shell saved, no /api entries saved, Chrome reports no installability
  errors, the app opens with the network off. NOT verified: a real phone (iOS Safari "Add to Home Screen",
  Android Chrome install). HTTPS is required off localhost, which step 4 provides.
- Tests: test/pwa.test.js (manifest, icons, head tags, worker rules, served types).


## Phone, step 2: stateless generate (stateless branch)

- `INFORM_MODE=hosted` (default `local`) makes the server the public phone website: no accounts, no
  cookies, no sign-in. It does not create users/sessions/config/signals stores and registers none of the
  per-person routes (`/api/config`, `/api/auth/*`, `/api/signals/*`, `/api/learning` all 404). It registers
  only `GET /api/topics` (the fixed topic and region lists, public) and `POST /api/v1/generate`
  (`server/routes/hosted.js`). The CSRF origin check still applies. Local mode has no stateless endpoint, so
  a password-protected copy cannot be used without signing in.
- `POST /api/v1/generate` body: `topics` (ids from the built-in list ONLY: no sites, feeds or keywords),
  `region`, `seen` (item keys, max 3000), `dismissed` (max 1000), `feedback` (max 500 rows of
  `{title, source, openCount?, openedAt?, usefulAt?, dismissedAt?}`). Unknown fields are refused. Body limit 1 MB
  (the app-wide limit stays 64 KB). The answer is the desktop shape, with `key` per item instead of `id`,
  and without the per-item `useful` flag (the phone tracks that). `generateSignals` already took `exclude`
  and `affinity` as functions, so the ranking code did not change.
- Per-visitor rate limit `GENERATE_RATE_LIMIT_PER_MINUTE` (30 when hosted); set `TRUST_PROXY=true` behind
  Fly.io or it limits the proxy's address, not the visitor.
- Privacy, stated exactly: request bodies are never logged; the route logs counts only; the generator gets a
  silent logger. The server does see topics, region, seen keys and feedback while handling a request, and the
  usual operational logs (time, address, path) exist. The ingestor's own warning when a news fetch fails
  names the topic search that failed (a fixed public query, not tied to a visitor). Say "we don't store
  it", never "it never leaves your phone".
- The existing browser app calls the per-person routes, so hosted mode serves it but it will not work until
  step 3 (a phone client that keeps its own state and calls /api/v1/generate).
- Tests (test/hosted.test.js): parity with the signed-in run for the same history, nothing written to
  users/sessions/sources/platforms/signals, topics-only, seen/dismissed/caught-up, feedback ranking, size
  limits, rate limit, request contents absent from logs. `buildApp` takes an optional `logStream` for that.
- fly.toml and docs/DEPLOY.md still describe the password-protected deployment; step 4 updates them
  (INFORM_MODE=hosted, TRUST_PROXY=true, no INFORM_PASSWORD).

## Phone, step 3: setup and history on the phone (phone-client branch)

- `public/device-store.js` keeps seen items, dismissals, opens and Useful marks in the browser's own storage (`inform_device_v1`), mirroring the server's signal store (a parity test checks both agree). If storage is blocked or full it carries on in memory and the page says history will not survive.
- `public/app.js` detects "device mode" when there is no account system and `/api/health` reports `mode: "hosted"`. In that mode it sends topics, region and the device's history to `POST /api/v1/generate` on each press, and never calls `/api/config` or `/api/signals/*`.
- Hosted version is topics only: the custom sites/feeds drawer is hidden, and imported setup files are filtered to topics (a note says how many were dropped).
- A note on the setup screen says: setup and history stay on this phone; the server looks up the news for your topics and keeps nothing.
- Removing a topic in setup forgets what was shown from it, so adding it back starts fresh (same as the desktop app).
- Verified in a phone-sized Chromium against an in-process hosted server (17 checks: no sign-in, history persists across reload, DONE reached, nothing per-person sent to the server) and all existing browser scripts still pass. Not yet tried on a real phone or against live Google News.
- Next: step 4, hosting on Fly.io (fly.toml and docs/DEPLOY.md need INFORM_MODE=hosted, TRUST_PROXY=true, no password).

## Phone, step 4: hosting on Render's free plan (render-hosting branch)

- Fly.io has no free plan any more (short trial only), so the phone version targets Render's free tier. `render.yaml` sets hosted mode, no password, TRUST_PROXY, a disposable database in /tmp. The old Fly files stay for a private password copy and are marked as needing a payment method.
- A free Render service sleeps after 15 minutes and wakes in about a minute. The phone handles it: a copy that has talked to the hosted server before (flag `inform_hosted_origin`) opens its setup at once without waiting for the server; a press waits up to 100 s, shows "Waking the server up" after 6 s and retries when the host answers 502/503/504.
- Verified: hosted server starts from the production-style environment and answers health/topics; a browser run with a hanging health check and two 503s before success. Not verified: a real Render deploy, Render's actual wake behaviour for fetch requests, a real phone.
- Next: deploy by hand following docs/DEPLOY.md, then a real-phone test (step 5).

## Phone version live (Render) and on the download page

- Live at https://in-form.onrender.com (free Render plan, hosted mode). Builder-tested on a real phone: installs from the browser, topics survive a close, seen items are skipped on later presses, layout fine. Not yet confirmed on a phone: Useful/Dismiss/open links, and the idle "Waking the server up" path.
- The download page now has OPEN ON YOUR PHONE, an INSTALL (PHONE) section, and honest wording in privacy and known limits (the server sees the request while answering; topics only; free host can be slow to wake or paused).

## Install offer in the phone app (install-hint branch)

- On the first screen of the phone version: Android Chrome gets an INSTALL IN-FORM button (uses the browser's own install prompt, `beforeinstallprompt`); iPhone gets "tap Share, then Add to Home Screen" because Apple gives pages no way to start the install. Hidden once installed (standalone), after the install event, and after "Not now" (remembered). Never shown on the desktop app or a plain desktop browser.
- Verified in Chromium with a simulated install prompt and an iPhone user agent; real Android Chrome already offers its own prompt (the builder saw it). Not verified: real iPhone.
