-- ─────────────────────────────────────────────────────────────────────────────
-- SentinelAI — database schema
--
-- How to run: open your Supabase project -> SQL Editor -> New query, paste this
-- whole file, and click "Run". It is idempotent-ish (safe to re-run) thanks to
-- the drop-if-exists guards on the trigger/function.
--
-- What this does:
--   1. Creates a `public.profiles` table, one row per authenticated user (with username).
--   2. Turns on Row Level Security so each user can only see/edit their own row
--      (this is what makes the publishable/anon key safe to ship in the browser).
--   3. Adds a trigger that creates a profile row only after email confirmation.
--   4. Backfills profiles for confirmed users only.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Profiles table -----------------------------------------------------------
create table if not exists public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  email      text,
  username   text,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Username rules: unique (case-insensitive), max 20 chars, no whitespace.
alter table public.profiles add column if not exists username text;

alter table public.profiles drop constraint if exists profiles_username_format;
alter table public.profiles add constraint profiles_username_format
  check (username is null or (char_length(username) <= 20 and username !~ '\s'));

create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username))
  where username is not null;

-- 2. Row Level Security -------------------------------------------------------
alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by their owner" on public.profiles;
create policy "Profiles are viewable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- 3. Create profile only after email confirmation --------------------------------
-- Supabase always stores pending signups in auth.users; we only mirror confirmed
-- users into public.profiles so the app database stays clean until verify.
create or replace function public.sync_confirmed_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, username)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'username'
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(excluded.username, public.profiles.username),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.sync_confirmed_user_profile();

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.sync_confirmed_user_profile();

-- Client-side fallback after /auth/callback (if trigger timing ever races).
create or replace function public.ensure_profile()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  u record;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select id, email, email_confirmed_at, raw_user_meta_data
  into u
  from auth.users
  where id = uid;

  if u.email_confirmed_at is null then
    return;
  end if;

  insert into public.profiles (id, email, full_name, username)
  values (
    u.id,
    u.email,
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'username'
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(excluded.username, public.profiles.username),
    updated_at = now();
end;
$$;

-- 4. Backfill confirmed users; drop profiles for unconfirmed -------------------
delete from public.profiles p
using auth.users u
where p.id = u.id
  and u.email_confirmed_at is null;

insert into public.profiles (id, email, username)
select id, email, raw_user_meta_data ->> 'username'
from auth.users
where email_confirmed_at is not null
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- Auth helper RPCs (login by username, signup checks, settings updates)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.resolve_login_email(identifier text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_email text;
begin
  if identifier is null or trim(identifier) = '' then
    return null;
  end if;

  if position('@' in trim(identifier)) > 0 then
    return lower(trim(identifier));
  end if;

  select u.email
  into resolved_email
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(p.username) = lower(trim(identifier));

  return resolved_email;
end;
$$;

create or replace function public.is_username_available(desired_username text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where lower(username) = lower(trim(desired_username))
  )
  and not exists (
    select 1
    from auth.users u
    where lower(u.raw_user_meta_data ->> 'username') = lower(trim(desired_username))
      and u.email_confirmed_at is null
  );
$$;

create or replace function public.update_username(old_username text, new_username text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  if new_username is null or trim(new_username) = '' then
    raise exception 'Username is required';
  end if;

  if char_length(trim(new_username)) > 20 or trim(new_username) ~ '\s' then
    raise exception 'Invalid username format';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = uid and lower(username) = lower(trim(old_username))
  ) then
    raise exception 'Current username does not match';
  end if;

  if exists (
    select 1
    from public.profiles
    where lower(username) = lower(trim(new_username)) and id <> uid
  ) then
    raise exception 'Username is already taken';
  end if;

  update public.profiles
  set username = trim(new_username), updated_at = now()
  where id = uid;
end;
$$;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.resolve_login_email(text) to anon, authenticated;
grant execute on function public.is_username_available(text) to anon, authenticated;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.update_username(text, text) to authenticated;
grant execute on function public.delete_own_account() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Projects table -----------------------------------------------------------
-- One row per project a user wires up for Sentinel to watch. Each project holds
-- its GitHub repo, Slack webhook, and runbooks. Row Level Security ensures a
-- user can only see and manage their own projects.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users (id) on delete cascade,
  name          text        not null,
  github_repo   text,
  slack_webhook text,
  runbooks      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects (user_id);

alter table public.projects enable row level security;

drop policy if exists "Users can view their own projects" on public.projects;
create policy "Users can view their own projects"
  on public.projects for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own projects" on public.projects;
create policy "Users can insert their own projects"
  on public.projects for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own projects" on public.projects;
create policy "Users can update their own projects"
  on public.projects for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Users can delete their own projects"
  on public.projects for delete
  using (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Runbooks file storage ----------------------------------------------------
-- Runbook .md / .pdf files are uploaded to a private Storage bucket. Files are
-- stored under a per-user folder ("<user_id>/<uuid>/<filename>"), and the
-- projects.runbooks column stores the newline-separated list of those paths.
-- The RLS policies below scope every file to its owner: the first path segment
-- must equal the requesting user's id.
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('runbooks', 'runbooks', false)
on conflict (id) do nothing;

drop policy if exists "Users can upload their own runbooks" on storage.objects;
create policy "Users can upload their own runbooks"
  on storage.objects for insert
  with check (bucket_id = 'runbooks' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can read their own runbooks" on storage.objects;
create policy "Users can read their own runbooks"
  on storage.objects for select
  using (bucket_id = 'runbooks' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can update their own runbooks" on storage.objects;
create policy "Users can update their own runbooks"
  on storage.objects for update
  using (bucket_id = 'runbooks' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete their own runbooks" on storage.objects;
create policy "Users can delete their own runbooks"
  on storage.objects for delete
  using (bucket_id = 'runbooks' and (storage.foldername(name))[1] = auth.uid()::text);
