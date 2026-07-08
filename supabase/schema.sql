-- ─────────────────────────────────────────────────────────────────────────────
-- SentinelAI — database schema
--
-- How to run: open your Supabase project -> SQL Editor -> New query, paste this
-- whole file, and click "Run". It is idempotent-ish (safe to re-run) thanks to
-- the drop-if-exists guards on the trigger/function.
--
-- What this does:
--   1. Creates a `public.profiles` table, one row per authenticated user.
--   2. Turns on Row Level Security so each user can only see/edit their own row
--      (this is what makes the publishable/anon key safe to ship in the browser).
--   3. Adds a trigger that auto-inserts a profile row whenever a new user signs
--      up in `auth.users` — so your app never has to create it manually.
--   4. Backfills profiles for any users that already signed up before this ran.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Profiles table -----------------------------------------------------------
create table if not exists public.profiles (
  id         uuid        primary key references auth.users (id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

-- 3. Auto-create a profile row on signup --------------------------------------
-- `security definer` lets the function insert into a table the signing-up user
-- doesn't have direct rights to yet; the empty search_path is a hardening step.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Backfill existing users --------------------------------------------------
insert into public.profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;
