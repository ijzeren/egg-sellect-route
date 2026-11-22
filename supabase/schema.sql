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
  role text not null default 'member' check (role in ('admin', 'member', 'child')),
  name text not null default '',
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index if not exists team_members_user on public.team_members(user_id);

create table if not exists public.team_invites (
  code text primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  role text not null default 'member' check (role in ('admin', 'member', 'child')),
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
  kind text not null default 'delivery' check (kind in ('delivery', 'count', 'boxes', 'boxreturn', 'boxcount', 'wafelin', 'wafelcount')),
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
-- Doosjes van 6 en 10 (v2.7): gekocht, terug van klanten en geteld, in dezelfde tabel
alter table public.stock_events add column if not exists box6 int;
alter table public.stock_events add column if not exists box10 int;
alter table public.stock_events drop constraint if exists stock_events_kind_check;
alter table public.stock_events add constraint stock_events_kind_check check (kind in ('delivery', 'count', 'boxes', 'boxreturn', 'boxcount', 'wafelin', 'wafelcount'));
-- Stroopwafels (v2.8): weken waarin ze verkocht worden (maandag van de week), hoeveel weken vooraf aankondigen,
-- en per bezoek de verkochte en de afgesproken pakjes. Voorraad pakjes: stock_events wafelin (delivered) en wafelcount (counted).
alter table public.teams add column if not exists stroop_weeks date[] not null default '{}';
alter table public.teams add column if not exists stroop_lead int not null default 2 check (stroop_lead between 1 and 8);
alter table public.visits add column if not exists wafels int not null default 0 check (wafels >= 0);
alter table public.visits add column if not exists wafels_next int check (wafels_next >= 0);

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
    new.stroop_weeks := old.stroop_weeks;
    new.stroop_lead := old.stroop_lead;
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

-- Rollen wijzigen mag alleen een beheerder, en een gezin houdt altijd minstens één beheerder (zolang er leden zijn).
-- Zonder ingelogde gebruiker (SQL Editor, migraties) geldt de controle niet.
create or replace function public.member_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return case when tg_op = 'DELETE' then old else new end; end if;
  if tg_op = 'UPDATE' and new.role <> old.role and not public.is_admin(old.team_id) then
    raise exception 'Alleen een beheerder kan rollen wijzigen';
  end if;
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin')
     and not exists (select 1 from team_members where team_id = old.team_id and role = 'admin' and user_id <> old.user_id)
     and exists (select 1 from team_members where team_id = old.team_id and user_id <> old.user_id) then
    raise exception 'Er moet minstens één beheerder in het gezin blijven';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists member_guard on public.team_members;
create trigger member_guard before update or delete on public.team_members for each row execute function public.member_guard();

-- ---------- acties (functies) ----------
-- Nieuw gezin (create_team) en mijn gezinnen (my_teams): zie "Gezin: rollen, rechten en apps" verderop.

-- Uitnodigingscode maken (alleen beheerder). 6 tekens, zonder verwarrende letters.
create or replace function public.create_invite(p_team uuid, p_role text default 'member')
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
  if coalesce(p_role, 'member') not in ('admin', 'member', 'child') then raise exception 'Onbekende rol'; end if;
  insert into team_invites(code, team_id, created_by, role) values (c, p_team, auth.uid(), coalesce(p_role, 'member'));
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

revoke all on function public.create_invite(uuid, text) from public, anon;
revoke all on function public.join_team(text, text) from public, anon;
grant execute on function public.create_invite(uuid, text) to authenticated;
grant execute on function public.join_team(text, text) to authenticated;

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

-- ---------- Gezin: rollen, rechten en apps (familie-app, v3.1) ----------
-- Een gezin is in deze database een team. Gezinsrollen (team_members.role):
--   admin  beheerder: gezin, leden, uitnodigingen en apps beheren
--   member lid: gebruikt de apps die aan staan
--   child  kind: alleen apps die een beheerder voor hem/haar aanzet
-- team_apps         welke apps het gezin heeft aangezet (+ instellingen per app, voor later)
-- team_member_apps  per lid per app: toegang (null = standaard: iedereen behalve kinderen) en app-rol
--                   (null = standaard: gezinsbeheerder → 'admin', anders 'member'). Egg-sellent kent 'admin' en 'walker'.
create table if not exists public.team_apps (
  team_id uuid not null references public.teams(id) on delete cascade,
  app text not null check (app ~ '^[a-z][a-z0-9-]{1,30}$'),
  enabled boolean not null default true,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (team_id, app)
);
create table if not exists public.team_member_apps (
  team_id uuid not null,
  user_id uuid not null,
  app text not null check (app ~ '^[a-z][a-z0-9-]{1,30}$'),
  access boolean,
  role text check (role ~ '^[a-z]{2,20}$'),
  primary key (team_id, user_id, app),
  foreign key (team_id, user_id) references public.team_members(team_id, user_id) on delete cascade
);

-- Migratie van teams naar gezinnen (veilig om opnieuw te draaien; er gaan geen gegevens verloren):
-- 1. teamrol 'walker' (bezorger) → gezinsrol 'member' + rol 'walker' in Egg-sellent
insert into public.team_member_apps (team_id, user_id, app, role)
  select team_id, user_id, 'eggs', 'walker' from public.team_members where role = 'walker'
  on conflict (team_id, user_id, app) do update set role = coalesce(public.team_member_apps.role, excluded.role);
alter table public.team_members drop constraint if exists team_members_role_check;
update public.team_members set role = 'member' where role = 'walker';
alter table public.team_members add constraint team_members_role_check check (role in ('admin', 'member', 'child'));
alter table public.team_members alter column role set default 'member';
alter table public.team_invites drop constraint if exists team_invites_role_check;
update public.team_invites set role = 'member' where role = 'walker';
alter table public.team_invites add constraint team_invites_role_check check (role in ('admin', 'member', 'child'));
alter table public.team_invites alter column role set default 'member';
-- 2. teams van vóór de familie-app waren eierbedrijven: Egg-sellent aan
insert into public.team_apps (team_id, app) select id, 'eggs' from public.teams where created_at < '2026-11-23'
  on conflict (team_id, app) do nothing;

-- Mag de ingelogde gebruiker deze app in dit gezin gebruiken?
create or replace function public.has_app(t uuid, a text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_apps ta
    join team_members m on m.team_id = ta.team_id and m.user_id = auth.uid()
    left join team_member_apps x on x.team_id = m.team_id and x.user_id = m.user_id and x.app = ta.app
    where ta.team_id = t and ta.app = a and ta.enabled and coalesce(x.access, m.role <> 'child'));
$$;
-- Rol van de ingelogde gebruiker in deze app (null = geen toegang).
create or replace function public.app_role(t uuid, a text) returns text
language sql stable security definer set search_path = public as $$
  select case when public.has_app(t, a) then coalesce(x.role, case when m.role = 'admin' then 'admin' else 'member' end) end
  from team_members m left join team_member_apps x on x.team_id = m.team_id and x.user_id = m.user_id and x.app = a
  where m.team_id = t and m.user_id = auth.uid();
$$;

alter table public.team_apps enable row level security;
alter table public.team_member_apps enable row level security;
drop policy if exists apps_select on public.team_apps;
create policy apps_select on public.team_apps for select using (public.is_member(team_id));
drop policy if exists apps_admin on public.team_apps;
create policy apps_admin on public.team_apps for all using (public.is_admin(team_id)) with check (public.is_admin(team_id));
drop policy if exists member_apps_select on public.team_member_apps;
create policy member_apps_select on public.team_member_apps for select using (public.is_member(team_id));
drop policy if exists member_apps_admin on public.team_member_apps;
create policy member_apps_admin on public.team_member_apps for all using (public.is_admin(team_id)) with check (public.is_admin(team_id));
grant select, insert, update, delete on public.team_apps, public.team_member_apps to authenticated;
revoke all on public.team_apps, public.team_member_apps from anon;

-- Gegevens van Egg-sellent: alleen voor wie de app mag gebruiken.
do $$
declare t text;
begin
  foreach t in array array['addresses', 'visits', 'absences', 'orders', 'stock_events', 'team_digest'] loop
    execute format('drop policy if exists team_data on public.%I', t);
    execute format('create policy team_data on public.%I for all using (public.has_app(team_id, ''eggs'')) with check (public.has_app(team_id, ''eggs''))', t);
  end loop;
end $$;
drop policy if exists push_own on public.push_subscriptions;
create policy push_own on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.has_app(team_id, 'eggs'));
-- De instellingen van Egg-sellent staan (nog) op teams: gezinsbeheerder of beheerder in Egg-sellent mag ze wijzigen.
-- De naam van het gezin blijft voor gezinsbeheerders (zie team_row).
drop policy if exists teams_update on public.teams;
create policy teams_update on public.teams for update
  using (public.is_admin(id) or public.app_role(id, 'eggs') = 'admin') with check (public.is_admin(id) or public.app_role(id, 'eggs') = 'admin');
create or replace function public.team_name_guard() returns trigger
language plpgsql as $$
begin
  if new.name <> old.name and auth.uid() is not null and not public.is_admin(old.id) then
    raise exception 'Alleen een beheerder van het gezin kan de naam wijzigen';
  end if;
  return new;
end $$;
drop trigger if exists team_name_guard on public.teams;
create trigger team_name_guard before update on public.teams for each row execute function public.team_name_guard();

-- Beheerders mogen rollen en namen van leden wijzigen.
drop policy if exists members_update_admin on public.team_members;
create policy members_update_admin on public.team_members for update using (public.is_admin(team_id)) with check (public.is_admin(team_id));

-- Nieuw gezin: de maker wordt beheerder; p_apps = apps die meteen aan gaan (bijv. '{eggs}').
drop function if exists public.create_team(text, text);
create or replace function public.create_team(p_name text, p_member_name text default '', p_apps text[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid; a text;
begin
  if auth.uid() is null then raise exception 'Niet ingelogd'; end if;
  insert into teams(name) values (trim(p_name)) returning id into t;
  insert into team_members(team_id, user_id, role, name) values (t, auth.uid(), 'admin', coalesce(p_member_name, ''));
  foreach a in array coalesce(p_apps, '{}') loop insert into team_apps(team_id, app) values (t, a) on conflict do nothing; end loop;
  return t;
end $$;

-- Mijn gezinnen, met mijn rol en de apps die ik daar mag gebruiken: { "eggs": { "role": "walker" }, … }.
drop function if exists public.my_teams();
create or replace function public.my_teams()
returns table(team_id uuid, team_name text, role text, member_name text, apps jsonb)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, m.role, m.name,
    coalesce((select jsonb_object_agg(ta.app, jsonb_build_object('role', coalesce(x.role, case when m.role = 'admin' then 'admin' else 'member' end)))
      from team_apps ta left join team_member_apps x on x.team_id = ta.team_id and x.user_id = m.user_id and x.app = ta.app
      where ta.team_id = t.id and ta.enabled and coalesce(x.access, m.role <> 'child')), '{}'::jsonb)
  from team_members m join teams t on t.id = m.team_id
  where m.user_id = auth.uid() order by m.joined_at;
$$;
revoke all on function public.create_team(text, text, text[]) from public, anon;
revoke all on function public.my_teams() from public, anon;
revoke all on function public.has_app(uuid, text) from public, anon;
revoke all on function public.app_role(uuid, text) from public, anon;
grant execute on function public.create_team(text, text, text[]) to authenticated;
grant execute on function public.my_teams() to authenticated;
grant execute on function public.has_app(uuid, text) to authenticated;
grant execute on function public.app_role(uuid, text) to authenticated;

-- ---------- Training (familie-app) ----------
-- Een gezin is in deze database een team (teams / team_members / team_invites, aansluiten met een code).
-- training_tracks: één voortgang in een trainingsprogramma (bijv. 'pilates30') met één of meer deelnemers
-- uit het gezin. Samen trainen = één track met meerdere deelnemers; apart = ieder een eigen track.
-- data = voortgang (instellingen, log, resetAt). De telefoon voegt zijn versie samen met die van de server
-- (log = vereniging, instellingen = nieuwste, resetAt = laatste; zie training/program.js → merge()).
-- name/participants/deleted: laatste wijziging wint (updated_at). Alle gezinsleden zien alle tracks.
create table if not exists public.training_tracks (
  team_id uuid not null references public.teams(id) on delete cascade,
  id text not null check (length(id) between 1 and 80),
  program text not null check (length(program) between 1 and 40),
  name text not null default '',
  participants uuid[] not null default '{}',
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (team_id, id)
);
create index if not exists training_tracks_program on public.training_tracks(team_id, program);
alter table public.training_tracks enable row level security;
drop policy if exists team_data on public.training_tracks;
create policy team_data on public.training_tracks for all using (public.has_app(team_id, 'training')) with check (public.has_app(team_id, 'training'));
revoke all on public.training_tracks from anon;
grant select, insert, update, delete on public.training_tracks to authenticated;

-- ---------- Hulp: FAQ, vragen en antwoorden (familie-app, v3.2) ----------
-- platform_roles  rollen over alle gezinnen heen: 'admin' = hoofdbeheer van alle apps (FAQ beheren),
--                 'runner' = de Assistent (een geplande Claude-routine) die open vragen beantwoordt.
-- faq             veelgestelde vragen voor alle gezinnen (ook zonder login te lezen als gepubliceerd)
-- questions       vragen van een gezinslid; alleen zichtbaar binnen het eigen gezin
-- answers         antwoorden van gezinsleden of van de Assistent; de vrager of een gezinsbeheerder keurt goed
-- De runner en de hoofdbeheerder krijgen GEEN leesrechten op de tabellen van gezinnen, alleen deze functies:
--   runner_open_questions(), runner_answer()            alleen vraagtekst + app, geen namen of gezin
--   faq_candidates(), faq_publish(), faq_decline()       alleen goedgekeurde antwoorden
create table if not exists public.platform_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'runner')),
  primary key (user_id, role)
);
alter table public.platform_roles enable row level security;
drop policy if exists platform_roles_self on public.platform_roles;
create policy platform_roles_self on public.platform_roles for select using (user_id = auth.uid());
grant select on public.platform_roles to authenticated;
revoke all on public.platform_roles from anon;
create or replace function public.has_platform_role(r text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_roles where user_id = auth.uid() and role = r);
$$;

create table if not exists public.faq (
  id uuid primary key default gen_random_uuid(),
  app text check (app is null or app ~ '^[a-z][a-z0-9-]{1,30}$'),
  question text not null check (length(trim(question)) > 0),
  answer text not null check (length(trim(answer)) > 0),
  sort int not null default 100,
  published boolean not null default true,
  source_question uuid,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.faq enable row level security;
drop policy if exists faq_read on public.faq;
create policy faq_read on public.faq for select to authenticated using (published or public.has_platform_role('admin'));
drop policy if exists faq_read_public on public.faq;
create policy faq_read_public on public.faq for select to anon using (published);
drop policy if exists faq_admin on public.faq;
create policy faq_admin on public.faq for all to authenticated using (public.has_platform_role('admin')) with check (public.has_platform_role('admin'));
grant select on public.faq to anon, authenticated;
grant insert, update, delete on public.faq to authenticated;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  name text not null default '',
  app text check (app is null or app ~ '^[a-z][a-z0-9-]{1,30}$'),
  text text not null check (length(trim(text)) between 3 and 2000),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  faq_status text check (faq_status in ('published', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists questions_team on public.questions(team_id, created_at desc);
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  author text not null default 'member' check (author in ('member', 'runner')),
  name text not null default '',
  text text not null check (length(trim(text)) between 1 and 4000),
  accepted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists answers_question on public.answers(question_id, created_at);
alter table public.questions enable row level security;
alter table public.answers enable row level security;

-- Vraag of antwoord hoort bij een gezin waar je lid van bent; nieuwe vraag/antwoord altijd op eigen naam.
drop policy if exists questions_read on public.questions;
create policy questions_read on public.questions for select using (public.is_member(team_id));
drop policy if exists questions_insert on public.questions;
create policy questions_insert on public.questions for insert with check (public.is_member(team_id) and user_id = auth.uid());
drop policy if exists questions_update on public.questions;
create policy questions_update on public.questions for update using (user_id = auth.uid() or public.is_admin(team_id)) with check (public.is_member(team_id));
drop policy if exists questions_delete on public.questions;
create policy questions_delete on public.questions for delete using (user_id = auth.uid() or public.is_admin(team_id));
drop policy if exists answers_read on public.answers;
create policy answers_read on public.answers for select using (public.is_member(team_id));
drop policy if exists answers_insert on public.answers;
create policy answers_insert on public.answers for insert with check (
  public.is_member(team_id) and user_id = auth.uid() and author = 'member' and not accepted
  and exists (select 1 from questions q where q.id = question_id and q.team_id = answers.team_id));
drop policy if exists answers_delete on public.answers;
create policy answers_delete on public.answers for delete using (user_id = auth.uid() or public.is_admin(team_id));
-- Vragen bijwerken: alleen tekst en status (faq_status is voor de hoofdbeheerder, via faq_publish/faq_decline).
revoke update on public.questions from authenticated;
grant select, insert, delete on public.questions to authenticated;
grant update (text, status, updated_at) on public.questions to authenticated;
grant select, insert, delete on public.answers to authenticated;
revoke all on public.questions, public.answers from anon;

-- Een antwoord goedkeuren (of weer intrekken): de vrager of een gezinsbeheerder. De vraag heet dan "beantwoord".
create or replace function public.accept_answer(p_answer uuid, p_accept boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare a answers; q questions;
begin
  select * into a from answers where id = p_answer;
  select * into q from questions where id = a.question_id;
  if q is null or not (q.user_id = auth.uid() or public.is_admin(q.team_id)) then raise exception 'Alleen de vrager of een beheerder kan dit'; end if;
  update answers set accepted = p_accept where id = p_answer;
  update questions set status = case when exists (select 1 from answers where question_id = q.id and accepted) then 'answered' else 'open' end,
    updated_at = now() where id = q.id;
end $$;

-- De Assistent: open vragen zonder antwoord van de Assistent. Alleen tekst en app, geen namen of gezin.
create or replace function public.runner_open_questions()
returns table(id uuid, app text, text text, created_at timestamptz, member_answers int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_platform_role('runner') then raise exception 'Alleen voor de Assistent'; end if;
  return query select q.id, q.app, q.text, q.created_at, (select count(*)::int from answers a where a.question_id = q.id)
    from questions q where q.status = 'open'
      and not exists (select 1 from answers a where a.question_id = q.id and a.author = 'runner')
    order by q.created_at;
end $$;
create or replace function public.runner_answer(p_question uuid, p_text text)
returns uuid language plpgsql security definer set search_path = public as $$
declare q questions; id uuid;
begin
  if not public.has_platform_role('runner') then raise exception 'Alleen voor de Assistent'; end if;
  select * into q from questions where questions.id = p_question;
  if q is null then raise exception 'Onbekende vraag'; end if;
  insert into answers(question_id, team_id, user_id, author, name, text) values (q.id, q.team_id, null, 'runner', 'Assistent', trim(p_text)) returning answers.id into id;
  update questions set updated_at = now() where questions.id = q.id;
  return id;
end $$;

-- Hoofdbeheer: goedgekeurde antwoorden die nog niet in de FAQ staan (alle gezinnen, zonder namen of gezin).
create or replace function public.faq_candidates()
returns table(question_id uuid, app text, question text, answer text, answered_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  return query select q.id, q.app, q.text, (select string_agg(a.text, E'\n\n' order by a.created_at) from answers a where a.question_id = q.id and a.accepted), q.updated_at
    from questions q where q.status = 'answered' and q.faq_status is null order by q.updated_at desc;
end $$;
create or replace function public.faq_publish(p_question uuid, p_app text, p_q text, p_a text)
returns uuid language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  insert into faq(app, question, answer, source_question) values (nullif(p_app, ''), trim(p_q), trim(p_a), p_question) returning faq.id into id;
  update questions set faq_status = 'published' where questions.id = p_question;
  return id;
end $$;
create or replace function public.faq_decline(p_question uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  update questions set faq_status = 'declined' where id = p_question;
end $$;
do $$
declare f text;
begin
  foreach f in array array['has_platform_role(text)', 'accept_answer(uuid, boolean)', 'runner_open_questions()', 'runner_answer(uuid, text)', 'faq_candidates()', 'faq_publish(uuid, text, text, text)', 'faq_decline(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Eerste veelgestelde vragen (vaste id's: opnieuw draaien maakt geen dubbele).
insert into public.faq (id, app, question, answer, sort) values
  ('00000000-0000-4000-8000-000000000001', null, 'Hoe zet ik de app op mijn iPhone?', 'Open de link in Safari, tik op de deel-knop en kies "Zet op beginscherm". Gebruik daarna alleen dat icoon: het heeft een eigen opslag en werkt ook zonder internet.', 10),
  ('00000000-0000-4000-8000-000000000002', null, 'Hoe nodig ik iemand uit voor ons gezin?', 'Een beheerder gaat naar Gezin → Iemand uitnodigen, kiest de rol en maakt een code. Deel die code; de ander logt in en kiest "Ik heb een code". Een code is 14 dagen geldig.', 20),
  ('00000000-0000-4000-8000-000000000003', null, 'Waarom zie ik een app niet?', 'De app staat niet aan voor je gezin, of niet voor jou. Een beheerder regelt dat bij Gezin → Apps en per lid bij Gezin → tik op een lid.', 30),
  ('00000000-0000-4000-8000-000000000004', 'training', 'Ik heb een trainingsdag gemist. Wat nu?', 'Niets aan de hand: de volgende les schuift op naar je eerstvolgende trainingsdag. Komt het een andere dag beter uit, doe dan een bonustraining.', 40),
  ('00000000-0000-4000-8000-000000000005', 'eggs', 'Waarom is het besteladvies lager dan ik verwacht?', 'Het advies is bewust voorzichtig: het telt alleen verkochte eieren, afspraken en het vaste ritme van adressen, gecorrigeerd met hoeveel afspraken de laatste weken echt verkocht zijn. Nieuwe adressen en losse verkoop tellen niet mee.', 50)
on conflict (id) do nothing;
