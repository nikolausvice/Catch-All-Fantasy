-- Initial schema: platform identities + connected leagues.
-- Run via `npx supabase db push` (or paste into the Supabase SQL editor).

create extension if not exists "pgcrypto";

create table if not exists platform_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('sleeper', 'espn', 'yahoo')),
  platform_user_id text not null,
  platform_username text,
  created_at timestamptz not null default now(),
  unique (user_id, platform, platform_user_id)
);

create table if not exists connected_leagues (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null check (platform in ('sleeper', 'espn', 'yahoo')),
  platform_league_id text not null,
  platform_user_id text,
  league_name text not null,
  season text not null,
  sport text not null default 'nfl',
  avatar_url text,
  created_at timestamptz not null default now(),
  unique (user_id, platform, platform_league_id)
);

alter table platform_identities enable row level security;
alter table connected_leagues enable row level security;

create policy "Users manage their own platform identities"
  on platform_identities
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage their own connected leagues"
  on connected_leagues
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists connected_leagues_user_id_idx on connected_leagues (user_id);
create index if not exists platform_identities_user_id_idx on platform_identities (user_id);
