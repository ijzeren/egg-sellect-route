# Egg-sellent
**Vers aan de deur, slim gepland.**

Route, navigatie en planning app voor egg-sellent bezorgers

**App:** https://ijzeren.github.io/egg-sellect-route/

Een webapp (PWA) voor de iPhone om een vaste eierronde te lopen: van huis naar huis vastleggen
wat er is afgenomen, wat er de volgende keer wordt afgesproken, en per week voorspellen hoeveel
eieren er besteld moeten worden. Geen App Store nodig.

## Op de iPhone zetten
1. Open de link hierboven in **Safari**.
2. Deel-knop → **Zet op beginscherm**.
3. Gebruik daarna alleen het icoon op het beginscherm (die heeft een eigen opslag, los van Safari).

Updates komen vanzelf binnen: de app meldt "Nieuwe versie beschikbaar".

## Bestanden
| | |
|---|---|
| `index.html` | de app (schermen, logica, opslag, synchronisatie) |
| `sw.js` | offline werken en updates; **verhoog `VERSION` bij elke wijziging** |
| `config.js` | koppeling met Supabase (leeg = alleen op deze telefoon) |
| `manifest.webmanifest`, `icon-*.png` | naam en icoon op het beginscherm |
| `supabase/` | databaseschema, mailtekst met inlogcode en [installatiehandleiding](supabase/README.md) |
| `PLAN.md` | plan, regels, voorspelling en ontwerp (schermafbeeldingen in `docs/design/`) |
