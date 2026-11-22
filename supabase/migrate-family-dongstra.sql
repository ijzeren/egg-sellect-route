-- Eenmalig: het eerste eierteam wordt het gezin Dongstra (familie-app v3.1).
-- Uitvoeren NA schema.sql (Supabase → SQL Editor → plak dit bestand → Run). Veilig om opnieuw te draaien.
--
-- Er worden geen gegevens verplaatst: adressen, bezoeken, voorraad enz. hangen aan het team-id en dat blijft
-- gelijk. Alleen de naam verandert, en de apps Egg-sellent en Training gaan aan.
-- Rollen (al gedaan door schema.sql): Marien beheerder van het gezin en van Egg-sellent;
-- Lynn lid van het gezin en bezorger in Egg-sellent. Marien wordt ook hoofdbeheerder van alle apps (FAQ).
do $$
declare t uuid := '377c50d1-466a-4328-b3c5-4e9cfe56bcf6';
begin
  if not exists (select 1 from public.teams where id = t) then
    raise notice 'Team % bestaat hier niet; niets gedaan.', t;
    return;
  end if;
  update public.teams set name = 'Familie Dongstra' where id = t;
  insert into public.team_apps (team_id, app) values (t, 'eggs'), (t, 'training')
    on conflict (team_id, app) do update set enabled = true;
  -- Hoofdbeheer van alle apps (FAQ beheren): de beheerder van het eerste gezin.
  insert into public.platform_roles (user_id, role)
    select user_id, 'admin' from public.team_members where team_id = t and role = 'admin' and name = 'Marien'
    on conflict do nothing;
end $$;

-- Controle (moet 1 rij geven met de oude aantallen: 145 adressen, 183 bezoeken op 22 nov 2026):
select t.name,
  (select string_agg(m.role || ':' || m.name, ', ' order by m.joined_at) from public.team_members m where m.team_id = t.id) as gezinsrollen,
  (select string_agg(x.app || ':' || coalesce(x.role, '-') , ', ') from public.team_member_apps x where x.team_id = t.id) as app_rollen,
  (select string_agg(a.app, ', ' order by a.app) from public.team_apps a where a.team_id = t.id and a.enabled) as apps,
  (select count(*) from public.addresses a where a.team_id = t.id) as adressen,
  (select count(*) from public.visits v where v.team_id = t.id) as bezoeken
from public.teams t where t.id = '377c50d1-466a-4328-b3c5-4e9cfe56bcf6';
