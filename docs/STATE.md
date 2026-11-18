# IN-FORM: current state

Short handover for a fresh session. Update it after each step. The roadmap is in
`PROJECT_BRIEF.md`; how things work is in `README.md`.

## Settled decisions

- Node 22.13+, Fastify 5, SQLite through built-in `node:sqlite` (no native build).
- One owner account, one shared password (`INFORM_PASSWORD`, 12+ chars). Cookie
  session, hashed token stored. Magic link or passkeys later, same tables.
- Sources are free text: topic keyword, site URL or feed URL, auto-detected.
  Keywords use Google News RSS (30-day window, `NEWS_WINDOW`). Platforms are
  link-outs and mild hints only; they never produce items.
- Up to 3 items per RAKE channel, best first. Cue-based channels (Attention,
  Experience, Knowing) fill first; Relevant takes the best of the rest.
- No placeholder content, ever. Empty or failed states are stated plainly.
- Hosting target: Fly.io, one machine, SQLite on a volume (`docs/DEPLOY.md`).
- Working style: small steps, summary after each, wait for confirmation.

## Done

Steps 1 to 5: small fixes, ingestion (SSRF-safe, cached, health), ranking,
password auth, account-stored setup, stored signals with open, Useful and
Dismiss. Branch `phase1-backend`; `main` is still the old static prototype.

## Verified on the owner's machine (Windows, Node 24)

Install, start, sign-in off mode, live feeds, 3 items per card, Attention
filling when sources carry alert-style headlines.

## Not yet verified

- Docker build and `fly deploy` (no Docker in the dev sandbox).
- GitHub Actions deploy workflow (needs `FLY_API_TOKEN`).
- Step 5 buttons against live feeds (tested with local fixtures only).

## Known gaps and ideas

- Attention needs alert-style words; the word list may be too narrow
  (candidates: hack, attack, leak, scam, security, threat).
- An empty card does not yet say why.
- Stored signals are never pruned.
- Feed health is shared across users; needs per-user scoping (Step 7).

## Next

Step 6: ranking learns from opens, Useful and Dismiss (per-user weights, kept
explainable). Then Step 7 (observability, degraded messaging) and Step 8
(dogfood and cut over from GitHub Pages).
