# Deploying IN-FORM

## Why not GitHub Pages

GitHub Pages only serves static files. IN-FORM now has a server (feed fetching,
sign-in, your saved setup, signal history), so the whole app, frontend and API
together, runs on one host: **Fly.io**, with a small volume for the SQLite
database. One origin keeps the cookie sign-in simple and avoids cross-site
cookie problems.

`Dockerfile`, `fly.toml` and `.github/workflows/deploy.yml` are ready. (The workflow runs the tests on
every push; deploying is a manual "Run workflow" on main, because there is no hosted copy yet and an
automatic deploy would fail on every push.) They have
not been run end to end by the person who wrote them: the sandbox this was built
in has no Docker daemon and no Fly access. The server itself was started from a
production-style install and exercised (health, sign-in, `Secure` cookie, config
save, restart persistence). Expect to fix small things on the first deploy.

## One-time setup (about 15 minutes)

1. Install `flyctl` (https://fly.io/docs/flyctl/install/) and run `fly auth signup`
   (or `fly auth login`).
2. From the repository root:
   ```sh
   fly launch --no-deploy --copy-config --region syd
   ```
   Choose a unique app name when asked (it updates `app` in `fly.toml`). Answer
   **no** to Postgres, Redis and any other add-ons.
3. Create the volume that holds the database (same region):
   ```sh
   fly volumes create inform_data --size 1 --region syd
   ```
4. Set the sign-in passphrase (12+ characters). Never put it in the repository:
   ```sh
   fly secrets set INFORM_PASSWORD='your long passphrase here'
   ```
5. Deploy and check it:
   ```sh
   fly deploy
   fly scale count 1        # SQLite needs exactly one machine
   curl https://YOUR-APP.fly.dev/api/health
   ```
   Then open `https://YOUR-APP.fly.dev`, press OPEN and sign in.

## Automatic deploys on push

```sh
fly tokens create deploy
```

Add the output as a repository secret named `FLY_API_TOKEN` (GitHub, Settings,
Secrets and variables, Actions). After that, every push to `main`, including
`git ship`, runs the tests and deploys only if they pass. Pushes to other
branches and pull requests run the tests only.

## Cutting over from the Pages site safely

The live Pages site keeps working as long as `main` is untouched. Check
Settings, Pages: if the source is branch `main`, folder `/ (root)`, then:

1. Do the setup above and `fly deploy` from your working branch
   (`phase1-backend`). Use the app at the `fly.dev` address for a few days.
2. Merge to `main` only when you are happy. The merge moves `index.html`,
   `app.js` and `style.css` into `public/`, so the Pages site will stop working.
   Choose one:
   - **Retire it:** Settings, Pages, unpublish.
   - **Redirect it:** add a root `index.html` containing only
     `<meta http-equiv="refresh" content="0; url=https://YOUR-APP.fly.dev/">`
     and a link to the same address. Pages serves it; the Fly app ignores it.
3. Keep `.env` and `data/` out of git (already in `.gitignore`). The repository
   is public, so nothing private should ever be committed.

## Running it

| Task | Command |
|---|---|
| Logs | `fly logs` |
| Status and health | `fly status` |
| Change the password | `fly secrets set INFORM_PASSWORD='new passphrase'` (restarts; old sessions stay valid until they expire or you sign out) |
| Backups | Fly snapshots the volume daily; list with `fly volumes list` and `fly volumes snapshots list <volume-id>` |
| Local development | `INFORM_AUTH=off npm start` (never on a network-facing machine) |

Cost is small (one shared-CPU 256 MB machine plus a 1 GB volume); check Fly's
current pricing page rather than trusting a number written here.

## If sign-in works locally but not on Fly

Almost always the proxy. `TRUST_PROXY=true` is already set in `fly.toml`. If you
put another proxy or a custom domain in front, list the public origin in
`ALLOWED_ORIGINS` (comma separated) so API writes are not refused as
cross-origin.
