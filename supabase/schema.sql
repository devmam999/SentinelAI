-- ─────────────────────────────────────────────────────────────────────────────
-- SentinelAI — database schema
--
-- How to run: open your Supabase project -> SQL Editor -> New query, paste this
-- whole file, and click "Run". Safe to re-run: policies/functions use drop-if-exists
-- guards before create.
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

create or replace function public.auth_user_email(p_user_id uuid default auth.uid())
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select lower(trim(coalesce(
    (select u.email from auth.users u where u.id = p_user_id),
    (select pr.email from public.profiles pr where pr.id = p_user_id),
    ''
  )));
$$;

create or replace function public.invitation_is_for_me(p_email text)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select p_email is not null
    and auth.uid() is not null
    and (
      lower(p_email) = coalesce(
        (select lower(trim(u.email)) from auth.users u where u.id = auth.uid()),
        ''
      )
      or lower(p_email) = coalesce(
        (select lower(trim(pr.email)) from public.profiles pr where pr.id = auth.uid()),
        ''
      )
    );
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Project teams, incidents, and fix approvals
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.project_members (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null references public.projects (id) on delete cascade,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  role       text        not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_members_user_id_idx on public.project_members (user_id);

create table if not exists public.project_invitations (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null references public.projects (id) on delete cascade,
  email      text        not null,
  role       text        not null check (role in ('admin', 'member')),
  invited_by uuid        not null references auth.users (id) on delete cascade,
  status     text        not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  created_at timestamptz not null default now()
);

create unique index if not exists project_invitations_pending_email_idx
  on public.project_invitations (project_id, lower(email))
  where status = 'pending';

create table if not exists public.incidents (
  id               uuid        primary key default gen_random_uuid(),
  project_id       uuid        not null references public.projects (id) on delete cascade,
  incident_number  int         not null,
  title            text        not null,
  status           text        not null default 'active' check (status in ('active', 'resolved')),
  alert_description text,
  analysis         jsonb,
  slack_posted     boolean     not null default false,
  created_by       uuid        references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  unique (project_id, incident_number)
);

create index if not exists incidents_project_id_idx on public.incidents (project_id);

create table if not exists public.incident_fixes (
  id              uuid        primary key default gen_random_uuid(),
  incident_id     uuid        not null references public.incidents (id) on delete cascade,
  submitted_by    uuid        not null references auth.users (id) on delete cascade,
  fix_description text        not null,
  status          text        not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by     uuid        references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text,
  created_at      timestamptz not null default now()
);

create unique index if not exists incident_fixes_one_pending_per_incident_idx
  on public.incident_fixes (incident_id)
  where status = 'pending';

-- Backfill project owners as admins in project_members.
insert into public.project_members (project_id, user_id, role)
select p.id, p.user_id, 'admin'
from public.projects p
where not exists (
  select 1 from public.project_members pm
  where pm.project_id = p.id and pm.user_id = p.user_id
);

create or replace function public.can_access_project(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id
      and (
        p.user_id = p_user_id
        or exists (
          select 1
          from public.project_members pm
          where pm.project_id = p.id and pm.user_id = p_user_id
        )
      )
  );
$$;

create or replace function public.is_project_admin(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id and p.user_id = p_user_id
  )
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
      and pm.role = 'admin'
  );
$$;

create or replace function public.get_my_project_role(p_project_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when exists (
      select 1 from public.projects p
      where p.id = p_project_id and p.user_id = auth.uid()
    ) then 'admin'
    else (
      select pm.role
      from public.project_members pm
      where pm.project_id = p_project_id and pm.user_id = auth.uid()
    )
  end;
$$;

create or replace function public.add_project_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.user_id, 'admin')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_project_created_add_owner on public.projects;
create trigger on_project_created_add_owner
  after insert on public.projects
  for each row
  execute function public.add_project_owner_member();

create or replace function public.set_incident_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_num int;
begin
  select coalesce(max(i.incident_number), 100) + 1
  into next_num
  from public.incidents i
  where i.project_id = new.project_id;

  new.incident_number := next_num;
  return new;
end;
$$;

drop trigger if exists on_incident_set_number on public.incidents;
create trigger on_incident_set_number
  before insert on public.incidents
  for each row
  execute function public.set_incident_number();

-- Replace single-user project policies with team-aware access.
drop policy if exists "Users can view their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;
drop policy if exists "Project members can view projects" on public.projects;
drop policy if exists "Project admins can update projects" on public.projects;
drop policy if exists "Project admins can delete projects" on public.projects;
drop policy if exists "Project owners can update projects" on public.projects;
drop policy if exists "Project owners can delete projects" on public.projects;

create policy "Project members can view projects"
  on public.projects for select
  using (public.can_access_project(id));

create policy "Project admins can update projects"
  on public.projects for update
  using (public.is_project_admin(id))
  with check (public.is_project_admin(id));

create policy "Project admins can delete projects"
  on public.projects for delete
  using (public.is_project_admin(id));

-- Teammates can read each other's profiles on shared projects.
drop policy if exists "Profiles are viewable by their owner" on public.profiles;
drop policy if exists "Profiles are viewable by owner or teammates" on public.profiles;
create policy "Profiles are viewable by owner or teammates"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (
      select 1
      from public.project_members pm_self
      join public.project_members pm_other on pm_self.project_id = pm_other.project_id
      where pm_self.user_id = auth.uid()
        and pm_other.user_id = profiles.id
    )
    or exists (
      select 1
      from public.projects p
      join public.project_members pm on pm.project_id = p.id
      where p.user_id = profiles.id and pm.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.projects p
      join public.project_members pm on pm.project_id = p.id
      where p.user_id = auth.uid() and pm.user_id = profiles.id
    )
  );

alter table public.project_members enable row level security;
alter table public.project_invitations enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_fixes enable row level security;

drop policy if exists "Members can view project team" on public.project_members;
create policy "Members can view project team"
  on public.project_members for select
  using (public.can_access_project(project_id));

drop policy if exists "Admins can manage project team" on public.project_members;
create policy "Admins can manage project team"
  on public.project_members for delete
  using (public.is_project_admin(project_id));

drop policy if exists "Members can view project invitations" on public.project_invitations;
create policy "Members can view project invitations"
  on public.project_invitations for select
  using (
    public.is_project_admin(project_id)
    or (status = 'pending' and public.invitation_is_for_me(email))
  );

drop policy if exists "Members can view incidents" on public.incidents;
create policy "Members can view incidents"
  on public.incidents for select
  using (public.can_access_project(project_id));

drop policy if exists "Members can create incidents" on public.incidents;
create policy "Members can create incidents"
  on public.incidents for insert
  with check (public.can_access_project(project_id));

drop policy if exists "Members can view incident fixes" on public.incident_fixes;
create policy "Members can view incident fixes"
  on public.incident_fixes for select
  using (
    exists (
      select 1
      from public.incidents i
      where i.id = incident_id and public.can_access_project(i.project_id)
    )
  );

-- Shared runbook reads for project teammates.
drop policy if exists "Users can read their own runbooks" on storage.objects;
drop policy if exists "Users can read own or shared runbooks" on storage.objects;
create policy "Users can read own or shared runbooks"
  on storage.objects for select
  using (
    bucket_id = 'runbooks'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.projects p
        where public.can_access_project(p.id)
          and coalesce(p.runbooks, '') like '%' || name || '%'
      )
    )
  );

create or replace function public.invite_project_member(
  p_project_id uuid,
  p_email text,
  p_role text default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_id uuid;
  raw_identifier text := trim(p_email);
  normalized_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_project_admin(p_project_id) then
    raise exception 'Only project admins can invite teammates';
  end if;

  if raw_identifier = '' then
    raise exception 'Enter a username or email address';
  end if;

  if position('@' in raw_identifier) > 0 then
    select lower(trim(coalesce(u.email, pr.email)))
    into normalized_email
    from auth.users u
    inner join public.profiles pr on pr.id = u.id
    where lower(coalesce(u.email, pr.email)) = lower(raw_identifier)
    limit 1;
  else
    select lower(trim(coalesce(u.email, pr.email)))
    into normalized_email
    from auth.users u
    inner join public.profiles pr on pr.id = u.id
    where lower(pr.username) = lower(raw_identifier)
    limit 1;
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Invalid user/email. Please ask them to register to SentinelAI';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;

  if p_role = 'admin' and not public.is_project_owner(p_project_id) then
    raise exception 'Only the project owner can invite admins';
  end if;

  if exists (
    select 1
    from public.profiles pr
    join public.projects p on p.user_id = pr.id and p.id = p_project_id
    where lower(pr.email) = normalized_email
  ) then
    raise exception 'That user is already on this project';
  end if;

  if exists (
    select 1
    from public.profiles pr
    join public.project_members pm on pm.user_id = pr.id
    where pm.project_id = p_project_id and lower(pr.email) = normalized_email
  ) then
    raise exception 'That user is already on this project';
  end if;

  if exists (
    select 1
    from public.project_invitations pi
    where pi.project_id = p_project_id
      and lower(pi.email) = normalized_email
      and pi.status = 'pending'
  ) then
    select pi.id into invite_id
    from public.project_invitations pi
    where pi.project_id = p_project_id
      and lower(pi.email) = normalized_email
      and pi.status = 'pending';
    return invite_id;
  end if;

  insert into public.project_invitations (project_id, email, role, invited_by)
  values (p_project_id, normalized_email, p_role, auth.uid())
  returning id into invite_id;

  return invite_id;
end;
$$;

create or replace function public.accept_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into inv
  from public.project_invitations
  where id = p_invitation_id and status = 'pending';

  if inv.id is null then
    raise exception 'Invitation not found';
  end if;

  if not public.invitation_is_for_me(inv.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (inv.project_id, uid, inv.role)
  on conflict (project_id, user_id) do update set role = excluded.role;

  update public.project_invitations
  set status = 'accepted'
  where id = inv.id;
end;
$$;

create or replace function public.decline_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into inv
  from public.project_invitations
  where id = p_invitation_id and status = 'pending';

  if inv.id is null then
    raise exception 'Invitation not found';
  end if;

  if not public.invitation_is_for_me(inv.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  update public.project_invitations
  set status = 'declined'
  where id = inv.id;
end;
$$;

create or replace function public.revoke_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into inv
  from public.project_invitations
  where id = p_invitation_id and status = 'pending';

  if inv.id is null then
    raise exception 'Invitation not found';
  end if;

  if not public.is_project_admin(inv.project_id) then
    raise exception 'Only project admins can cancel invitations';
  end if;

  update public.project_invitations
  set status = 'revoked'
  where id = inv.id;
end;
$$;

create or replace function public.remove_project_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row record;
  admin_count int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select pm.*, p.user_id as owner_id
  into member_row
  from public.project_members pm
  join public.projects p on p.id = pm.project_id
  where pm.id = p_member_id;

  if member_row.id is null then
    raise exception 'Member not found';
  end if;

  if not public.is_project_admin(member_row.project_id) then
    raise exception 'Only project admins can remove teammates';
  end if;

  if member_row.user_id = member_row.owner_id then
    raise exception 'The project owner cannot be removed';
  end if;

  select count(*) into admin_count
  from (
    select 1
    from public.projects p
    where p.id = member_row.project_id and p.user_id = member_row.user_id
    union all
    select 1
    from public.project_members pm
    where pm.project_id = member_row.project_id and pm.role = 'admin'
  ) admins;

  if member_row.role = 'admin' and admin_count <= 1 then
    raise exception 'Cannot remove the last admin from a project';
  end if;

  delete from public.project_members where id = p_member_id;
end;
$$;

create or replace function public.submit_incident_fix(
  p_incident_id uuid,
  p_fix_description text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inc record;
  fix_id uuid;
  trimmed text := trim(p_fix_description);
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if trimmed = '' then
    raise exception 'Describe what you fixed before submitting';
  end if;

  select * into inc
  from public.incidents
  where id = p_incident_id;

  if inc.id is null then
    raise exception 'Incident not found';
  end if;

  if not public.can_access_project(inc.project_id) then
    raise exception 'Not allowed';
  end if;

  if inc.status <> 'active' then
    raise exception 'This incident is already resolved';
  end if;

  if exists (
    select 1 from public.incident_fixes f
    where f.incident_id = inc.id and f.status = 'pending'
  ) then
    raise exception 'A fix is already waiting for admin review';
  end if;

  if public.is_project_admin(inc.project_id) then
    insert into public.incident_fixes (
      incident_id, submitted_by, fix_description, status, reviewed_by, reviewed_at
    )
    values (inc.id, auth.uid(), trimmed, 'approved', auth.uid(), now())
    returning id into fix_id;

    update public.incidents
    set status = 'resolved', resolved_at = now()
    where id = inc.id;

    return fix_id;
  end if;

  insert into public.incident_fixes (incident_id, submitted_by, fix_description, status)
  values (inc.id, auth.uid(), trimmed, 'pending')
  returning id into fix_id;

  return fix_id;
end;
$$;

create or replace function public.review_incident_fix(
  p_fix_id uuid,
  p_approve boolean,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fix_row record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select f.*, i.project_id, i.status as incident_status
  into fix_row
  from public.incident_fixes f
  join public.incidents i on i.id = f.incident_id
  where f.id = p_fix_id;

  if fix_row.id is null then
    raise exception 'Fix submission not found';
  end if;

  if not public.is_project_admin(fix_row.project_id) then
    raise exception 'Only project admins can review fixes';
  end if;

  if fix_row.status <> 'pending' then
    raise exception 'This fix has already been reviewed';
  end if;

  if p_approve then
    update public.incident_fixes
    set status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = nullif(trim(coalesce(p_review_note, '')), '')
    where id = fix_row.id;

    update public.incidents
    set status = 'resolved', resolved_at = now()
    where id = fix_row.incident_id;
  else
    update public.incident_fixes
    set status = 'declined',
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_note = nullif(trim(coalesce(p_review_note, '')), '')
    where id = fix_row.id;
  end if;
end;
$$;

create or replace function public.get_my_pending_invitations()
returns table (
  id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  project_id uuid,
  project_name text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    pi.id,
    pi.email,
    pi.role,
    pi.status,
    pi.created_at,
    pi.project_id,
    p.name as project_name
  from public.project_invitations pi
  join public.projects p on p.id = pi.project_id
  where pi.status = 'pending'
    and public.invitation_is_for_me(pi.email);
$$;

grant execute on function public.can_access_project(uuid, uuid) to authenticated;
grant execute on function public.is_project_admin(uuid, uuid) to authenticated;
grant execute on function public.get_my_project_role(uuid) to authenticated;
grant execute on function public.get_my_pending_invitations() to authenticated;
grant execute on function public.invite_project_member(uuid, text, text) to authenticated;
grant execute on function public.accept_project_invitation(uuid) to authenticated;
grant execute on function public.decline_project_invitation(uuid) to authenticated;
grant execute on function public.revoke_project_invitation(uuid) to authenticated;
grant execute on function public.remove_project_member(uuid) to authenticated;
grant execute on function public.submit_incident_fix(uuid, text) to authenticated;
grant execute on function public.review_incident_fix(uuid, boolean, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Owner role, edit requests, and ownership transfer
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.project_edit_requests (
  id            uuid        primary key default gen_random_uuid(),
  project_id    uuid        not null references public.projects (id) on delete cascade,
  requested_by  uuid        not null references auth.users (id) on delete cascade,
  name          text        not null,
  github_repo   text,
  slack_webhook text,
  runbooks      text,
  status        text        not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  reviewed_by   uuid        references auth.users (id) on delete set null,
  reviewed_at     timestamptz,
  created_at    timestamptz not null default now()
);

create index if not exists project_edit_requests_project_id_idx
  on public.project_edit_requests (project_id);

-- Owner is canonical on projects.user_id; remove duplicate owner rows from project_members.
delete from public.project_members pm
using public.projects p
where pm.project_id = p.id and pm.user_id = p.user_id;

create or replace function public.is_project_owner(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1
    from public.projects p
    where p.id = p_project_id and p.user_id = p_user_id
  );
$$;

create or replace function public.is_project_admin(p_project_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select public.is_project_owner(p_project_id, p_user_id)
  or exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = p_user_id
      and pm.role = 'admin'
  );
$$;

create or replace function public.get_my_project_role(p_project_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select case
    when public.is_project_owner(p_project_id) then 'owner'
    else (
      select pm.role
      from public.project_members pm
      where pm.project_id = p_project_id and pm.user_id = auth.uid()
    )
  end;
$$;

create or replace function public.add_project_owner_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Owner lives on projects.user_id only.
  return new;
end;
$$;

drop policy if exists "Project admins can update projects" on public.projects;
drop policy if exists "Project admins can delete projects" on public.projects;
drop policy if exists "Project owners can update projects" on public.projects;
drop policy if exists "Project owners can delete projects" on public.projects;

create policy "Project owners can update projects"
  on public.projects for update
  using (public.is_project_owner(id))
  with check (public.is_project_owner(id));

create policy "Project owners can delete projects"
  on public.projects for delete
  using (public.is_project_owner(id));

alter table public.project_edit_requests enable row level security;

drop policy if exists "Members can view project edit requests" on public.project_edit_requests;
create policy "Members can view project edit requests"
  on public.project_edit_requests for select
  using (
    public.is_project_owner(project_id)
    or (
      requested_by = auth.uid()
      and public.is_project_admin(project_id)
    )
  );

create or replace function public.invite_project_member(
  p_project_id uuid,
  p_email text,
  p_role text default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_id uuid;
  raw_identifier text := trim(p_email);
  normalized_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_project_admin(p_project_id) then
    raise exception 'Only project admins can invite teammates';
  end if;

  if raw_identifier = '' then
    raise exception 'Enter a username or email address';
  end if;

  if position('@' in raw_identifier) > 0 then
    select lower(trim(coalesce(u.email, pr.email)))
    into normalized_email
    from auth.users u
    inner join public.profiles pr on pr.id = u.id
    where lower(coalesce(u.email, pr.email)) = lower(raw_identifier)
    limit 1;
  else
    select lower(trim(coalesce(u.email, pr.email)))
    into normalized_email
    from auth.users u
    inner join public.profiles pr on pr.id = u.id
    where lower(pr.username) = lower(raw_identifier)
    limit 1;
  end if;

  if normalized_email is null or normalized_email = '' then
    raise exception 'Invalid user/email. Please ask them to register to SentinelAI';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;

  if p_role = 'admin' and not public.is_project_owner(p_project_id) then
    raise exception 'Only the project owner can invite admins';
  end if;

  if exists (
    select 1
    from public.profiles pr
    join public.projects p on p.user_id = pr.id and p.id = p_project_id
    where lower(pr.email) = normalized_email
  ) then
    raise exception 'That user is already on this project';
  end if;

  if exists (
    select 1
    from public.profiles pr
    join public.project_members pm on pm.user_id = pr.id
    where pm.project_id = p_project_id and lower(pr.email) = normalized_email
  ) then
    raise exception 'That user is already on this project';
  end if;

  if exists (
    select 1
    from public.project_invitations pi
    where pi.project_id = p_project_id
      and lower(pi.email) = normalized_email
      and pi.status = 'pending'
  ) then
    select pi.id into invite_id
    from public.project_invitations pi
    where pi.project_id = p_project_id
      and lower(pi.email) = normalized_email
      and pi.status = 'pending';
    return invite_id;
  end if;

  insert into public.project_invitations (project_id, email, role, invited_by)
  values (p_project_id, normalized_email, p_role, auth.uid())
  returning id into invite_id;

  return invite_id;
end;
$$;

create or replace function public.accept_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into inv
  from public.project_invitations
  where id = p_invitation_id and status = 'pending';

  if inv.id is null then
    raise exception 'Invitation not found';
  end if;

  if not public.invitation_is_for_me(inv.email) then
    raise exception 'This invitation was sent to a different email address';
  end if;

  insert into public.project_members (project_id, user_id, role)
  values (inv.project_id, uid, inv.role)
  on conflict (project_id, user_id) do update set role = excluded.role;

  update public.project_invitations
  set status = 'accepted'
  where id = inv.id;
end;
$$;

create or replace function public.revoke_project_invitation(p_invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into inv
  from public.project_invitations
  where id = p_invitation_id and status = 'pending';

  if inv.id is null then
    raise exception 'Invitation not found';
  end if;

  if not public.is_project_admin(inv.project_id) then
    raise exception 'Only project admins can cancel invitations';
  end if;

  if inv.role = 'admin' and not public.is_project_owner(inv.project_id) then
    raise exception 'Only the project owner can cancel admin invitations';
  end if;

  update public.project_invitations
  set status = 'revoked'
  where id = inv.id;
end;
$$;

create or replace function public.remove_project_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select pm.*, p.user_id as owner_id
  into member_row
  from public.project_members pm
  join public.projects p on p.id = pm.project_id
  where pm.id = p_member_id;

  if member_row.id is null then
    raise exception 'Member not found';
  end if;

  if member_row.user_id = member_row.owner_id then
    raise exception 'The project owner cannot be removed';
  end if;

  if public.is_project_owner(member_row.project_id) then
    delete from public.project_members where id = p_member_id;
    return;
  end if;

  if not public.is_project_admin(member_row.project_id) then
    raise exception 'Only project admins can remove teammates';
  end if;

  if member_row.role = 'admin' then
    raise exception 'Only the project owner can remove admins';
  end if;

  delete from public.project_members where id = p_member_id;
end;
$$;

create or replace function public.set_project_member_role(
  p_member_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  member_row record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'Invalid role';
  end if;

  select pm.*, p.user_id as owner_id
  into member_row
  from public.project_members pm
  join public.projects p on p.id = pm.project_id
  where pm.id = p_member_id;

  if member_row.id is null then
    raise exception 'Member not found';
  end if;

  if not public.is_project_owner(member_row.project_id) then
    raise exception 'Only the project owner can change admin roles';
  end if;

  if member_row.user_id = member_row.owner_id then
    raise exception 'Transfer ownership instead of changing the owner role';
  end if;

  update public.project_members
  set role = p_role
  where id = p_member_id;
end;
$$;

create or replace function public.leave_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_project_owner(p_project_id) then
    raise exception 'The project owner cannot leave. Transfer ownership first.';
  end if;

  delete from public.project_members
  where project_id = p_project_id and user_id = auth.uid();
end;
$$;

create or replace function public.transfer_project_ownership(
  p_project_id uuid,
  p_new_owner_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_owner_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not public.is_project_owner(p_project_id) then
    raise exception 'Only the project owner can transfer ownership';
  end if;

  if p_new_owner_user_id = auth.uid() then
    raise exception 'Choose a different teammate';
  end if;

  if not exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id and pm.user_id = p_new_owner_user_id
  ) then
    raise exception 'The new owner must already be on the project team';
  end if;

  select user_id into old_owner_id from public.projects where id = p_project_id;

  update public.projects
  set user_id = p_new_owner_user_id, updated_at = now()
  where id = p_project_id;

  delete from public.project_members
  where project_id = p_project_id and user_id = p_new_owner_user_id;

  insert into public.project_members (project_id, user_id, role)
  values (p_project_id, old_owner_id, 'admin')
  on conflict (project_id, user_id) do update set role = 'admin';
end;
$$;

create or replace function public.request_project_edit(
  p_project_id uuid,
  p_name text,
  p_github_repo text,
  p_slack_webhook text,
  p_runbooks text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.is_project_owner(p_project_id) then
    raise exception 'Owners can edit the project directly';
  end if;

  if not public.is_project_admin(p_project_id) then
    raise exception 'Only project admins can request edits';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Project name is required';
  end if;

  insert into public.project_edit_requests (
    project_id, requested_by, name, github_repo, slack_webhook, runbooks
  )
  values (
    p_project_id,
    auth.uid(),
    trim(p_name),
    nullif(trim(coalesce(p_github_repo, '')), ''),
    nullif(trim(coalesce(p_slack_webhook, '')), ''),
    nullif(trim(coalesce(p_runbooks, '')), '')
  )
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.review_project_edit_request(
  p_request_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  req record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into req
  from public.project_edit_requests
  where id = p_request_id;

  if req.id is null then
    raise exception 'Edit request not found';
  end if;

  if not public.is_project_owner(req.project_id) then
    raise exception 'Only the project owner can review edit requests';
  end if;

  if req.status <> 'pending' then
    raise exception 'This edit request has already been reviewed';
  end if;

  if p_approve then
    update public.projects
    set
      name = req.name,
      github_repo = req.github_repo,
      slack_webhook = req.slack_webhook,
      runbooks = req.runbooks,
      updated_at = now()
    where id = req.project_id;

    update public.project_edit_requests
    set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    where id = req.id;
  else
    update public.project_edit_requests
    set status = 'declined', reviewed_by = auth.uid(), reviewed_at = now()
    where id = req.id;
  end if;
end;
$$;

grant execute on function public.is_project_owner(uuid, uuid) to authenticated;
grant execute on function public.get_my_pending_invitations() to authenticated;
grant execute on function public.revoke_project_invitation(uuid) to authenticated;
grant execute on function public.set_project_member_role(uuid, text) to authenticated;
grant execute on function public.leave_project(uuid) to authenticated;
grant execute on function public.transfer_project_ownership(uuid, uuid) to authenticated;
grant execute on function public.request_project_edit(uuid, text, text, text, text) to authenticated;
grant execute on function public.review_project_edit_request(uuid, boolean) to authenticated;
