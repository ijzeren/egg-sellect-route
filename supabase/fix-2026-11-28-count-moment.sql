-- Eenmalig (28 nov 2026): de telling van 779 op wo 25 nov is gedaan direct na "Alles is binnen" (780 geleverd,
-- 1 kapot), vóór de ronde. De app rekende tellingen toen altijd aan het eind van de dag, waardoor de 334 eieren
-- van die ronde weer "meer geteld" werden en de voorraad 334 te hoog stond. Zet deze telling op "vóór de ronde".
-- Eerst schema.sql uitvoeren (kolom moment). Veilig om opnieuw te draaien: raakt alleen deze ene telling.
update public.stock_events
set moment = 'start', updated_at = now()
where kind = 'count' and not deleted and date = date '2026-11-25' and counted = 779
  and moment is distinct from 'start'
returning id, date, counted, moment;
