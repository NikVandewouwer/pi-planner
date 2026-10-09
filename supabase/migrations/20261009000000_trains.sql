-- Trains shared between signed-in users.
--
-- A train is stored as one document: `art` holds the Art (teams, PIs, roles, platforms, feature
-- types) exactly as the client models it, and `avail` holds the availability of its members
-- (memberId -> date -> value). The client runs both through `migrate` when it reads them, so the
-- shape inside the jsonb can evolve without SQL migrations.
--
-- `version` is bumped by every save. The client only updates a row whose version it last saw,
-- so concurrent edits are detected instead of silently overwritten.

create table public.trains (
  id text primary key,
  name text not null default '',
  art jsonb not null,
  avail jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users on delete set null
);

create table public.train_members (
  train_id text not null references public.trains on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor')),
  created_at timestamptz not null default now(),
  primary key (train_id, user_id)
);
create index train_members_user_idx on public.train_members (user_id);

-- Shares with an email address that has no account yet. Claimed when that user signs in.
create table public.train_invites (
  train_id text not null references public.trains on delete cascade,
  email text not null check (email = lower(email)),
  role text not null default 'editor' check (role in ('owner', 'editor')),
  invited_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (train_id, email)
);

/* ---------- helpers (security definer so policies don't recurse into train_members) ---------- */

create function public.is_train_member(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.train_members m where m.train_id = t and m.user_id = auth.uid())
$$;

create function public.is_train_owner(t text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.train_members m where m.train_id = t and m.user_id = auth.uid() and m.role = 'owner')
$$;

-- Whoever creates a train owns it.
create function public.trains_add_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.train_members (train_id, user_id, role) values (new.id, auth.uid(), 'owner');
  return new;
end $$;

create trigger trains_add_owner after insert on public.trains
  for each row execute function public.trains_add_owner();

create function public.trains_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger trains_touch before update on public.trains
  for each row execute function public.trains_touch();

/* ---------- row level security ---------- */

alter table public.trains enable row level security;
alter table public.train_members enable row level security;
alter table public.train_invites enable row level security;

create policy "members read" on public.trains for select to authenticated using (public.is_train_member(id));
create policy "signed-in users create" on public.trains for insert to authenticated with check (auth.uid() is not null);
create policy "members edit" on public.trains for update to authenticated using (public.is_train_member(id)) with check (public.is_train_member(id));
create policy "owners delete" on public.trains for delete to authenticated using (public.is_train_owner(id));

create policy "members see each other" on public.train_members for select to authenticated using (public.is_train_member(train_id));
-- Leave a train yourself, or remove someone as its owner. Adding goes through share_train().
create policy "leave or remove" on public.train_members for delete to authenticated
  using (user_id = auth.uid() or public.is_train_owner(train_id));

create policy "members see invites" on public.train_invites for select to authenticated using (public.is_train_member(train_id));
create policy "owners withdraw invites" on public.train_invites for delete to authenticated using (public.is_train_owner(train_id));

/* ---------- functions called by the client ---------- */

-- Share a train with an email address. Adds an existing user right away, otherwise stores an
-- invite that is claimed when they sign in. Returns 'added' or 'invited'.
create function public.share_train(p_train text, p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(p_email));
  uid uuid;
begin
  if not public.is_train_member(p_train) then raise exception 'not a member of this train'; end if;
  if e !~ '^[^@\s]+@[^@\s]+$' then raise exception 'invalid email'; end if;
  select u.id into uid from auth.users u where lower(u.email) = e;
  if uid is not null then
    insert into public.train_members (train_id, user_id, role) values (p_train, uid, 'editor')
      on conflict do nothing;
    return 'added';
  end if;
  insert into public.train_invites (train_id, email) values (p_train, e) on conflict do nothing;
  return 'invited';
end $$;

-- Turn invites for the signed-in user's email into memberships. Returns how many were claimed.
create function public.claim_invites() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(auth.jwt() ->> 'email');
  n integer;
begin
  if auth.uid() is null or e is null then return 0; end if;
  with claimed as (
    delete from public.train_invites i where i.email = e returning i.train_id, i.role
  )
  insert into public.train_members (train_id, user_id, role)
    select train_id, auth.uid(), role from claimed
    on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- People with access to a train, including pending invites.
create function public.train_people(p_train text)
returns table (user_id uuid, email text, role text, pending boolean)
language sql stable security definer set search_path = '' as $$
  select m.user_id, u.email::text, m.role, false
    from public.train_members m join auth.users u on u.id = m.user_id
    where m.train_id = p_train and public.is_train_member(p_train)
  union all
  select null, i.email, i.role, true
    from public.train_invites i
    where i.train_id = p_train and public.is_train_member(p_train)
  order by 4, 3 desc, 2
$$;

revoke execute on function public.share_train(text, text), public.claim_invites(), public.train_people(text) from anon, public;
grant execute on function public.share_train(text, text), public.claim_invites(), public.train_people(text) to authenticated;

/* ---------- realtime: clients refetch a train when its version changes ---------- */

alter publication supabase_realtime add table public.trains, public.train_members;
