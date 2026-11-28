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
-- Hoofdbeheer (v3.6): een gezin kan door de hoofdbeheerder worden uitgeschakeld. Er wordt niets verwijderd;
-- leden kunnen dan niet meer bij de gegevens tot het weer aan staat.
alter table public.teams add column if not exists disabled_at timestamptz;
-- Hoofdbeheer (v3.6): apps voor alle gezinnen aan of uit. Geen rij = aan.
create table if not exists public.platform_apps (
  app text primary key check (app ~ '^[a-z][a-z0-9-]{1,30}$'),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null
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
  select exists (select 1 from team_members m join teams tt on tt.id = m.team_id and tt.disabled_at is null
    where m.team_id = t and m.user_id = auth.uid());
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
  -- Het hele gezin wordt verwijderd (cascade vanuit teams): dan geldt de beheerdersregel niet.
  if tg_op = 'DELETE' and not exists (select 1 from teams where id = old.team_id) then return old; end if;
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
    join teams tt on tt.id = ta.team_id and tt.disabled_at is null
    join team_members m on m.team_id = ta.team_id and m.user_id = auth.uid()
    left join team_member_apps x on x.team_id = m.team_id and x.user_id = m.user_id and x.app = ta.app
    where ta.team_id = t and ta.app = a and ta.enabled and coalesce(x.access, m.role <> 'child')
      and not exists (select 1 from platform_apps pa where pa.app = a and not pa.enabled));
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
returns table(team_id uuid, team_name text, role text, member_name text, apps jsonb, disabled boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, m.role, m.name,
    coalesce((select jsonb_object_agg(ta.app, jsonb_build_object('role', coalesce(x.role, case when m.role = 'admin' then 'admin' else 'member' end)))
      from team_apps ta left join team_member_apps x on x.team_id = ta.team_id and x.user_id = m.user_id and x.app = ta.app
      where ta.team_id = t.id and ta.enabled and t.disabled_at is null and coalesce(x.access, m.role <> 'child')
        and not exists (select 1 from platform_apps pa where pa.app = ta.app and not pa.enabled)), '{}'::jsonb),
    t.disabled_at is not null
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

-- ---------- Gerechten (familie-app, v3.4) ----------
-- recipes         gerechten van het gezin: ingrediënten, bereidingsschema (stappen met minuten) en een
--                 gezondheidsscore (1-10) met uitleg. Die score vult de Assistent (geplande Claude-routine) in;
--                 gezinsleden kunnen hem niet zelf zetten. Wijzigt het recept, dan vervalt de score en wordt hij opnieuw bepaald.
-- recipe_ratings  sterren (1-5) per gezinslid per gerecht.
-- Rechten: wie Gerechten mag gebruiken, leest alles en plaatst gerechten; wijzigen en verwijderen mag wie het
-- plaatste of een beheerder van de app. Sterren alleen op eigen naam.
create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
  author text not null default '',
  title text not null check (length(trim(title)) between 1 and 120),
  intro text not null default '' check (length(intro) <= 1000),
  category text not null default 'main' check (category ~ '^[a-z]{2,20}$'),
  servings int not null default 4 check (servings between 1 and 30),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  steps jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  health_score smallint check (health_score between 1 and 10),
  health_notes text,
  health_scored_at timestamptz,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recipes_team on public.recipes(team_id, updated_at desc);
-- v3.8 Importeren met verrijken: een geïmporteerd gerecht heeft status 'import' en bewaart de originele upload (source).
-- De Assistent verrijkt het (stappen, minuten, hoeveelheden), wist dan de upload en zet de status op 'ready' (klaar).
-- Pas daarna bepaalt hij de gezondheidsscore. Gerechten die je zelf invoert zijn meteen 'ready'.
alter table public.recipes add column if not exists status text not null default 'ready';
alter table public.recipes add column if not exists source text;
alter table public.recipes add column if not exists source_name text;
-- v3.9 Benodigdheden en tips (stappen hebben daarnaast optioneel title, section, temp, core en max; zie recipes/recipe.js).
alter table public.recipes add column if not exists tools jsonb not null default '[]'::jsonb;
alter table public.recipes add column if not exists tips jsonb not null default '[]'::jsonb;
alter table public.recipes drop constraint if exists recipes_extra_check;
alter table public.recipes add constraint recipes_extra_check check (jsonb_typeof(tools) = 'array' and jsonb_typeof(tips) = 'array');
-- v3.11 Past goed bij: [{ id?, text }] — een ander gerecht van het gezin (id) of een vrije suggestie (text).
alter table public.recipes add column if not exists pairs jsonb not null default '[]'::jsonb;
alter table public.recipes drop constraint if exists recipes_pairs_check;
alter table public.recipes add constraint recipes_pairs_check check (jsonb_typeof(pairs) = 'array');
alter table public.recipes drop constraint if exists recipes_status_check;
alter table public.recipes add constraint recipes_status_check check (status in ('import', 'ready'));
alter table public.recipes drop constraint if exists recipes_source_check;
alter table public.recipes add constraint recipes_source_check check (source is null or length(source) <= 200000);
create index if not exists recipes_unscored on public.recipes(created_at) where health_score is null and not deleted;
create index if not exists recipes_import on public.recipes(created_at) where status = 'import' and not deleted;
create table if not exists public.recipe_ratings (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  stars smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);
create index if not exists recipe_ratings_team on public.recipe_ratings(team_id);

-- Inhoud gewijzigd → score opnieuw laten bepalen. updated_at altijd bijwerken.
create or replace function public.recipe_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and (new.title, new.servings, new.ingredients, new.steps) is distinct from (old.title, old.servings, old.ingredients, old.steps) then
    new.health_score := null; new.health_notes := null; new.health_scored_at := null;
  end if;
  if tg_op = 'UPDATE' then new.team_id := old.team_id; new.user_id := old.user_id; new.created_at := old.created_at; end if;
  -- Een klaar gerecht heeft geen upload meer; zonder upload valt er niets te verrijken.
  if new.status = 'ready' or new.source is null then new.status := 'ready'; new.source := null; new.source_name := null; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists recipe_guard on public.recipes;
create trigger recipe_guard before insert or update on public.recipes for each row execute function public.recipe_guard();

alter table public.recipes enable row level security;
alter table public.recipe_ratings enable row level security;
drop policy if exists recipes_read on public.recipes;
create policy recipes_read on public.recipes for select using (public.has_app(team_id, 'recipes'));
drop policy if exists recipes_insert on public.recipes;
create policy recipes_insert on public.recipes for insert with check (public.has_app(team_id, 'recipes') and user_id = auth.uid());
drop policy if exists recipes_update on public.recipes;
create policy recipes_update on public.recipes for update
  using (public.has_app(team_id, 'recipes') and (user_id = auth.uid() or public.app_role(team_id, 'recipes') = 'admin'))
  with check (public.has_app(team_id, 'recipes'));
drop policy if exists recipes_delete on public.recipes;
create policy recipes_delete on public.recipes for delete
  using (public.has_app(team_id, 'recipes') and (user_id = auth.uid() or public.app_role(team_id, 'recipes') = 'admin'));
-- Gezondheidsscore is alleen voor de Assistent: gezinsleden krijgen op die kolommen geen schrijfrecht.
revoke all on public.recipes from anon, authenticated;
grant select, delete on public.recipes to authenticated;
grant insert (id, team_id, user_id, author, title, intro, category, servings, ingredients, steps, tools, tips, pairs, status, source, source_name) on public.recipes to authenticated;
grant update (author, title, intro, category, servings, ingredients, steps, tools, tips, pairs, deleted) on public.recipes to authenticated;

drop policy if exists ratings_read on public.recipe_ratings;
create policy ratings_read on public.recipe_ratings for select using (public.has_app(team_id, 'recipes'));
drop policy if exists ratings_own on public.recipe_ratings;
create policy ratings_own on public.recipe_ratings for all
  using (user_id = auth.uid() and public.has_app(team_id, 'recipes'))
  with check (user_id = auth.uid() and public.has_app(team_id, 'recipes')
    and exists (select 1 from public.recipes r where r.id = recipe_id and r.team_id = recipe_ratings.team_id));
revoke all on public.recipe_ratings from anon;
grant select, insert, update, delete on public.recipe_ratings to authenticated;

-- De Assistent: gerechten zonder gezondheidsscore (alleen titel, porties, ingrediënten en stappen; geen namen of gezin)
-- en de score terugzetten. Is het recept intussen gewijzigd (p_updated_at klopt niet meer), dan wordt het niet gescoord.
create or replace function public.runner_unscored_recipes()
returns table(id uuid, title text, category text, servings int, ingredients jsonb, steps jsonb, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_platform_role('runner') then raise exception 'Alleen voor de Assistent'; end if;
  return query select r.id, r.title, r.category, r.servings, r.ingredients, r.steps, r.updated_at
    from recipes r where r.health_score is null and r.status = 'ready' and not r.deleted order by r.created_at limit 50;
end $$;
create or replace function public.runner_score_recipe(p_recipe uuid, p_updated_at timestamptz, p_score int, p_notes text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.has_platform_role('runner') then raise exception 'Alleen voor de Assistent'; end if;
  if p_score not between 1 and 10 then raise exception 'Score moet tussen 1 en 10 liggen'; end if;
  update recipes set health_score = p_score, health_notes = left(trim(coalesce(p_notes, '')), 1000), health_scored_at = now()
    where recipes.id = p_recipe and date_trunc('milliseconds', recipes.updated_at) = date_trunc('milliseconds', p_updated_at) and not recipes.deleted;
  return found;
end $$;
-- De Assistent: geïmporteerde gerechten verrijken. Ziet alleen het gerecht en de originele upload, geen namen of gezin.
-- runner_enrich_recipe zet de verrijkte inhoud, wist de upload en zet de status op 'ready'. Gewijzigd sinds de lijst
-- (p_updated_at klopt niet) → niets gedaan, volgende run opnieuw.
drop function if exists public.runner_import_recipes();
create or replace function public.runner_import_recipes()
returns table(id uuid, title text, intro text, category text, servings int, ingredients jsonb, steps jsonb, tools jsonb, tips jsonb, source text, source_name text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_platform_role('runner') then raise exception 'Alleen voor de Assistent'; end if;
  return query select r.id, r.title, r.intro, r.category, r.servings, r.ingredients, r.steps, r.tools, r.tips, r.source, r.source_name, r.updated_at
    from recipes r where r.status = 'import' and not r.deleted order by r.created_at limit 20;
end $$;
drop function if exists public.runner_enrich_recipe(uuid, timestamptz, text, text, text, int, jsonb, jsonb);
create or replace function public.runner_enrich_recipe(p_recipe uuid, p_updated_at timestamptz, p_title text, p_intro text,
  p_category text, p_servings int, p_ingredients jsonb, p_steps jsonb, p_tools jsonb default '[]', p_tips jsonb default '[]')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.has_platform_role('runner') then raise exception 'Alleen voor de Assistent'; end if;
  if jsonb_typeof(p_ingredients) <> 'array' or jsonb_array_length(p_ingredients) = 0 then raise exception 'Ingrediënten ontbreken'; end if;
  if jsonb_typeof(p_steps) <> 'array' or exists (select 1 from jsonb_array_elements(p_steps) e
      where jsonb_typeof(e) <> 'object' or coalesce(trim(e->>'text'), '') = '' or coalesce(e->>'min', '0') !~ '^[0-9]{1,4}$') then
    raise exception 'Stappen moeten {text, min, par} zijn';
  end if;
  if jsonb_typeof(coalesce(p_tools, '[]')) <> 'array' or jsonb_typeof(coalesce(p_tips, '[]')) <> 'array' then raise exception 'Benodigdheden en tips zijn lijsten'; end if;
  update recipes set title = trim(p_title), intro = left(trim(coalesce(p_intro, '')), 1000), category = p_category, servings = p_servings,
    ingredients = p_ingredients, steps = p_steps, tools = coalesce(p_tools, '[]'), tips = coalesce(p_tips, '[]'),
    status = 'ready', source = null, source_name = null
    where recipes.id = p_recipe and recipes.status = 'import' and not recipes.deleted
      and date_trunc('milliseconds', recipes.updated_at) = date_trunc('milliseconds', p_updated_at);
  return found;
end $$;
revoke all on function public.runner_import_recipes() from public, anon;
revoke all on function public.runner_enrich_recipe(uuid, timestamptz, text, text, text, int, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.runner_import_recipes() to authenticated;
grant execute on function public.runner_enrich_recipe(uuid, timestamptz, text, text, text, int, jsonb, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.runner_unscored_recipes() from public, anon;
revoke all on function public.runner_score_recipe(uuid, timestamptz, int, text) from public, anon;
grant execute on function public.runner_unscored_recipes() to authenticated;
grant execute on function public.runner_score_recipe(uuid, timestamptz, int, text) to authenticated;

-- ---------- Agenda (familie-app, v3.5) ----------
-- Weekoverzicht van de kinderen (en wie er verder in staat): schoolrooster, trainingen, wedstrijden, huiswerk.
-- agenda_people  personen in de agenda; een kind zonder eigen account kan ook (user_id leeg)
-- agenda_items   afspraken: één keer (on_date) of elke week (days, 0 = zondag) binnen valid_from/valid_until,
--                eventueel alleen even/oneven weken (weeks); skip = data waarop het niet doorgaat
-- agenda_tasks   huiswerk en toetsen per persoon, met inleverdatum en afvinken
-- Rechten: iedereen die Agenda mag gebruiken, ziet en wijzigt alles van het gezin (kinderen alleen als een
-- beheerder Agenda voor hen aanzet). Verwijderen = deleted (zacht), zodat telefoons het ook zien.
create table if not exists public.agenda_people (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  color text not null default '#0A84FF' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  user_id uuid references auth.users(id) on delete set null,
  sort int not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists public.agenda_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  person_ids uuid[] not null default '{}',
  kind text not null default 'other' check (kind in ('lesson', 'school', 'sport', 'match', 'other')),
  title text not null check (length(trim(title)) between 1 and 80),
  place text not null default '' check (length(place) <= 120),
  notes text not null default '' check (length(notes) <= 1000),
  start_time text not null default '' check (start_time ~ '^([0-2][0-9]:[0-5][0-9])?$'),
  end_time text not null default '' check (end_time ~ '^([0-2][0-9]:[0-5][0-9])?$'),
  meet_time text not null default '' check (meet_time ~ '^([0-2][0-9]:[0-5][0-9])?$'),
  on_date date,
  days smallint[] not null default '{}',
  valid_from date,
  valid_until date,
  weeks text not null default '' check (weeks in ('', 'odd', 'even')),
  skip date[] not null default '{}',
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (on_date is not null or cardinality(days) > 0)
);
create index if not exists agenda_items_team on public.agenda_items(team_id);
-- v3.15: elke week, maar niet elke dag op dezelfde tijd: { "1": { "start": "08:30", "end": "09:20" }, … } (leeg = start/end_time voor alle dagen)
alter table public.agenda_items add column if not exists day_times jsonb not null default '{}'::jsonb;
alter table public.agenda_items drop constraint if exists agenda_items_day_times_object;
alter table public.agenda_items add constraint agenda_items_day_times_object check (jsonb_typeof(day_times) = 'object');
create table if not exists public.agenda_tasks (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  person_id uuid not null references public.agenda_people(id) on delete cascade,
  kind text not null default 'homework' check (kind in ('homework', 'test')),
  subject text not null default '' check (length(subject) <= 60),
  text text not null check (length(trim(text)) between 1 and 500),
  due date,
  done boolean not null default false,
  done_at timestamptz,
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists agenda_tasks_team on public.agenda_tasks(team_id, due);

create or replace function public.agenda_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.team_id := old.team_id; end if;
  new.updated_at := now();
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['agenda_people', 'agenda_items', 'agenda_tasks'] loop
    execute format('drop trigger if exists agenda_touch on public.%I', t);
    execute format('create trigger agenda_touch before insert or update on public.%I for each row execute function public.agenda_touch()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists team_data on public.%I', t);
    execute format('create policy team_data on public.%I for all using (public.has_app(team_id, ''agenda'')) with check (public.has_app(team_id, ''agenda''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
-- Een persoon koppelen aan een account mag alleen met een lid van hetzelfde gezin; huiswerk hoort bij een persoon van hetzelfde gezin.
create or replace function public.agenda_people_guard() returns trigger
language plpgsql as $$
begin
  if new.user_id is not null and not exists (select 1 from public.team_members m where m.team_id = new.team_id and m.user_id = new.user_id) then
    raise exception 'Dit account hoort niet bij het gezin';
  end if;
  return new;
end $$;
drop trigger if exists agenda_people_guard on public.agenda_people;
create trigger agenda_people_guard before insert or update on public.agenda_people for each row execute function public.agenda_people_guard();
create or replace function public.agenda_tasks_guard() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.agenda_people p where p.id = new.person_id and p.team_id = new.team_id) then
    raise exception 'Onbekende persoon';
  end if;
  if new.done and not coalesce(old.done, false) then new.done_at := now(); elsif not new.done then new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists agenda_tasks_guard on public.agenda_tasks;
create trigger agenda_tasks_guard before insert or update on public.agenda_tasks for each row execute function public.agenda_tasks_guard();

-- ---------- Hoofdbeheer: alles buiten de gezinnen (familie-app, v3.6) ----------
-- Voor wie in platform_roles de rol 'admin' heeft (nu alleen de eigenaar van de app; uit te breiden via de hub).
-- Bewust GEEN inzage in gezinnen: geen namen of e-mailadressen van leden, geen adressen, trainingen of vragen.
-- Alleen: apps voor iedereen aan/uit, gezinnen uitschakelen/inschakelen/verwijderen (naam + aantallen),
-- en wie hoofdbeheerder of Assistent is.
alter table public.platform_roles add column if not exists created_at timestamptz not null default now();
alter table public.platform_apps enable row level security;
drop policy if exists platform_apps_read on public.platform_apps;
create policy platform_apps_read on public.platform_apps for select to anon, authenticated using (true);
grant select on public.platform_apps to anon, authenticated;
revoke insert, update, delete on public.platform_apps from anon, authenticated;

create or replace function public.platform_set_app(p_app text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  insert into platform_apps(app, enabled, updated_at, updated_by) values (p_app, p_enabled, now(), auth.uid())
    on conflict (app) do update set enabled = excluded.enabled, updated_at = now(), updated_by = auth.uid();
end $$;

-- Gezinnen: naam, aanmaakdatum, aantal leden, apps die aan staan, uitgeschakeld sinds. Geen leden of gegevens.
create or replace function public.platform_families()
returns table(team_id uuid, name text, created_at timestamptz, members int, apps text[], disabled_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  return query select t.id, t.name, t.created_at,
    (select count(*)::int from team_members m where m.team_id = t.id),
    coalesce((select array_agg(a.app order by a.app) from team_apps a where a.team_id = t.id and a.enabled), '{}'),
    t.disabled_at
    from teams t order by t.created_at;
end $$;
create or replace function public.platform_set_family_disabled(p_team uuid, p_disabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  update teams set disabled_at = case when p_disabled then coalesce(disabled_at, now()) else null end where id = p_team;
  if not found then raise exception 'Onbekend gezin'; end if;
end $$;
-- Verwijderen kan niet ongedaan worden: alle gegevens van het gezin gaan mee. p_confirm = de naam van het gezin.
create or replace function public.platform_delete_family(p_team uuid, p_confirm text)
returns void language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  select name into n from teams where id = p_team;
  if n is null then raise exception 'Onbekend gezin'; end if;
  if trim(coalesce(p_confirm, '')) <> n then raise exception 'Typ de naam van het gezin precies over om te bevestigen'; end if;
  delete from teams where id = p_team;
end $$;

-- Hoofdbeheerders en de Assistent: e-mailadres + rol (alleen van wie zo'n rol heeft).
create or replace function public.platform_role_list()
returns table(user_id uuid, email text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  return query select r.user_id, u.email::text, r.role, r.created_at from platform_roles r join auth.users u on u.id = r.user_id order by r.role, r.created_at;
end $$;
create or replace function public.platform_role_add(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid;
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  if p_role not in ('admin', 'runner') then raise exception 'Onbekende rol'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'Geen account met dit e-mailadres. Laat diegene eerst één keer inloggen (of maak het account aan in Supabase).'; end if;
  insert into platform_roles(user_id, role) values (uid, p_role) on conflict do nothing;
end $$;
create or replace function public.platform_role_remove(p_user uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  if p_role = 'admin' and not exists (select 1 from platform_roles where role = 'admin' and user_id <> p_user) then
    raise exception 'Er moet minstens één hoofdbeheerder blijven';
  end if;
  delete from platform_roles where user_id = p_user and role = p_role;
end $$;
do $$
declare f text;
begin
  foreach f in array array['platform_set_app(text, boolean)', 'platform_families()', 'platform_set_family_disabled(uuid, boolean)', 'platform_delete_family(uuid, text)', 'platform_role_list()', 'platform_role_add(text, text)', 'platform_role_remove(uuid, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- Integraties: agendalinks (Thuis, v3.16) ----------
-- Gegevens van buiten de app binnenhalen. Eerst: agendalinks (iCal), bijv. het rooster uit Magister, per persoon in de
-- Agenda; iedereen kan er meerdere opgeven. Ophalen gebeurt op de server: Edge Function `integrations`, elk half uur via
-- pg_cron (cron.sql) en met "Nu bijwerken" in de app.
-- integrations          één regel per koppeling; config = niet-geheime instellingen (bij 'ical': person_id, kind)
-- integration_secrets   de link zelf (werkt als een wachtwoord): NOOIT leesbaar vanuit de app, alleen voor de server
-- integration_runs      logboek per keer ophalen: aantallen en een foutmelding, geen inhoud
-- platform_integrations soorten koppelingen voor alle gezinnen aan/uit (hoofdbeheer), zoals platform_apps
-- Afspraken uit een agendalink staan in agenda_items met integration_id + external_id en zijn niet los te wijzigen.
create table if not exists public.platform_integrations (
  type text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.platform_integrations enable row level security;
drop policy if exists platform_integrations_read on public.platform_integrations;
create policy platform_integrations_read on public.platform_integrations for select to authenticated using (true);
revoke all on public.platform_integrations from anon;
grant select on public.platform_integrations to authenticated;
revoke insert, update, delete on public.platform_integrations from authenticated;

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  type text not null,
  label text not null check (length(trim(label)) between 1 and 40),
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  secret_hint text not null default '',
  status text not null default 'new' check (status in ('new', 'ok', 'error')),
  last_sync_at timestamptz,
  last_error text not null default '',
  last_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.integrations drop constraint if exists integrations_type_check;
alter table public.integrations add constraint integrations_type_check check (type in ('ical', 'apple_health', 'bank'));
create index if not exists integrations_team on public.integrations(team_id);
alter table public.integrations enable row level security;
-- Zien: leden van het gezin die de app mogen gebruiken waar de koppeling in uitkomt (agendalinks: Agenda). Wijzigen alleen via de functies hieronder.
drop policy if exists integrations_read on public.integrations;
create policy integrations_read on public.integrations for select to authenticated
  using (public.is_member(team_id) and case type
    when 'ical' then public.has_app(team_id, 'agenda')
    -- gezondheid: alleen je eigen, of van wie het zelf deelt met het gezin (en dan alleen voor wie Training gebruikt)
    when 'apple_health' then user_id = auth.uid() or (coalesce((config->>'share')::boolean, false) and public.has_app(team_id, 'training'))
    -- bankkoppeling (Financiën, v3.22): alleen wie hem heeft gemaakt
    when 'bank' then user_id = auth.uid() and public.has_app(team_id, 'finance')
    else false end);
revoke all on public.integrations from anon;
grant select on public.integrations to authenticated;
revoke insert, update, delete on public.integrations from authenticated;

create table if not exists public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  secret text not null,
  updated_at timestamptz not null default now()
);
alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;

create table if not exists public.integration_runs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.integrations(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null,
  added int not null default 0,
  changed int not null default 0,
  removed int not null default 0,
  skipped int not null default 0,
  error text not null default ''
);
create index if not exists integration_runs_integration on public.integration_runs(integration_id, at desc);
alter table public.integration_runs enable row level security;
drop policy if exists integration_runs_read on public.integration_runs;
create policy integration_runs_read on public.integration_runs for select to authenticated
  using (exists (select 1 from public.integrations i where i.id = integration_id));
revoke all on public.integration_runs from anon;
grant select on public.integration_runs to authenticated;
revoke insert, update, delete on public.integration_runs from authenticated;

-- Herkomst van afspraken uit een agendalink. Verwijder je de koppeling, dan gaan zijn afspraken mee.
alter table public.agenda_items add column if not exists integration_id uuid references public.integrations(id) on delete cascade;
alter table public.agenda_items add column if not exists external_id text;
create unique index if not exists agenda_items_external on public.agenda_items(integration_id, external_id);
-- Gebruikers mogen afspraken uit een agendalink niet wijzigen of verwijderen, en zelf geen herkomst invullen.
-- De server (service role, auth.uid() leeg) mag alles.
create or replace function public.agenda_items_import_guard() returns trigger
language plpgsql as $$
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  -- integration_save zet herkomst-afspraken om naar een andere persoon of soort
  if coalesce(current_setting('app.integration_write', true), '') = 'on' then return coalesce(new, old); end if;
  -- koppeling of gezin wordt verwijderd: de afspraken gaan mee (cascade)
  if tg_op = 'DELETE' and old.integration_id is not null and not exists (select 1 from public.integrations i where i.id = old.integration_id) then return old; end if;
  if tg_op = 'INSERT' then
    if new.integration_id is not null or new.external_id is not null then raise exception 'Alleen een agendalink mag afspraken met herkomst toevoegen'; end if;
    return new;
  end if;
  if old.integration_id is not null then
    raise exception 'Deze afspraak komt uit een agendalink. Wijzig hem in de agenda waar hij vandaan komt.';
  end if;
  if tg_op = 'UPDATE' and (new.integration_id is not null or new.external_id is not null) then
    raise exception 'Alleen een agendalink mag afspraken met herkomst toevoegen';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists agenda_items_import_guard on public.agenda_items;
create trigger agenda_items_import_guard before insert or update or delete on public.agenda_items for each row execute function public.agenda_items_import_guard();

-- Link opschonen (zelfde regels als cleanUrl in supabase/functions/integrations/ical.mjs): webcal:// → https://, alleen
-- https, geen interne adressen. Lokaal testen met http: `alter database postgres set app.integrations_allow_http = 'on';`
create or replace function public.integration_clean_url(p_url text) returns text
language plpgsql stable as $$  -- stable: leest app.integrations_allow_http
declare u text := regexp_replace(trim(coalesce(p_url, '')), '^webcals?://', 'https://', 'i');
  host text;
  http_ok boolean := coalesce(current_setting('app.integrations_allow_http', true), '') = 'on';
begin
  if u !~* '^https://[^/\s]+' and not (http_ok and u ~* '^http://[^/\s]+') then
    raise exception 'De link moet beginnen met https:// of webcal://.';
  end if;
  if length(u) > 2000 or u ~ '\s' then raise exception 'Dit is geen geldige link. Plak het hele adres.'; end if;
  host := lower(substring(u from '^https?://(?:[^@/]*@)?([^/:?#]+)'));
  if not http_ok and (host is null or host = 'localhost' or host like '%.localhost' or host ~ '^[0-9.]+$' or host like '%.internal' or host like '%.local' or host like '[%') then
    raise exception 'Deze link kan de app niet ophalen.';
  end if;
  return u;
end $$;

-- Koppeling toevoegen of wijzigen. p_id leeg = nieuw. p_url leeg bij wijzigen = link blijft.
-- Toevoegen: iedereen die de app gebruikt waar het in uitkomt. Wijzigen/verwijderen: wie hem maakte, of een gezinsbeheerder.
create or replace function public.integration_save(p_id uuid, p_team uuid, p_type text, p_label text, p_config jsonb, p_url text, p_enabled boolean default true)
returns uuid language plpgsql security definer set search_path = public as $$
declare r integrations; cfg jsonb := coalesce(p_config, '{}'::jsonb); u text; pid uuid; v_kind text;
begin
  if p_id is not null then
    select * into r from integrations where id = p_id;
    if r.id is null or not public.is_member(r.team_id) then raise exception 'Onbekende koppeling'; end if;
    if r.user_id is distinct from auth.uid() and not public.is_admin(r.team_id) then raise exception 'Alleen wie de koppeling maakte, of een beheerder, kan hem wijzigen'; end if;
    p_team := r.team_id; p_type := r.type;
  else
    if not public.is_member(p_team) then raise exception 'Je hoort niet bij dit gezin'; end if;
  end if;
  if p_type <> 'ical' then raise exception 'Onbekende soort koppeling'; end if;
  if exists (select 1 from platform_integrations pi where pi.type = p_type and not pi.enabled) then raise exception 'Deze koppeling staat (tijdelijk) uit voor iedereen'; end if;
  if not public.has_app(p_team, 'agenda') then raise exception 'Agenda staat niet aan voor jou'; end if;
  -- agendalink: voor wie (persoon in de agenda) en wat voor afspraken (les of anders)
  begin pid := (cfg->>'person_id')::uuid; exception when others then pid := null; end;
  if pid is null or not exists (select 1 from agenda_people p where p.id = pid and p.team_id = p_team and not p.deleted) then raise exception 'Kies voor wie de agenda is'; end if;
  v_kind := coalesce(nullif(cfg->>'kind', ''), 'lesson');
  if v_kind not in ('lesson', 'school', 'sport', 'match', 'other') then v_kind := 'other'; end if;
  cfg := jsonb_build_object('person_id', pid, 'kind', v_kind);
  if p_id is null and coalesce(trim(p_url), '') = '' then raise exception 'Plak de link van de agenda'; end if;
  if coalesce(trim(p_url), '') <> '' then u := public.integration_clean_url(p_url); end if;
  if p_id is null then
    insert into integrations(team_id, user_id, type, label, enabled, config) values (p_team, auth.uid(), p_type, left(trim(p_label), 40), coalesce(p_enabled, true), cfg) returning * into r;
  else
    update integrations set label = left(trim(p_label), 40), enabled = coalesce(p_enabled, enabled), config = cfg, updated_at = now(),
      status = case when u is not null then 'new' else status end, last_error = case when u is not null then '' else last_error end
      where id = p_id returning * into r;
    -- andere persoon of soort: bij de volgende keer ophalen komt alles opnieuw goed; nu alvast de bestaande afspraken omzetten
    perform set_config('app.integration_write', 'on', true);
    update agenda_items set person_ids = array[pid], kind = v_kind where integration_id = r.id;
    perform set_config('app.integration_write', '', true);
  end if;
  if u is not null then
    insert into integration_secrets(integration_id, secret, updated_at) values (r.id, u, now())
      on conflict (integration_id) do update set secret = excluded.secret, updated_at = now();
    update integrations set secret_hint = lower(substring(u from '^https?://(?:[^@/]*@)?([^/:?#]+)')) || ' …' || right(u, 4) where id = r.id;
  end if;
  return r.id;
end $$;

create or replace function public.integration_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r integrations;
begin
  select * into r from integrations where id = p_id;
  if r.id is null or not public.is_member(r.team_id) then raise exception 'Onbekende koppeling'; end if;
  if r.user_id is distinct from auth.uid() and (r.type = 'apple_health' or not public.is_admin(r.team_id)) then raise exception 'Alleen wie de koppeling maakte, of een beheerder, kan hem verwijderen'; end if;
  delete from integrations where id = p_id; -- afspraken, link en logboek gaan mee
end $$;

-- Hoofdbeheer: soorten koppelingen voor iedereen aan/uit, en per soort alleen aantallen (geen gezinnen, geen inhoud).
create or replace function public.platform_set_integration(p_type text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  if p_type not in ('ical', 'apple_health') then raise exception 'Onbekende soort koppeling'; end if;
  insert into platform_integrations(type, enabled, updated_at, updated_by) values (p_type, p_enabled, now(), auth.uid())
    on conflict (type) do update set enabled = excluded.enabled, updated_at = now(), updated_by = auth.uid();
end $$;
create or replace function public.platform_integration_stats()
returns table(type text, enabled boolean, total int, active int, failing int, last_sync_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.has_platform_role('admin') then raise exception 'Alleen voor de hoofdbeheerder'; end if;
  return query select t.type, coalesce(pi.enabled, true),
    (select count(*)::int from integrations i where i.type = t.type),
    (select count(*)::int from integrations i where i.type = t.type and i.enabled),
    (select count(*)::int from integrations i where i.type = t.type and i.enabled and i.status = 'error'),
    (select max(i.last_sync_at) from integrations i where i.type = t.type)
    from (values ('ical'), ('apple_health')) as t(type) left join platform_integrations pi on pi.type = t.type;
end $$;
do $$
declare f text;
begin
  foreach f in array array['integration_save(uuid, uuid, text, text, jsonb, text, boolean)', 'integration_delete(uuid)', 'platform_set_integration(text, boolean)', 'platform_integration_stats()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------- Gezondheid: gewicht en stappen van de iPhone (Thuis, v3.17) ----------
-- Een webapp kan niet bij Apple Gezondheid. Daarom stuurt een automatisering in Opdrachten op de iPhone de gegevens
-- naar de Edge Function `integrations` (modus ingest), met een persoonlijke link (token). Alleen met toestemming:
-- - iedereen zet het zelf aan (integrations, type 'apple_health', één per persoon per gezin) en geeft daarbij toestemming;
-- - voor een kind geeft eerst een gezinsbeheerder toestemming (health_permissions);
-- - privé: alleen jij ziet je gegevens; delen met het gezin (in Training) is een aparte keuze (config.share);
-- - stoppen wist alles (de koppeling en alle metingen). Het token staat alleen gehasht (sha256) op de server.
create table if not exists public.health_permissions (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  allowed_by uuid references auth.users(id) on delete set null,
  allowed_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
alter table public.health_permissions enable row level security;
drop policy if exists health_permissions_read on public.health_permissions;
create policy health_permissions_read on public.health_permissions for select to authenticated using (public.is_member(team_id));
revoke all on public.health_permissions from anon;
grant select on public.health_permissions to authenticated;
revoke insert, update, delete on public.health_permissions from authenticated;

create unique index if not exists integrations_health_one on public.integrations(team_id, user_id) where type = 'apple_health';

create table if not exists public.health_samples (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  kind text not null check (kind in ('weight', 'steps')),
  day date not null,
  value numeric not null,
  unit text not null default '',
  updated_at timestamptz not null default now(),
  unique (integration_id, kind, day)
);
create index if not exists health_samples_user on public.health_samples(user_id, kind, day);
alter table public.health_samples enable row level security;
drop policy if exists health_samples_read on public.health_samples;
create policy health_samples_read on public.health_samples for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.integrations i where i.id = integration_id and i.type = 'apple_health'
    and coalesce((i.config->>'share')::boolean, false) and public.is_member(i.team_id) and public.has_app(i.team_id, 'training')));
revoke all on public.health_samples from anon;
grant select on public.health_samples to authenticated;
revoke insert, update, delete on public.health_samples from authenticated;

-- Mag deze gebruiker gezondheid aanzetten? Volwassenen zelf; een kind alleen met toestemming van een beheerder.
create or replace function public.health_may(p_team uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members m where m.team_id = p_team and m.user_id = p_user
    and (m.role <> 'child' or exists (select 1 from health_permissions hp where hp.team_id = p_team and hp.user_id = p_user)));
$$;

-- Aanzetten (met toestemming) of een nieuwe persoonlijke link maken. Geeft het token één keer terug.
create or replace function public.health_enable(p_team uuid, p_share boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare r integrations; tok text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not public.is_member(p_team) then raise exception 'Je hoort niet bij dit gezin'; end if;
  if not public.has_app(p_team, 'training') then raise exception 'Training staat niet aan voor jou'; end if;
  if exists (select 1 from platform_integrations pi where pi.type = 'apple_health' and not pi.enabled) then raise exception 'Gezondheid staat (tijdelijk) uit voor iedereen'; end if;
  if not public.health_may(p_team, auth.uid()) then raise exception 'Vraag eerst een beheerder van het gezin om toestemming (Gezin → jouw naam → Gezondheid).'; end if;
  select * into r from integrations where team_id = p_team and user_id = auth.uid() and type = 'apple_health';
  if r.id is null then
    insert into integrations(team_id, user_id, type, label, enabled, config)
      values (p_team, auth.uid(), 'apple_health', 'Gezondheid', true, jsonb_build_object('consent_at', now(), 'kinds', jsonb_build_array('weight', 'steps'), 'share', coalesce(p_share, false)))
      returning * into r;
  end if;
  insert into integration_secrets(integration_id, secret, updated_at) values (r.id, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), now())
    on conflict (integration_id) do update set secret = excluded.secret, updated_at = now();
  update integrations set secret_hint = '…' || right(tok, 4), enabled = true, updated_at = now() where id = r.id;
  return tok;
end $$;
create or replace function public.health_set_share(p_team uuid, p_share boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update integrations set config = config || jsonb_build_object('share', coalesce(p_share, false)), updated_at = now()
    where team_id = p_team and user_id = auth.uid() and type = 'apple_health';
  if not found then raise exception 'Gezondheid staat nog niet aan'; end if;
end $$;
-- Stoppen: koppeling, link en alle metingen weg.
create or replace function public.health_delete(p_team uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from integrations where team_id = p_team and user_id = auth.uid() and type = 'apple_health';
end $$;
-- Beheerder: toestemming voor een kind geven of intrekken. Intrekken wist ook de gegevens van dat kind.
create or replace function public.health_allow(p_team uuid, p_user uuid, p_allowed boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(p_team) then raise exception 'Alleen een beheerder van het gezin'; end if;
  if not exists (select 1 from team_members where team_id = p_team and user_id = p_user) then raise exception 'Onbekend gezinslid'; end if;
  if p_allowed then
    insert into health_permissions(team_id, user_id, allowed_by) values (p_team, p_user, auth.uid()) on conflict (team_id, user_id) do nothing;
  else
    delete from health_permissions where team_id = p_team and user_id = p_user;
    delete from integrations where team_id = p_team and user_id = p_user and type = 'apple_health'
      and exists (select 1 from team_members m where m.team_id = p_team and m.user_id = p_user and m.role = 'child');
  end if;
end $$;
do $$
declare f text;
begin
  foreach f in array array['health_may(uuid, uuid)', 'health_enable(uuid, boolean)', 'health_set_share(uuid, boolean)', 'health_delete(uuid)', 'health_allow(uuid, uuid, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  grant execute on function public.health_may(uuid, uuid) to service_role; -- de Edge Function controleert hiermee bij elke ontvangst
end $$;
-- Wie het gezin verlaat (of verwijderd wordt): zijn of haar gezondheid in dat gezin gaat weg.
create or replace function public.health_member_left() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from integrations where team_id = old.team_id and user_id = old.user_id and type = 'apple_health';
  delete from health_permissions where team_id = old.team_id and user_id = old.user_id;
  return old;
end $$;
drop trigger if exists health_member_left on public.team_members;
create trigger health_member_left after delete on public.team_members for each row execute function public.health_member_left();

-- ---------- Financiën: bankrekeningen en transacties (Thuis, v3.19) ----------
-- Fase 1: een export uit de bank (Rabobank CSV of CAMT.053) inlezen; later ook ophalen via PSD2 (docs/plan-finance.md).
-- Strenger dan andere apps:
-- - een rekening heeft een eigenaar (user_id); alleen de eigenaar ziet hem, tenzij die hem deelt (shared) met de
--   beheerders van het gezin. Leden en kinderen zien nooit de rekening van een ander.
-- - het rekeningnummer staat er niet leesbaar in: alleen de laatste 4 tekens en een hash (sha256 van gezin + IBAN),
--   om dezelfde rekening te herkennen. Ook van de tegenrekening bewaren we alleen een hash (eigen overboekingen herkennen).
-- - verwijderen van een rekening wist alle transacties; wie het gezin verlaat, neemt zijn rekeningen mee (gewist).
-- - soorten (categorieën) en regels zijn van het gezin: iedereen met Financiën gebruikt dezelfde indeling.
create table if not exists public.finance_accounts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  kind text not null default 'current' check (kind in ('current', 'savings')),
  iban_last4 text not null default '' check (iban_last4 ~ '^[A-Z0-9]{0,4}$'),
  iban_hash text not null check (iban_hash ~ '^[0-9a-f]{64}$'),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  shared boolean not null default false,
  balance numeric(14, 2),
  balance_on date,
  imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, iban_hash)
);
create table if not exists public.finance_categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  grp text not null default 'other' check (grp in ('income', 'fixed', 'household', 'transport', 'leisure', 'savings', 'other')),
  icon text not null default '' check (length(icon) <= 8),
  sort int not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists finance_categories_team on public.finance_categories(team_id);
create table if not exists public.finance_rules (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  field text not null default 'counterparty' check (field in ('counterparty', 'description')),
  pattern text not null check (length(trim(pattern)) between 2 and 80),
  direction text not null default '' check (direction in ('', 'in', 'out')),
  category_id uuid not null references public.finance_categories(id) on delete cascade,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists finance_rules_team on public.finance_rules(team_id);
-- ext_id: uniek per rekening (Rabobank CSV: volgnummer; CAMT.053: referentie van de bank, anders een hash van de regel).
-- Opnieuw inlezen voegt alleen nieuwe regels toe en laat een gekozen soort staan.
-- category_by: '' = niet ingedeeld, 'rule' = door een regel, 'manual' = zelf gekozen (regels blijven daar af).
-- excluded: telt niet mee in de totalen (overboeking tussen eigen rekeningen, of zelf uitgezet).
create table if not exists public.finance_transactions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  account_id uuid not null references public.finance_accounts(id) on delete cascade,
  ext_id text not null check (length(ext_id) between 1 and 120),
  booked_on date not null,
  amount numeric(14, 2) not null,
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  counterparty text not null default '' check (length(counterparty) <= 140),
  counterparty_hash text not null default '' check (counterparty_hash ~ '^([0-9a-f]{64})?$'),
  description text not null default '' check (length(description) <= 500),
  code text not null default '' check (length(code) <= 20),
  balance_after numeric(14, 2),
  category_id uuid references public.finance_categories(id) on delete set null,
  category_by text not null default '' check (category_by in ('', 'rule', 'manual')),
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, ext_id)
);
create index if not exists finance_transactions_account on public.finance_transactions(account_id, booked_on);
create index if not exists finance_transactions_team on public.finance_transactions(team_id, booked_on);

-- Mag de ingelogde gebruiker deze rekening zien (en er transacties van inlezen en indelen)?
create or replace function public.finance_can_see(p_account uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from finance_accounts a where a.id = p_account and public.has_app(a.team_id, 'finance')
    and (a.user_id = auth.uid() or (a.shared and public.is_admin(a.team_id))));
$$;
revoke all on function public.finance_can_see(uuid) from public, anon;
grant execute on function public.finance_can_see(uuid) to authenticated;

create or replace function public.finance_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.team_id := old.team_id; end if;
  new.updated_at := now();
  return new;
end $$;
-- Rekening: eigenaar, naam, soort en delen wijzigt alleen de eigenaar; wie meekijkt, mag alleen het saldo bijwerken (inlezen).
-- Bankkoppeling (v3.22): welke rekening komt binnen via Enable Banking. finance_bank_accounts is alleen voor de server
-- (uid van de rekening bij Enable Banking, geldig zolang de sessie loopt); de sessie zelf staat in integration_secrets.
alter table public.finance_accounts add column if not exists integration_id uuid references public.integrations(id) on delete set null;
create table if not exists public.finance_bank_accounts (
  integration_id uuid not null references public.integrations(id) on delete cascade,
  account_id uuid not null references public.finance_accounts(id) on delete cascade,
  uid text not null check (length(uid) between 1 and 100),
  primary key (integration_id, uid)
);
create index if not exists finance_bank_accounts_account on public.finance_bank_accounts(account_id);
alter table public.finance_bank_accounts enable row level security;
revoke all on public.finance_bank_accounts from anon, authenticated;

create or replace function public.finance_accounts_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.team_id := old.team_id; new.iban_hash := old.iban_hash; new.iban_last4 := old.iban_last4; new.created_at := old.created_at;
    -- de bankkoppeling zet alleen de server (service role, zonder gebruiker)
    if auth.uid() is not null then new.integration_id := old.integration_id; end if;
    if auth.uid() is not null and old.user_id <> auth.uid()
      and (new.user_id <> old.user_id or new.name <> old.name or new.kind <> old.kind or new.shared <> old.shared) then
      raise exception 'Alleen de eigenaar van de rekening kan dit wijzigen';
    end if;
    new.user_id := old.user_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists finance_accounts_guard on public.finance_accounts;
create trigger finance_accounts_guard before insert or update on public.finance_accounts for each row execute function public.finance_accounts_guard();
-- Transactie: gezin altijd dat van de rekening; bedrag, datum en omschrijving komen uit de bank en veranderen niet.
create or replace function public.finance_transactions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.account_id := old.account_id; new.ext_id := old.ext_id; new.booked_on := old.booked_on; new.amount := old.amount;
    new.currency := old.currency; new.counterparty := old.counterparty; new.counterparty_hash := old.counterparty_hash;
    new.description := old.description; new.code := old.code; new.balance_after := old.balance_after; new.created_at := old.created_at;
  end if;
  select a.team_id into new.team_id from public.finance_accounts a where a.id = new.account_id;
  if new.category_id is not null and not exists (select 1 from public.finance_categories c where c.id = new.category_id and c.team_id = new.team_id) then
    raise exception 'Onbekende soort';
  end if;
  if new.category_id is null then new.category_by := ''; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists finance_transactions_guard on public.finance_transactions;
create trigger finance_transactions_guard before insert or update on public.finance_transactions for each row execute function public.finance_transactions_guard();
create or replace function public.finance_rules_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.team_id := old.team_id; end if;
  if not exists (select 1 from public.finance_categories c where c.id = new.category_id and c.team_id = new.team_id) then
    raise exception 'Onbekende soort';
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists finance_rules_guard on public.finance_rules;
create trigger finance_rules_guard before insert or update on public.finance_rules for each row execute function public.finance_rules_guard();
drop trigger if exists finance_touch on public.finance_categories;
create trigger finance_touch before insert or update on public.finance_categories for each row execute function public.finance_touch();

alter table public.finance_accounts enable row level security;
alter table public.finance_transactions enable row level security;
alter table public.finance_categories enable row level security;
alter table public.finance_rules enable row level security;
drop policy if exists finance_accounts_read on public.finance_accounts;
-- Rechtstreeks op de kolommen (niet via finance_can_see): zo ziet een insert … returning zijn eigen nieuwe rij.
create policy finance_accounts_read on public.finance_accounts for select to authenticated
  using (public.has_app(team_id, 'finance') and (user_id = auth.uid() or (shared and public.is_admin(team_id))));
drop policy if exists finance_accounts_insert on public.finance_accounts;
create policy finance_accounts_insert on public.finance_accounts for insert to authenticated
  with check (user_id = auth.uid() and public.has_app(team_id, 'finance'));
drop policy if exists finance_accounts_update on public.finance_accounts;
create policy finance_accounts_update on public.finance_accounts for update to authenticated
  using (public.has_app(team_id, 'finance') and (user_id = auth.uid() or (shared and public.is_admin(team_id)))) with check (public.has_app(team_id, 'finance'));
drop policy if exists finance_accounts_delete on public.finance_accounts;
create policy finance_accounts_delete on public.finance_accounts for delete to authenticated
  using (user_id = auth.uid() and public.has_app(team_id, 'finance'));
drop policy if exists finance_transactions_rw on public.finance_transactions;
create policy finance_transactions_rw on public.finance_transactions for all to authenticated
  using (public.finance_can_see(account_id)) with check (public.finance_can_see(account_id));
do $$
declare t text;
begin
  foreach t in array array['finance_categories', 'finance_rules'] loop
    execute format('drop policy if exists team_data on public.%I', t);
    execute format('create policy team_data on public.%I for all to authenticated using (public.has_app(team_id, ''finance'')) with check (public.has_app(team_id, ''finance''))', t);
  end loop;
  foreach t in array array['finance_accounts', 'finance_transactions', 'finance_categories', 'finance_rules'] loop
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Standaardsoorten voor een gezin dat Financiën voor het eerst opent (alleen als er nog geen soorten zijn).
create or replace function public.finance_setup(p_team uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.has_app(p_team, 'finance') then raise exception 'Financiën staat niet aan voor jou'; end if;
  perform pg_advisory_xact_lock(hashtext('finance_setup:' || p_team::text));
  if exists (select 1 from finance_categories where team_id = p_team) then return 0; end if;
  insert into finance_categories(team_id, grp, icon, name, sort)
  select p_team, x.grp, x.icon, x.name, x.sort from (values
    ('income', '💶', 'Salaris', 10), ('income', '🏛️', 'Toeslagen en teruggave', 11), ('income', '🏡', 'Verhuur', 12), ('income', '➕', 'Overig inkomen', 13),
    ('fixed', '🏠', 'Wonen', 20), ('fixed', '⚡', 'Energie en water', 21), ('fixed', '🛡️', 'Verzekeringen', 22), ('fixed', '📱', 'Telefoon en internet', 23),
    ('fixed', '🔁', 'Abonnementen', 24), ('fixed', '🧾', 'Belastingen', 25), ('fixed', '🎒', 'School en opvang', 26),
    ('household', '🛒', 'Boodschappen', 30), ('household', '💊', 'Drogist en zorg', 31), ('household', '👕', 'Kleding', 32), ('household', '🔨', 'Huis en tuin', 33),
    ('transport', '🚗', 'Auto en brandstof', 40), ('transport', '🚆', 'OV en parkeren', 41),
    ('leisure', '🍽️', 'Uit eten en afhalen', 50), ('leisure', '✈️', 'Uitjes en vakantie', 51), ('leisure', '⚽', 'Sport en hobby', 52), ('leisure', '🎁', 'Cadeaus', 53),
    ('savings', '🐷', 'Sparen en beleggen', 60),
    ('other', '🏧', 'Geld opnemen', 70), ('other', '❔', 'Overig', 71)
  ) as x(grp, icon, name, sort);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.finance_setup(uuid) from public, anon;
grant execute on function public.finance_setup(uuid) to authenticated;

-- Wie het gezin verlaat (of verwijderd wordt): zijn of haar rekeningen in dat gezin gaan weg, met alle transacties.
create or replace function public.finance_member_left() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- bankkoppeling stopt (de toestemming bij de bank verloopt vanzelf; intrekken kan alleen de server)
  delete from integrations where team_id = old.team_id and user_id = old.user_id and type = 'bank';
  delete from finance_accounts where team_id = old.team_id and user_id = old.user_id;
  return old;
end $$;
drop trigger if exists finance_member_left on public.team_members;
create trigger finance_member_left after delete on public.team_members for each row execute function public.finance_member_left();

-- ---------- Verhuur (v3.20.0) ----------
-- Vakantiehuizen van het gezin: boekingen (platforms, direct, eigen gebruik) en de aangifte van de taxe de séjour.
-- rental_houses           huis: naam, plaats, classement (stars; leeg = niet geclassificeerd), regels voor de
--                         toeristenbelasting per jaar (tax, zie rentals/tax.js) en standaardprijzen (settings)
-- rental_bookings         verblijf: kanaal (booking, airbnb, direct, own = eigen gebruik, other), status (booked,
--                         option, expected, cancelled), data, personen en volwassenen, wie de taxe int (tax_by).
--                         Voor iedereen met de app, ook de kijker (bijv. voor de schoonmaak): geen bedragen of namen.
-- rental_booking_amounts  bedragen en naam van de gast per verblijf: alleen beheerders van de app.
-- rental_declarations     maand waarvoor de aangifte van de taxe de séjour is gedaan (per huis)
-- Rechten: lezen = has_app(team, 'rentals'); wijzigen = app_role(team, 'rentals') = 'admin' (de rol "Kijker" is
-- member). Annuleren = status cancelled + cancelled_at: blijft bewaard. deleted = per ongeluk ingevoerd.
create table if not exists public.rental_houses (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  place text not null default '' check (length(place) <= 80),
  stars smallint check (stars between 1 and 5),
  tax jsonb not null default '{}'::jsonb check (jsonb_typeof(tax) = 'object'),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  sort int not null default 0,
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists rental_houses_team on public.rental_houses(team_id);
create table if not exists public.rental_bookings (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  house_id uuid not null references public.rental_houses(id) on delete cascade,
  source text not null default 'direct' check (source in ('booking', 'airbnb', 'direct', 'own', 'other')),
  status text not null default 'booked' check (status in ('booked', 'option', 'expected', 'cancelled')),
  external_id text not null default '' check (length(external_id) <= 80),
  arrival date not null,
  departure date not null,
  guests smallint not null default 1 check (guests between 0 and 50),
  adults smallint not null default 1 check (adults between 0 and 50),
  country text not null default '' check (length(country) <= 60),
  tax_by text not null default 'host' check (tax_by in ('platform', 'host', 'none')),
  notes text not null default '' check (length(notes) <= 1000),
  cancelled_at timestamptz,
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (departure > arrival),
  check (adults <= guests)
);
create index if not exists rental_bookings_team on public.rental_bookings(team_id, arrival);
create table if not exists public.rental_booking_amounts (
  booking_id uuid primary key references public.rental_bookings(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  guest_name text not null default '' check (length(guest_name) <= 120),
  accommodation numeric(10, 2),  -- huur voor het hele verblijf, zonder schoonmaak, bedlinnen en toeristenbelasting
  night_price numeric(10, 2),    -- afgesproken prijs per nacht (directe boeking)
  payout numeric(10, 2),         -- uitbetaling door het platform
  cleaning numeric(10, 2),
  linen numeric(10, 2),
  tourist_tax numeric(10, 2),    -- geïnd (platform: wat het platform opgeeft; direct: wat de gast betaalt)
  other_costs numeric(10, 2),    -- vaste kosten per boeking
  commission numeric(10, 2),     -- verhuurmakelaar
  updated_at timestamptz not null default now()
);
create index if not exists rental_booking_amounts_team on public.rental_booking_amounts(team_id);
create table if not exists public.rental_declarations (
  house_id uuid not null references public.rental_houses(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  declared_at timestamptz not null default now(),
  declared_by uuid default auth.uid() references auth.users(id) on delete set null,
  primary key (house_id, month)
);

-- Alles blijft binnen één gezin: een boeking hoort bij een huis van hetzelfde gezin, bedragen bij een boeking van
-- hetzelfde gezin. Status geannuleerd zet cancelled_at (en terugzetten wist hem).
create or replace function public.rental_guard() returns trigger
language plpgsql as $$
begin
  if tg_table_name in ('rental_bookings', 'rental_declarations') then
    if not exists (select 1 from public.rental_houses h where h.id = new.house_id and h.team_id = new.team_id) then
      raise exception 'Dit huis hoort niet bij het gezin';
    end if;
  elsif tg_table_name = 'rental_booking_amounts' then
    if not exists (select 1 from public.rental_bookings b where b.id = new.booking_id and b.team_id = new.team_id) then
      raise exception 'Deze boeking hoort niet bij het gezin';
    end if;
  end if;
  if tg_table_name = 'rental_bookings' then
    if new.status = 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
    else new.cancelled_at := null; end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['rental_houses', 'rental_bookings', 'rental_booking_amounts'] loop
    execute format('drop trigger if exists rental_touch on public.%I', t);
    execute format('create trigger rental_touch before insert or update on public.%I for each row execute function public.agenda_touch()', t);
  end loop;
  foreach t in array array['rental_bookings', 'rental_booking_amounts', 'rental_declarations'] loop
    execute format('drop trigger if exists rental_guard on public.%I', t);
    execute format('create trigger rental_guard before insert or update on public.%I for each row execute function public.rental_guard()', t);
  end loop;
  foreach t in array array['rental_houses', 'rental_bookings', 'rental_booking_amounts', 'rental_declarations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists rental_read on public.%I', t);
    execute format('drop policy if exists rental_admin on public.%I', t);
    execute format('create policy rental_admin on public.%I for all using (public.app_role(team_id, ''rentals'') = ''admin'') with check (public.app_role(team_id, ''rentals'') = ''admin'')', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
  -- huizen en verblijven (zonder bedragen) mag iedereen met de app zien
  foreach t in array array['rental_houses', 'rental_bookings'] loop
    execute format('create policy rental_read on public.%I for select using (public.has_app(team_id, ''rentals''))', t);
  end loop;
end $$;

-- ---------- Uitbetalingen van Booking.com en Airbnb gekoppeld aan boekingen (Thuis, v3.21) ----------
-- rental_booking_payouts  welk deel van een bijschrijving in Financiën hoort bij welke boeking in Verhuur. Bedrag en
--                         datum staan erin, zodat Verhuur "uitbetaald op …" kan tonen zonder de rekening te lezen.
-- Rechten: lezen = beheerder van Verhuur. Koppelen, wijzigen en ontkoppelen = beheerder van Verhuur die de transactie
-- ook mag zien (de subquery hieronder valt onder de rechten van finance_transactions: eigen of gedeelde rekening).
-- Verdwijnt de transactie (rekening verwijderd, lid weg), dan blijft de uitbetaling bij de boeking staan.
create table if not exists public.rental_booking_payouts (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  booking_id uuid not null references public.rental_bookings(id) on delete cascade,
  transaction_id uuid references public.finance_transactions(id) on delete set null,
  amount numeric(10, 2) not null check (amount > 0),
  paid_on date not null,
  matched_by text not null default 'manual' check (matched_by in ('manual', 'suggested')),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists rental_booking_payouts_link on public.rental_booking_payouts(booking_id, transaction_id);
create index if not exists rental_booking_payouts_team on public.rental_booking_payouts(team_id);
create index if not exists rental_booking_payouts_tx on public.rental_booking_payouts(transaction_id);

-- Boeking en transactie van hetzelfde gezin; alleen bijschrijvingen; samen nooit meer dan het bedrag van de
-- transactie; datum = boekdatum van de transactie.
create or replace function public.rental_payout_guard() returns trigger
language plpgsql as $$
declare t record; used numeric;
begin
  if not exists (select 1 from public.rental_bookings b where b.id = new.booking_id and b.team_id = new.team_id) then
    raise exception 'Deze boeking hoort niet bij het gezin';
  end if;
  if new.transaction_id is not null and (tg_op = 'INSERT' or new.transaction_id is distinct from old.transaction_id or new.amount <> old.amount) then
    select id, team_id, amount, booked_on into t from public.finance_transactions where id = new.transaction_id;
    if t.id is null or t.team_id <> new.team_id then raise exception 'Deze transactie hoort niet bij het gezin'; end if;
    if t.amount <= 0 then raise exception 'Alleen een bijschrijving kan een uitbetaling zijn'; end if;
    select coalesce(sum(p.amount), 0) into used from public.rental_booking_payouts p where p.transaction_id = new.transaction_id and p.id <> new.id;
    if used + new.amount > t.amount + 0.005 then raise exception 'Samen meer dan het bedrag van de transactie'; end if;
    new.paid_on := t.booked_on;
  end if;
  if tg_op = 'UPDATE' then new.team_id := old.team_id; end if;
  return new;
end $$;
drop trigger if exists rental_payout_guard on public.rental_booking_payouts;
create trigger rental_payout_guard before insert or update on public.rental_booking_payouts for each row execute function public.rental_payout_guard();

alter table public.rental_booking_payouts enable row level security;
drop policy if exists rental_payout_read on public.rental_booking_payouts;
drop policy if exists rental_payout_insert on public.rental_booking_payouts;
drop policy if exists rental_payout_update on public.rental_booking_payouts;
drop policy if exists rental_payout_delete on public.rental_booking_payouts;
create policy rental_payout_read on public.rental_booking_payouts for select
  using (public.app_role(team_id, 'rentals') = 'admin');
create policy rental_payout_insert on public.rental_booking_payouts for insert
  with check (public.app_role(team_id, 'rentals') = 'admin' and transaction_id is not null
    and exists (select 1 from public.finance_transactions t where t.id = transaction_id));
create policy rental_payout_update on public.rental_booking_payouts for update
  using (public.app_role(team_id, 'rentals') = 'admin' and exists (select 1 from public.finance_transactions t where t.id = transaction_id))
  with check (public.app_role(team_id, 'rentals') = 'admin' and exists (select 1 from public.finance_transactions t where t.id = transaction_id));
create policy rental_payout_delete on public.rental_booking_payouts for delete
  using (public.app_role(team_id, 'rentals') = 'admin'
    and (transaction_id is null or exists (select 1 from public.finance_transactions t where t.id = transaction_id)));
revoke all on public.rental_booking_payouts from anon;
grant select, insert, update, delete on public.rental_booking_payouts to authenticated;

-- ---------- Verhuur: kosten, begroting en jaaroverzicht (Thuis, v3.22) ----------
-- rental_cost_categories  kostensoorten per huis (elk huis is anders geregeld). kind: fixed (vast), usage (verbruik),
--                         tax (belasting), maintenance (onderhoud), other (overig/onvoorzien), investment (apart van
--                         het resultaat), booking (komt uit de boekingen: from_booking = cleaning, linen, commission of
--                         other_costs; daarvoor voer je geen facturen in). own_share: telt mee in het deel eigen gebruik.
-- rental_costs            werkelijke kosten: datum, soort, bedrag, eventueel hoeveelheid (liters, m³), leverancier,
--                         factuurnummer, betaald.
-- rental_budgets          begroting per huis, jaar en kostensoort (bedrag per jaar).
-- import_key              vaste sleutel van de eenmalige import uit de spreadsheet (scripts/rentals-import.mjs), zodat
--                         die opnieuw kan zonder dubbele regels. Leeg bij alles wat in de app is ingevoerd.
-- Rechten: alleen beheerders van Verhuur (app_role = admin); de kijker ziet geen bedragen.
alter table public.rental_bookings add column if not exists import_key text check (length(import_key) <= 80);
create unique index if not exists rental_bookings_import on public.rental_bookings(house_id, import_key);
create table if not exists public.rental_cost_categories (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  house_id uuid not null references public.rental_houses(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  kind text not null default 'other' check (kind in ('fixed', 'usage', 'tax', 'maintenance', 'other', 'investment', 'booking')),
  from_booking text check (from_booking in ('cleaning', 'linen', 'commission', 'other_costs')),
  own_share boolean not null default true,
  sort int not null default 0,
  active boolean not null default true,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  check ((kind = 'booking') = (from_booking is not null))
);
create index if not exists rental_cost_categories_house on public.rental_cost_categories(house_id);
create unique index if not exists rental_cost_categories_from on public.rental_cost_categories(house_id, from_booking) where not deleted;
create table if not exists public.rental_costs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  house_id uuid not null references public.rental_houses(id) on delete cascade,
  category_id uuid not null references public.rental_cost_categories(id) on delete restrict,
  date date not null,
  amount numeric(10, 2) not null,
  quantity numeric(10, 2),
  unit text not null default '' check (length(unit) <= 12),
  supplier text not null default '' check (length(supplier) <= 80),
  description text not null default '' check (length(description) <= 300),
  invoice_no text not null default '' check (length(invoice_no) <= 60),
  paid boolean not null default true,
  booking_id uuid references public.rental_bookings(id) on delete set null,
  import_key text check (length(import_key) <= 80),
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists rental_costs_house on public.rental_costs(house_id, date);
create unique index if not exists rental_costs_import on public.rental_costs(house_id, import_key);
create table if not exists public.rental_budgets (
  house_id uuid not null references public.rental_houses(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  year smallint not null check (year between 2000 and 2100),
  category_id uuid not null references public.rental_cost_categories(id) on delete cascade,
  amount numeric(10, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (house_id, year, category_id)
);

-- Alles binnen één huis van één gezin: soort, kosten en begroting bij een huis van het gezin; de kostensoort en de
-- boeking van een kostenregel horen bij hetzelfde huis; voor soorten uit de boekingen voer je geen kosten in.
create or replace function public.rental_cost_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.house_id := old.house_id; new.team_id := old.team_id; end if;
  if not exists (select 1 from public.rental_houses h where h.id = new.house_id and h.team_id = new.team_id) then
    raise exception 'Dit huis hoort niet bij het gezin';
  end if;
  if tg_table_name in ('rental_costs', 'rental_budgets') then
    if not exists (select 1 from public.rental_cost_categories c where c.id = new.category_id and c.house_id = new.house_id
        and (tg_table_name = 'rental_budgets' or c.kind <> 'booking')) then
      raise exception 'Deze kostensoort hoort niet bij dit huis';
    end if;
  end if;
  if tg_table_name = 'rental_costs' then  -- apart: new.booking_id bestaat alleen in rental_costs
    if new.booking_id is not null and not exists (select 1 from public.rental_bookings b where b.id = new.booking_id and b.house_id = new.house_id) then
      raise exception 'Deze boeking hoort niet bij dit huis';
    end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['rental_cost_categories', 'rental_costs', 'rental_budgets'] loop
    execute format('drop trigger if exists rental_touch on public.%I', t);
    execute format('create trigger rental_touch before insert or update on public.%I for each row execute function public.agenda_touch()', t);
    execute format('drop trigger if exists rental_cost_guard on public.%I', t);
    execute format('create trigger rental_cost_guard before insert or update on public.%I for each row execute function public.rental_cost_guard()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists rental_admin on public.%I', t);
    execute format('create policy rental_admin on public.%I for all using (public.app_role(team_id, ''rentals'') = ''admin'') with check (public.app_role(team_id, ''rentals'') = ''admin'')', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------- Rechten voor de server (service role) ----------
-- De Edge Functions (push, integrations) werken met de service role. In productie kreeg die rol geen rechten op
-- tabellen in public (gezien op 22 nov 2026: "permission denied for table push_subscriptions/integrations"). De
-- service role is de geheime serversleutel en negeert RLS; hier krijgt hij expliciet toegang, ook op nieuwe tabellen.
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- ---------- Boodschappen (familie-app, v3.18) ----------
-- grocery_staples  vaste boodschappen van het gezin: every_days = ritme in dagen; null = "altijd in huis" (nooit vanzelf
--                  op de lijst, overgeslagen bij gerechten). last_bought houdt de trigger hieronder bij (laatste keer
--                  afgevinkt); snooze_until = "nog genoeg in huis", pas daarna weer op de lijst.
-- grocery_items    de gedeelde lijst. checked_at = afgevinkt (in het mandje); deleted = van de lijst gehaald.
--                  Afgevinkte regels blijven bestaan: daaruit leert de app het ritme en de afdeling per artikel.
-- grocery_menu     weekmenu: gerecht + aantal personen per week (maandag); listed_at = ingrediënten op de lijst gezet.
-- Wanneer een vaste boodschap aan de beurt is: hier in grocery_fill én in groceries/plan.js (dueDate). Houd die gelijk.
create table if not exists public.grocery_staples (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  qty numeric check (qty is null or (qty > 0 and qty < 100000)),
  unit text not null default '' check (unit ~ '^[a-z]{0,12}$'),
  section text not null default 'other' check (section ~ '^[a-z]{1,20}$'),
  every_days int check (every_days is null or every_days between 1 and 365),
  last_bought date,
  snooze_until date,
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists grocery_staples_team on public.grocery_staples(team_id);
create table if not exists public.grocery_items (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  qty numeric check (qty is null or (qty > 0 and qty < 100000)),
  unit text not null default '' check (unit ~ '^[a-z]{0,12}$'),
  section text not null default 'other' check (section ~ '^[a-z]{1,20}$'),
  note text not null default '' check (length(note) <= 200),
  source text not null default 'manual' check (source in ('manual', 'staple', 'recipe')),
  staple_id uuid references public.grocery_staples(id) on delete set null,
  recipe_ids uuid[] not null default '{}',
  checked_at timestamptz,
  checked_by uuid references auth.users(id) on delete set null,
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists grocery_items_open on public.grocery_items(team_id) where not deleted;
create index if not exists grocery_items_staple on public.grocery_items(staple_id, checked_at) where staple_id is not null;
-- Hooguit één open regel per vaste boodschap (twee telefoons tegelijk vullen de lijst niet dubbel).
create unique index if not exists grocery_items_open_staple on public.grocery_items(staple_id) where staple_id is not null and checked_at is null and not deleted;
create table if not exists public.grocery_menu (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  week date not null check (extract(isodow from week) = 1),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  servings int not null default 4 check (servings between 1 and 30),
  listed_at timestamptz,
  deleted boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists grocery_menu_team on public.grocery_menu(team_id, week);

create or replace function public.grocery_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then new.team_id := old.team_id; new.created_by := old.created_by; end if;
  new.updated_at := now();
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['grocery_staples', 'grocery_items', 'grocery_menu'] loop
    execute format('drop trigger if exists grocery_touch on public.%I', t);
    execute format('create trigger grocery_touch before insert or update on public.%I for each row execute function public.grocery_touch()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists team_data on public.%I', t);
    execute format('create policy team_data on public.%I for all using (public.has_app(team_id, ''groceries'')) with check (public.has_app(team_id, ''groceries''))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- Regels: vaste boodschap en gerechten van hetzelfde gezin; afvinken met de tijd van de server en wie het deed.
create or replace function public.grocery_items_guard() returns trigger
language plpgsql as $$
begin
  if new.staple_id is not null and not exists (select 1 from public.grocery_staples s where s.id = new.staple_id and s.team_id = new.team_id) then
    raise exception 'Onbekende vaste boodschap';
  end if;
  if new.checked_at is not null and (tg_op = 'INSERT' or old.checked_at is null) then
    new.checked_at := now(); new.checked_by := auth.uid();
  elsif new.checked_at is null then
    new.checked_by := null;
  end if;
  return new;
end $$;
drop trigger if exists grocery_items_guard on public.grocery_items;
create trigger grocery_items_guard before insert or update on public.grocery_items for each row execute function public.grocery_items_guard();
create or replace function public.grocery_menu_guard() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from public.recipes r where r.id = new.recipe_id and r.team_id = new.team_id) then
    raise exception 'Onbekend gerecht';
  end if;
  return new;
end $$;
drop trigger if exists grocery_menu_guard on public.grocery_menu;
create trigger grocery_menu_guard before insert or update on public.grocery_menu for each row execute function public.grocery_menu_guard();

-- Laatst gekocht = de laatste keer dat een regel van die vaste boodschap is afgevinkt (ook na weer uitvinken klopt het).
create or replace function public.grocery_bought() returns trigger
language plpgsql as $$
declare s uuid;
begin
  foreach s in array array[case when tg_op <> 'INSERT' then old.staple_id end, new.staple_id] loop
    if s is not null then
      update public.grocery_staples set last_bought = (
        select max((i.checked_at at time zone 'Europe/Amsterdam')::date) from public.grocery_items i where i.staple_id = s and i.checked_at is not null)
      where id = s;
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists grocery_bought on public.grocery_items;
create trigger grocery_bought after insert or update of checked_at, staple_id on public.grocery_items for each row execute function public.grocery_bought();

-- Vaste boodschappen die aan de beurt zijn op de lijst zetten (de app roept dit aan bij het openen).
-- Iets eerder dan precies na every_days dagen: least(3, round(every_days / 4)) dagen (zie groceries/plan.js → margin).
create or replace function public.grocery_fill(p_team uuid) returns int
language plpgsql set search_path = public as $$
declare n int; d date := (now() at time zone 'Europe/Amsterdam')::date;
begin
  if not public.has_app(p_team, 'groceries') then raise exception 'Boodschappen staat niet aan voor jou in dit gezin'; end if;
  insert into grocery_items (team_id, name, qty, unit, section, source, staple_id)
    select s.team_id, s.name, s.qty, s.unit, s.section, 'staple', s.id from grocery_staples s
    where s.team_id = p_team and not s.deleted and s.every_days is not null
      and (s.last_bought is null or s.last_bought + s.every_days - least(3, round(s.every_days / 4.0))::int <= d)
      and (s.snooze_until is null or s.snooze_until <= d)
    on conflict (staple_id) where staple_id is not null and checked_at is null and not deleted do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.grocery_fill(uuid) from public, anon;
grant execute on function public.grocery_fill(uuid) to authenticated;

-- ---------- Boodschappen: producten en prijzen van Albert Heijn (v3.19) ----------
-- grocery_choices      gekozen product per boodschap (naam) en per winkel, per gezin. name_key = de naam zoals
--                      groceries/plan.js → nameKey hem maakt (enkelvoud/meervoud gelijk). brand_only = "alleen dit
--                      merk": dan stelt de app geen goedkoper ander merk voor.
-- grocery_products     cache van productgegevens per winkel (prijs, bonus, Nutri-Score, verpakking). Openbare
--                      winkelgegevens, GEEN gezinsgegevens (geen team_id, geen zoektermen): iedereen die is ingelogd mag
--                      lezen; alleen de Edge Function groceries-products schrijft (service role).
-- grocery_store_state  alleen voor de server: het AH-token, wanneer een subcategorie is opgehaald, tellers per gezin.
--                      NOOIT leesbaar vanuit de app.
create table if not exists public.grocery_choices (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name_key text not null check (length(name_key) between 1 and 80),
  store text not null default 'ah' check (store in ('ah')),
  product_id text not null check (product_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  brand_only boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, store, name_key)
);
drop trigger if exists grocery_touch on public.grocery_choices;
create trigger grocery_touch before insert or update on public.grocery_choices for each row execute function public.grocery_touch();
alter table public.grocery_choices enable row level security;
drop policy if exists team_data on public.grocery_choices;
create policy team_data on public.grocery_choices for all using (public.has_app(team_id, 'groceries')) with check (public.has_app(team_id, 'groceries'));
revoke all on public.grocery_choices from anon;
grant select, insert, update, delete on public.grocery_choices to authenticated;

create table if not exists public.grocery_products (
  store text not null check (store in ('ah')),
  product_id text not null,
  title text not null,
  brand text not null default '',
  size text not null default '',
  price numeric,
  price_was numeric,
  bonus text not null default '',
  bonus_until date,
  unit text not null default 'st' check (unit in ('kg', 'l', 'st')),
  unit_qty numeric,
  nutriscore text check (nutriscore is null or nutriscore in ('A', 'B', 'C', 'D', 'E')),
  category text not null default '',
  sub_category text not null default '',
  image text not null default '',
  available boolean not null default true,
  fetched_at timestamptz not null default now(),
  primary key (store, product_id)
);
create index if not exists grocery_products_sub on public.grocery_products(store, sub_category);
alter table public.grocery_products enable row level security;
drop policy if exists read_all on public.grocery_products;
create policy read_all on public.grocery_products for select to authenticated using (true);
revoke all on public.grocery_products from anon, authenticated;
grant select on public.grocery_products to authenticated;

create table if not exists public.grocery_store_state (
  key text primary key,
  value jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.grocery_store_state enable row level security;
revoke all on public.grocery_store_state from anon, authenticated;
