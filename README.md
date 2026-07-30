# Gridiron Ledger

Connect fantasy football leagues from Sleeper, ESPN, and Yahoo, and compare
your rosters across all of them — e.g. if you have Patrick Mahomes on one
team and are playing against him on another, see exactly what score keeps
you optimal in both matchups.

This is the initial setup: Next.js app, Supabase auth/database, and a
working Sleeper integration. ESPN and Yahoo, plus the cross-league matchup
comparison itself, come next.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack) — frontend + backend
- **Tailwind CSS v4** — CSS-first config, no `tailwind.config.js`
- **Supabase** — Postgres database + auth (email/password to start)
- **next-themes** — light/dark mode
- **Vercel** — target deployment platform

## Project layout

```
proxy.ts                        Session-refresh proxy (Next 16's renamed middleware)
src/app/page.tsx                 Landing page
src/app/(auth)/                  Login / signup pages + server actions
src/app/auth/callback/route.ts   Supabase email-confirmation / OAuth callback
src/app/dashboard/                Authenticated area: connect leagues, list them
src/lib/supabase/                Browser client, server client, proxy helper
src/lib/sleeper/                 Sleeper API client + types
src/types/database.ts            Supabase table types (placeholder, regenerate via CLI)
supabase/migrations/0001_init.sql Initial schema: platform_identities, connected_leagues
```

## Getting started

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. In the Supabase SQL editor, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
3. Copy `.env.example` to `.env.local` and fill in your Supabase project URL
   and anon key (Project Settings → API).
4. Install dependencies and run the dev server:

   ```bash
   npm install
   npm run dev
   ```

5. Visit `http://localhost:3000`, sign up, and connect a Sleeper account by
   username on the dashboard — no API key needed, Sleeper's read API is
   public.

## Deploying

- **Vercel**: import the repo, set the same env vars from `.env.example` in
  the project settings, deploy. `NEXT_PUBLIC_SITE_URL` should be your
  production URL (used for the email-confirmation redirect).
- **Supabase**: in Authentication → URL Configuration, add your production
  URL and `https://<your-domain>/auth/callback` as an allowed redirect URL.

## Data model so far

- `platform_identities` — links a Supabase user to their account on a given
  platform (e.g. their Sleeper `user_id`).
- `connected_leagues` — one row per league a user has imported, tagged by
  platform, season, and league id. Both tables are RLS-protected so a user
  can only see their own rows.

## Notes on the Sleeper integration

- Sleeper's API (`docs.sleeper.com`) is read-only and requires no auth —
  `src/lib/sleeper/client.ts` wraps the endpoints used so far: user lookup,
  a user's leagues for a season, rosters, league users, matchups, and NFL
  state.
- The full player dictionary (`/players/nfl`) is ~5MB and Sleeper asks that
  it not be polled frequently, so it's fetched with a 12-hour cache.
