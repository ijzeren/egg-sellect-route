-- Egg-sellent — databaseschema voor Supabase
-- Uitvoeren in Supabase: Dashboard → SQL Editor → plak dit hele bestand → Run.
-- Veilig om opnieuw uit te voeren (idempotent waar mogelijk).
--
-- Opbouw
--   teams          één eierbedrijf / verkoper, met de instellingen (loopdagen e.d.)
--   team_members   wie er in een team zit (beheerder of bezorger)
--   team_invites   uitnodigingscodes om lid te worden
--   addresses, visits, absences, orders   de gegevens van het team
--
-- Sync-afspraken (zie index.html, "sync")
--   updated_at  tijd van de wijziging volgens de telefoon → laatste wijziging wint
--   deleted     verwijderd-markering, zodat verwijderen op alle telefoons doorkomt
--   server_ts   gezet door de server bij elke wijziging → hiermee haalt een telefoon "wat is er nieuw" op

create extension if not exists pgcrypto;

-- ---------- tabellen ----------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  walk_days int[] not null default '{}',
  order_round int not null default 1,
  absence_script text not null default '',
  settings_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  server_ts timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'walker' check (role in ('admin', 'walker')),
  name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user on public.team_members(user_id);

create table if not exists public.team_invites (
  code text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  role text not null default 'walker' check (role in ('admin', 'walker')),
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table if not exists public.addresses (
  team_id uuid not null references public.teams(id) on delete cascade,
  id text not null,
  street text not null default '',
  number text not null default '',
  name text not null default '',
  email text not null default '',
  freq int not null default 1 check (freq between 1 and 4),
  note text not null default '',
  pref_days int[] not null default '{}',
  sort double precision not null default 0,
  excluded boolean not null default false,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  updated_by uuid default auth.uid(),
  server_ts timestamptz not null default now(),
  primary key (team_id, id)
);

-- id = "<address_id>_<datum>": twee telefoons die hetzelfde huis op dezelfde dag invullen, schrijven naar dezelfde rij.
create table if not exists public.visits (
  team_id uuid not null references public.teams(id) on delete cascade,
  id text not null,
  address_id text not null,
  date date not null,
  status text not null check (status in ('sold', 'none', 'nothome')),
  eggs int not null default 0,
  next_date date,
  next_eggs int,
  next_manual boolean not null default false,
  note text not null default '',
  double boolean not null default false,
  offered boolean not null default false,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  updated_by uuid default auth.uid(),
  server_ts timestamptz not null default now(),
  primary key (team_id, id)
);

create table if not exists public.absences (
  team_id uuid not null references public.teams(id) on delete cascade,
  date date not null,
  note text not null default '',
  deleted boolean not null default false,
  updated_at timestamptz not null,
  updated_by uuid default auth.uid(),
  server_ts timestamptz not null default now(),
  primary key (team_id, date)
);

create table if not exists public.orders (
  team_id uuid not null references public.teams(id) on delete cascade,
  week_start date not null,
  amount int not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null,
  updated_by uuid default auth.uid(),
  server_ts timestamptz not null default now(),
  primary key (team_id, week_start)
);

-- toegevoegd in v2.2: optioneel e-mailadres per adres (voor bestaande databases)
alter table public.addresses add column if not exists email text not null default '';
-- toegevoegd in v2.5: vaste frequentie in weken (1 = elke week)
alter table public.addresses add column if not exists freq int not null default 1 check (freq between 1 and 4);

create index if not exists addresses_sync on public.addresses(team_id, server_ts);
create index if not exists visits_sync on public.visits(team_id, server_ts);
create index if not exists absences_sync on public.absences(team_id, server_ts);
create index if not exists orders_sync on public.orders(team_id, server_ts);

-- Voorraad (v2.6): leveringen (besteld / geleverd / kapot) en tellingen. Verkoop komt uit visits.
-- kind = 'delivery': ordered (besteld), delivered (geleverd, leeg = nog onderweg), broken (kapot)
-- kind = 'count':    counted = werkelijk getelde voorraad op die dag (verschil gaat er FIFO af)
create table if not exists public.stock_events (
  team_id uuid not null references public.teams(id) on delete cascade,
  id text not null,
  date date not null default current_date,
  kind text not null default 'delivery' check (kind in ('delivery', 'count')),
  ordered int,
  delivered int,
  broken int not null default 0,
  counted int,
  note text not null default '',
  deleted boolean not null default false,
  updated_at timestamptz not null,
  updated_by uuid default auth.uid(),
  server_ts timestamptz not null default now(),
  primary key (team_id, id)
);
create index if not exists stock_events_sync on public.stock_events(team_id, server_ts);

-- Instellingen voor bestellen (v2.6)
alter table public.teams add column if not exists margin_pct int not null default 10 check (margin_pct between 0 and 100);
alter table public.teams add column if not exists order_dow int not null default 5 check (order_dow between 0 and 6);
alter table public.teams add column if not exists delivery_dow int not null default 3 check (delivery_dow between 0 and 6);

-- ---------- laatste wijziging wint + server-tijdstempel ----------
create or replace function public.sync_row() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- oudere wijziging (bijv. van een telefoon die lang offline was): negeren
  end if;
  new.server_ts := clock_timestamp();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end $$;

create or replace function public.team_row() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.settings_updated_at < old.settings_updated_at then
    new.walk_days := old.walk_days;
    new.order_round := old.order_round;
    new.absence_script := old.absence_script;
    new.margin_pct := old.margin_pct;
    new.order_dow := old.order_dow;
    new.delivery_dow := old.delivery_dow;
    new.settings_updated_at := old.settings_updated_at;
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['addresses', 'visits', 'absences', 'orders', 'stock_events'] loop
    execute format('drop trigger if exists sync_row on public.%I', t);
    execute format('create trigger sync_row before insert or update on public.%I for each row execute function public.sync_row()', t);
  end loop;
end $$;
drop trigger if exists team_row on public.teams;
create trigger team_row before insert or update on public.teams for each row execute function public.team_row();

-- ---------- wie mag wat (row level security) ----------
create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid());
$$;
create or replace function public.is_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = t and user_id = auth.uid() and role = 'admin');
$$;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invites enable row level security;
alter table public.addresses enable row level security;
alter table public.visits enable row level security;
alter table public.absences enable row level security;
alter table public.orders enable row level security;
alter table public.stock_events enable row level security;

drop policy if exists teams_select on public.teams;
create policy teams_select on public.teams for select using (public.is_member(id));
drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update using (public.is_admin(id)) with check (public.is_admin(id));

drop policy if exists members_select on public.team_members;
create policy members_select on public.team_members for select using (public.is_member(team_id));
drop policy if exists members_delete on public.team_members;
create policy members_delete on public.team_members for delete using (public.is_admin(team_id) or user_id = auth.uid());
drop policy if exists members_update_self on public.team_members;
create policy members_update_self on public.team_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists invites_admin on public.team_invites;
create policy invites_admin on public.team_invites for all using (public.is_admin(team_id)) with check (public.is_admin(team_id));

do $$
declare t text;
begin
  foreach t in array array['addresses', 'visits', 'absences', 'orders', 'stock_events'] loop
    execute format('drop policy if exists team_data on public.%I', t);
    execute format('create policy team_data on public.%I for all using (public.is_member(team_id)) with check (public.is_member(team_id))', t);
  end loop;
end $$;

-- Een lid mag zijn eigen rol niet ophogen (alleen naam wijzigen).
create or replace function public.member_guard() returns trigger
language plpgsql as $$
begin
  if new.role <> old.role and not public.is_admin(old.team_id) then
    raise exception 'Alleen een beheerder kan rollen wijzigen';
  end if;
  return new;
end $$;
drop trigger if exists member_guard on public.team_members;
create trigger member_guard before update on public.team_members for each row execute function public.member_guard();

-- ---------- acties (functies) ----------
-- Nieuw team: de maker wordt beheerder.
create or replace function public.create_team(p_name text, p_member_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  insert into teams(name) values (trim(p_name)) returning id into t;
  insert into team_members(team_id, user_id, role, name) values (t, auth.uid(), 'admin', coalesce(p_member_name, ''));
  return t;
end $$;

-- Uitnodigingscode maken (alleen beheerder). 6 tekens, zonder verwarrende letters.
create or replace function public.create_invite(p_team uuid, p_role text default 'walker')
returns text language plpgsql security definer set search_path = public as $$
declare c text; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if not public.is_admin(p_team) then raise exception 'Alleen een beheerder kan uitnodigen'; end if;
  delete from team_invites where team_id = p_team; -- nieuwe code maakt de vorige ongeldig
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from team_invites where code = c);
  end loop;
  insert into team_invites(code, team_id, created_by, role) values (c, p_team, auth.uid(), coalesce(p_role, 'walker'));
  return c;
end $$;

-- Lid worden met een code (14 dagen bruikbaar, ook voor meerdere mensen, tot er een nieuwe code wordt gemaakt).
create or replace function public.join_team(p_code text, p_member_name text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare inv team_invites;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  select * into inv from team_invites where code = upper(trim(p_code)) and expires_at > now();
  if inv is null then raise exception 'Deze code is onbekend of verlopen'; end if;
  insert into team_members(team_id, user_id, role, name) values (inv.team_id, auth.uid(), inv.role, coalesce(p_member_name, ''))
  on conflict (team_id, user_id) do nothing;
  return inv.team_id;
end $$;

-- Mijn teams (na inloggen).
create or replace function public.my_teams()
returns table(team_id uuid, team_name text, role text, member_name text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, m.role, m.name from team_members m join teams t on t.id = m.team_id
  where m.user_id = auth.uid() order by m.joined_at;
$$;

revoke all on function public.create_team(text, text) from public, anon;
revoke all on function public.create_invite(uuid, text) from public, anon;
revoke all on function public.join_team(text, text) from public, anon;
revoke all on function public.my_teams() from public, anon;
grant execute on function public.create_team(text, text) to authenticated;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.join_team(text, text) to authenticated;
grant execute on function public.my_teams() to authenticated;

grant select, insert, update, delete on public.addresses, public.visits, public.absences, public.orders, public.stock_events to authenticated;
grant select, update on public.teams to authenticated;
grant select, update, delete on public.team_members to authenticated;
grant select, insert, delete on public.team_invites to authenticated;
revoke all on public.teams, public.team_members, public.team_invites, public.addresses, public.visits, public.absences, public.orders, public.stock_events from anon;

-- ---------- meldingen (web push), toegevoegd in v2.3 ----------
-- Eén rij per telefoon die meldingen wil. prefs: { walkday: "07:00" | null, order: { dow: 5, time: "18:00" } | null, team: true }
create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,
  tz text not null default 'Europe/Amsterdam',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_member(team_id));
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Samenvatting die de app na elke synchronisatie bijwerkt, zodat de server meldingen met getallen kan sturen
-- zonder de route-logica te kopiëren. key = 'day:2026-11-24' of 'week:2026-11-23'.
create table if not exists public.team_digest (
  team_id uuid not null references public.teams(id) on delete cascade,
  key text not null,
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, key)
);
alter table public.team_digest enable row level security;
drop policy if exists team_data on public.team_digest;
create policy team_data on public.team_digest for all using (public.is_member(team_id)) with check (public.is_member(team_id));
grant select, insert, update, delete on public.team_digest to authenticated;

-- Wat er al verstuurd is (zodat een herinnering maar één keer per dag gaat). Alleen voor de server.
create table if not exists public.push_log (
  endpoint text not null,
  kind text not null,
  day date not null,
  sent_at timestamptz not null default now(),
  primary key (endpoint, kind, day)
);
alter table public.push_log enable row level security;
revoke all on public.push_subscriptions, public.team_digest, public.push_log from anon;
revoke all on public.push_log from authenticated;
