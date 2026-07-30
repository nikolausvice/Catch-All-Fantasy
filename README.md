# Gridiron Ledger

Connect fantasy football leagues from Sleeper, ESPN, and Yahoo, and compare
your rosters across all of them — e.g. if you have Patrick Mahomes on one
team and are playing against him on another, see exactly what score keeps
you optimal in both matchups.

This is the initial setup: Next.js app, self-hosted auth + database, and a
working Sleeper integration. ESPN and Yahoo, plus the cross-league matchup
comparison itself, come next.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — frontend + backend
- **Tailwind CSS v4** — CSS-first config, no `tailwind.config.js`
- **Auth.js v5** (`next-auth`) — email/password (Credentials provider), JWT sessions
- **SQLite via libSQL + Drizzle ORM** — same client/schema locally and in prod:
  a local file (`local.db`) in dev, [Turso](https://turso.tech) in prod
- **next-themes** — light/dark mode
- **Vercel** — target deployment platform

## Project layout

```
src/proxy.ts                     Route-protection proxy (Next 16's renamed middleware)
src/app/page.tsx                 Landing page
src/app/(auth)/                  Login / signup pages + server actions
src/app/api/auth/[...nextauth]/  Auth.js route handler
src/app/dashboard/                Authenticated area: connect leagues, list them
src/auth.ts                       Auth.js config (Credentials provider, Drizzle adapter)
src/db/schema.ts                  Drizzle schema: auth tables + platform_identities/connected_leagues
src/db/client.ts                  libSQL client (local file or Turso, same code path)
src/lib/sleeper/                 Sleeper API client + types
drizzle/                          Generated SQL migrations
```

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and set `AUTH_SECRET` (generate one
   with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`).
   Leave `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` blank for local dev — a
   `local.db` SQLite file is created automatically.

3. Create the database tables:

   ```bash
   npm run db:migrate
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

5. Visit `http://localhost:3000`, sign up, and connect a Sleeper account by
   username on the dashboard — no API key needed, Sleeper's read API is
   public.

## Database commands

- `npm run db:generate` — generate a new SQL migration after editing `src/db/schema.ts`
- `npm run db:migrate` — apply migrations to whichever DB the env vars point at
- `npm run db:studio` — open Drizzle Studio to browse data

## Deploying

- **Turso**: create a database (`turso db create gridiron-ledger`), get its
  URL and an auth token, and set `TURSO_DATABASE_URL` / `TURSO_AUTH_TOKEN`.
  Run `npm run db:migrate` once against those prod env vars to create the
  tables.
- **Vercel**: import the repo, set `AUTH_SECRET`, `TURSO_DATABASE_URL`, and
  `TURSO_AUTH_TOKEN` in the project settings, deploy.

## Data model so far

- `user` / `account` / `session` / `verificationToken` — Auth.js's standard
  adapter tables (`user` also has a `passwordHash` column for credentials
  login).
- `platform_identities` — links a user to their account on a given platform
  (e.g. their Sleeper `user_id`).
- `connected_leagues` — one row per league a user has imported, tagged by
  platform, season, and league id.

## Notes on the Sleeper integration

- Sleeper's API (`docs.sleeper.com`) is read-only and requires no auth —
  `src/lib/sleeper/client.ts` wraps the endpoints used so far: user lookup,
  a user's leagues for a season, rosters, league users, matchups, and NFL
  state.
- The full player dictionary (`/players/nfl`) is ~5MB and Sleeper asks that
  it not be polled frequently, so it's fetched with a 12-hour cache.
