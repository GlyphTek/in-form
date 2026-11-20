# IN-FORM — Project Brief for Coding Agents

## Overview
IN-FORM is a personal orientation tool. Users declare the sources and platforms that shape their day. The system then generates a daily signal set across four channels (RAKE):

- **Relevant** — What currently intersects with the user’s world
- **Attention** — What may require awareness or action
- **Knowing** — What may expand understanding
- **Experience** — What may be worth exploring or participating in

The current version is a strong visual/interaction prototype with a fragile data layer and no real learning.

## Current Tech Stack
- Frontend: Vanilla HTML + CSS + JavaScript (single-page, multi-screen)
- Storage: `localStorage` only
- Live data: Google News RSS via `rss2json` proxy (brittle)
- Fallback: Local keyword/theme-based resonance engine
- No backend, no auth, no persistent history, no user feedback loop

Key files:
- `index.html` — structure and screens
- `style.css` — full visual system
- `app.js` — all logic (landing, setup, RAKE generation, particle background, etc.)

## Primary Goal (Next 90 Days)
Turn IN-FORM from a polished prototype into a **reliable personal tool** that measurably improves a user’s daily signal-to-noise ratio and sense of orientation.

### Success Criteria
- Live signal generation works reliably without depending on `rss2json`
- User configuration and signal history persist across sessions/devices
- System begins learning from user behaviour (opens, dismissals, explicit feedback)
- Core loop is stable enough for daily personal use and small private testing

## Prioritized Roadmap

### Phase 1 — Harden Foundation (Highest Priority)
1. Replace brittle RSS proxy with controllable feed ingestion
   - Prefer self-hosted or direct parsing (rss-parser / feedparser or equivalent)
   - Graceful degradation when sources fail
2. Add minimal backend
   - Simple auth (magic link or passkey preferred)
   - Persistent storage of: sources, platforms, signal history, basic preference weights
3. Make RAKE generation stateful
   - Store which signals were opened / dismissed / marked useful
   - Begin simple personalization (re-ranking or weighting)

### Phase 2 — Close the Value Loop
- Add lightweight usefulness feedback on signals
- Show basic personal history / clarity trend
- Allow pinning, archiving, and suppressing sources/signals
- Instrument core metrics (generation frequency, open rates, retention)

### Phase 3 — Retention Surface (Only after Phase 1–2 stability)
- Decide primary habit surface (PWA + notifications, browser extension, daily digest, etc.)
- Reduce time-to-value for returning users

## Technical Preferences & Constraints
- Prefer simple, boring, reliable technology over cleverness
- Keep the distinctive visual language and interaction model unless there is a strong reason to change it
- Avoid heavy frameworks unless clearly justified (current vanilla approach is acceptable if structured cleanly)
- Backend should be lightweight (Node, Python/FastAPI, or similar are all fine)
- Prioritise observability and graceful failure states
- Do not break the existing landing → setup → app flow without good reason

## Working Style for Agents
- Make small, reviewable commits/changes
- Preserve existing visual design and copy tone unless explicitly changing it
- When adding backend, keep the frontend functional in a degraded/local mode where possible
- Ask for clarification on product decisions (e.g. auth method, primary retention surface) rather than assuming
- Prefer explicitness over magic

## Out of Scope (For Now)
- Mobile native apps
- Social/sharing features
- Complex AI summarisation or long-form generation
- Monetisation
- Public launch / growth features

---

**Current status**: Strong prototype. Next required work is reliability, persistence, and learning — not more visual polish.