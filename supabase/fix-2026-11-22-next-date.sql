-- Eenmalig (22 nov 2026): Wilhelminasingel 25, 31 en 33 kregen woensdag als extra voorkeursdag nadat ze op
-- do 19 nov waren bezocht. De app had de volgende keer toen al automatisch op do 26 nov gezet; die schoof niet
-- mee, waardoor ze op wo 25 nov niet in de ronde stonden. Zet de volgende keer op wo 25 nov.
-- Veilig om opnieuw te draaien: raakt alleen deze bezoeken, en alleen als er nog do 26 nov staat.
update public.visits v
set next_date = date '2026-11-25', updated_at = now()
from public.addresses a
where a.team_id = v.team_id and a.id = v.address_id and not a.deleted and not v.deleted
  and a.street = 'Wilhelminasingel' and a.number in ('25', '31', '33')
  and v.date = date '2026-11-19' and v.next_date = date '2026-11-26'
  and 3 = any(a.pref_days)
returning a.street || ' ' || a.number as adres, v.next_date;
