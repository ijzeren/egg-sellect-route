# Plan: integraties (Thuis 3.15 – 3.17)

*Opgesteld 22 nov 2026. Status: plan, nog niet gebouwd. Open vragen staan onderaan. 3.11.0 is gebruikt voor Gerechten, 3.14.0 voor de nieuwe naam Thuis;
de versienummers hieronder zijn een richtlijn: neem bij het bouwen de eerstvolgende vrije versie (zie shared/releases.js).*

## Doel
Gegevens van buiten de app automatisch binnenhalen, zodat gezinnen ze niet zelf hoeven over te typen:

| Integratie | Voor wie | Waar het terechtkomt |
|---|---|---|
| **Google Agenda** van het gezin | gezin | Agenda (afspraken) |
| **Schoolapp** (rooster, later huiswerk), bijv. van Lynn | één persoon in de agenda | Agenda (lessen, huiswerk en toetsen) |
| **Gezondheid** van de telefoon (gewicht, stappen, …) | één gebruiker | Training (voortgang), alleen voor die gebruiker |

Integraties zet je aan **per gezin** (beheerder) of **per gebruiker** (de gebruiker zelf; voor kinderen een beheerder).
De hoofdbeheerder kan een integratie voor alle gezinnen uitzetten, net als apps.

## Wat technisch kan (belangrijk)
Thuis is een webapp op het beginscherm (PWA). Op de iPhone betekent dat:
- **Geen achtergrondwerk in de app.** Een service worker draait op iOS niet op de achtergrond of op een tijdschema.
  "Ophalen met een worker" gebeurt daarom op de **server**: een Supabase Edge Function die elk half uur draait (pg_cron,
  zoals de meldingen van Egg-sellent al doen). De app laat alleen de status zien en kan "Nu bijwerken" vragen.
- **Geen toegang tot Apple Gezondheid** vanuit een webapp. De oplossing: een **automatisering in Opdrachten**
  (Shortcuts) op de iPhone van die gebruiker. Die leest elke dag de gezondheidsgegevens ("Zoek gezondheidsmonsters") en
  stuurt ze met "Haal inhoud op van URL" naar de app. De app maakt die opdracht met één tik klaar (persoonlijke link).
  Alternatief zonder zelf bouwen: de betaalde app Health Webhook doet hetzelfde. Een eigen iPhone-app (App Store) is
  pas nodig als dit niet genoeg is.
- **Schoolapps** hebben geen officiële koppeling voor ouders. Wat wel vaak kan: het **rooster als agenda-link (iCal)**
  als de school dat aanzet. Somtoday heeft daar een iCal-token voor; bij Magister zetten veel scholen het uit. Huiswerk
  zit niet in die link. Huiswerk ophalen kan alleen via niet-officiële inloggen-als-de-leerling-koppelingen: kwetsbaar
  (breekt bij elke wijziging, tweestapsverificatie) en mogelijk tegen de voorwaarden. Daarom eerst alleen het rooster.
- **Google Agenda**: het eenvoudigst en veiligst is het **geheime adres in iCal-indeling** van een agenda (alleen lezen).
  Echte Google-koppeling (OAuth) kan later, als de app ook in Google Agenda moet schrijven; daarvoor is een Google
  Cloud-project met goedkeuring nodig.

## Opzet
**Eén soort worker, verschillende integraties.** Elke integratie heeft een type met drie onderdelen:
1. *instellen*: wat de gebruiker invult (een agenda-link, voor wie, welke gegevens);
2. *ophalen*: op de server (iCal, API) of *aanleveren* door het toestel (Opdrachten → ingest-link);
3. *verwerken*: omzetten naar gegevens in een app (afspraken, lessen, metingen), met een vaste sleutel per extern item,
   zodat opnieuw ophalen niets dubbel maakt en verwijderde items verdwijnen.

### Database (idempotent in `supabase/schema.sql`)
- `platform_integrations` — integraties voor iedereen aan/uit (zoals `platform_apps`).
- `integrations` — één regel per ingestelde koppeling: `team_id`, `user_id` (leeg = voor het gezin), `person_id`
  (persoon in de agenda, bijv. een kind zonder account), `type` (`google_ical`, `school_ical`, `apple_health`),
  `enabled`, `config` (niet-geheime instellingen), `status`, `last_sync_at`, `last_error`.
  RLS: gezinsintegraties zien alle leden en wijzigen beheerders; persoonlijke alleen de gebruiker zelf.
- `integration_secrets` — agenda-links en ingest-tokens (gehasht). **Nooit leesbaar vanuit de app**, alleen voor de
  Edge Functions (service role).
- `integration_runs` — logboek per run: aantallen nieuw/gewijzigd/verwijderd en een foutmelding, geen inhoud.
- Herkomst in bestaande tabellen: `agenda_items` en `agenda_tasks` krijgen `integration_id` en `external_id`
  (uniek samen). Geïmporteerde items zijn in de app herkenbaar en niet los te bewerken (wel te verbergen).
- `health_samples` — `team_id`, `user_id`, `kind` (`weight`, `steps`, …), `value`, `unit`, `measured_at`, `integration_id`.
  RLS: **alleen de gebruiker zelf**; delen met het gezin is een aparte keuze per gebruiker.

### Workers (Supabase Edge Functions)
- `integrations-sync` — elk half uur via pg_cron: haalt alle server-integraties op die aan staan (iCal), verwerkt ze,
  schrijft een run. Ook aan te roepen met "Nu bijwerken" (alleen voor de eigen integratie).
- `integrations-ingest` — ontvangt gegevens van een toestel (Opdrachten). Controleert het persoonlijke token,
  accepteert alleen de soorten die bij die integratie zijn aangezet, schrijft `health_samples`.

### Schermen
- **Gezin → Integraties** (beheerder): Google Agenda en schoolroosters per persoon aanzetten, status en laatste update.
- **Gezin → Account → Mijn integraties** (gebruiker): Gezondheid aanzetten, kiezen welke gegevens, de opdracht voor
  Opdrachten installeren, zien wanneer de laatste meting binnenkwam, alles wissen.
- **Beheer** (hoofdbeheerder): integraties voor iedereen aan/uit; aantallen per type, geen inhoud.
- In de apps: Agenda toont een klein icoon bij geïmporteerde items; Training toont gewicht en stappen als die binnenkomen.

### Privacy en rechten
- Geheimen (links, tokens) staan alleen op de server; de app ziet alleen "ingesteld" en de laatste 4 tekens.
- Gezondheid is standaard privé, ook voor gezinsbeheerders en de hoofdbeheerder.
- Integratie uitzetten stopt het ophalen; **verwijderen** wist ook alle binnengehaalde gegevens van die integratie.
- Kinderen: integraties voor een kind zet een gezinsbeheerder aan.

## Versies
| Versie | Wat | Afhankelijk van |
|---|---|---|
| **3.15.0** | Fundament (tabellen, workers, schermen, beheer) + **Google Agenda via iCal-link** | iCal-adres van de gezinsagenda |
| **3.16.0** | **Gezondheid** via Opdrachten: gewicht en stappen in Training | iPhone met Opdrachten |
| **3.17.0** | **Schoolrooster** via iCal-link per persoon (lessen in Agenda) | school zet iCal-link aan |
| later | Huiswerk uit de schoolapp; Google Agenda schrijven (OAuth); Android (Health Connect, vraagt een eigen app) | keuze na 3.17 |

Elke versie: release note, kennisbankartikel (instellen per integratie), tests voor het verwerken (iCal → afspraken,
dubbel ophalen, verwijderd item, wintertijd/zomertijd), rechtentests zoals `scripts/test-platform.mjs`, en de
productiestappen in `supabase/README.md`.

## Open vragen
1. **Welke schoolapp** gebruikt Lynn (Somtoday, Magister, Zermelo, …), en kan de school een agenda-link (iCal) geven?
2. **Google Agenda**: welke agenda('s) van het gezin, en is alleen lezen genoeg?
3. **Gezondheid**: welke gegevens (gewicht, stappen, slaap, hartslag, workouts?), voor wie, en mag het gezin ze zien of
   alleen de gebruiker zelf? Gebruikt iemand in het gezin Android?
4. **Volgorde**: klopt 3.15 Google Agenda → 3.16 Gezondheid → 3.17 School, of eerst school?

Bronnen: [Somtoday: agenda](https://somtoday-servicedesk.zendesk.com/hc/nl/articles/360007748997-Agenda),
[Somtoday agenda-handleiding (school)](https://maken.wikiwijs.nl/bestanden/1055985/SOM%20Agenda%20gebruik.pdf),
[Magister iCal (community)](https://community.home-assistant.io/t/an-alarm-clock-adjusting-to-magister-ical-calendar/537076?page=2),
[Opdrachten: web-API aanroepen](https://support.apple.com/guide/shortcuts/apd58d46713f/ios),
[Gezondheid via Opdrachten (voorbeeld)](https://forum.intervals.icu/t/getting-wellness-data-from-your-apple-watch-via-apple-shortcuts/86164.md),
[Health Webhook](https://apps.apple.com/cd/app/id6763619597),
[Google Agenda: agenda via URL](https://support.google.com/calendar/answer/37111?hl=nl).
