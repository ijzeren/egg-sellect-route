# Plan: Financiën (bankrekeningen koppelen)

*Opgesteld 25 nov 2026. Besluiten en open vragen staan onderaan.*

**Status**
- **3.19.0 gebouwd (fase 1)**: app Financiën met inlezen van Rabobank CSV en CAMT.053, soorten, regels, overzicht per
  maand, vaste lasten, rekeningen privé of gedeeld met de beheerders. Code: `finance/` (`import.js`, `money.js`,
  `app.js`), database in `supabase/schema.sql` (sectie Financiën), rechtentest `scripts/test-finance.mjs`.
- Zoals gebouwd, anders dan hieronder: soorten en regels worden in de app toegepast (één plek, getest), niet in de
  database; de hash van de tegenrekening heet `counterparty_hash`; geen aparte `share`-config maar `finance_accounts.shared`.
- **3.21.0 gebouwd (fase 2)**: uitbetalingen van Booking.com en Airbnb koppelen aan boekingen in Verhuur. Tabel
  `rental_booking_payouts` (boeking, transactie, bedrag, datum; lezen = beheerder Verhuur, koppelen = beheerder Verhuur
  die de transactie ziet). Herkennen en voorstellen in `finance/payouts.js` (boekingsnummer in omschrijving, precies
  bedrag, of een combinatie van boekingen die samen het bedrag is). Verhuur toont "ontvangen op …" en "Nog niet
  uitbetaald". Rechtentest `scripts/test-payouts.mjs`. Nog te controleren met echte afschrijvingen: naam en
  omschrijving van de uitbetalingen en het ritme van Booking.com.
- Nog niet: Enable Banking (fase 3).

Nieuwe app **Financiën** (`/finance/`, app-id `finance`): bij- en afschrijvingen van de eigen bankrekeningen binnenhalen,
indelen in soorten (boodschappen, energie, verzekering, …) en uitbetalingen van Booking.com en Airbnb koppelen aan
boekingen in Verhuur.

**Deze repository is openbaar.** In dit plan en in testbestanden komen geen IBAN's, saldi, bedragen of namen.

## Doel
| Wens | Wat de app doet |
|---|---|
| **Huishouden in kaart** | Per maand: wat kwam binnen, wat ging eruit, per soort. Vaste lasten herkend. |
| **Vanzelf binnen** | Eén keer per dag de nieuwe transacties van de gekoppelde rekeningen ophalen. |
| **Uitbetalingen volgen** | Booking.com- en Airbnb-uitbetalingen herkennen en koppelen aan de boekingen in Verhuur: is alles betaald? |
| **Weinig werk** | Regels ("alles van Eneco = energie") één keer maken; daarna deelt de app zelf in. |

## Wat technisch kan (belangrijk)
**De "standaard" is PSD2, Europese wetgeving (niet wereldwijd).** Elke bank in de EU/EER, ook Rabobank, moet
rekeninggegevens via een API delen met een **vergunninghouder** (AISP, *account information service provider*), als
de rekeninghouder daar toestemming voor geeft. Buiten Europa bestaan vergelijkbare stelsels (Open Banking in het VK),
maar die doen hier niet mee.

**Zelf rechtstreeks op de Rabobank-API kan niet.** De PSD2-API van Rabobank (`developer.rabobank.nl`) is alleen voor
partijen met een vergunning van DNB (of een andere EU-toezichthouder) en een eIDAS-certificaat. Voor een gezin
onhaalbaar. Er moet dus een vergunninghouder tussen zitten die de API doorgeeft.

### Toestemming en grenzen (geldt voor elke route via PSD2)
- **Toestemming 180 dagen.** Daarna moet de rekeninghouder opnieuw inloggen bij de bank (Rabobank: "Consent is valid
  for 180 days"). De app herinnert er ruim op tijd aan.
- **Historie standaard 90 dagen.** Langer terug kan bij Rabobank eenmalig ("one-time access to the entire online
  available history"), met een extra stap.
- **Maximaal 4 keer per dag** ophalen zonder dat de gebruiker erbij is. Eén keer per dag is genoeg.
- Alleen **lezen**. Betalen vanuit Thuis doen we niet.

### Aanbieders (stand november 2026)
| Route | Wat het is | Kosten | Oordeel |
|---|---|---|---|
| **1. Enable Banking, beperkte modus** | Finse vergunninghouder met één API voor veel Europese banken, ook Rabobank. Een app in productie werkt eerst alleen met **eigen gekoppelde rekeningen** ("restricted mode", bedoeld voor uitproberen en "individual non-commercial use"). Volledig gebruik vraagt een contract. | Beperkte modus volgens derden gratis; **niet bevestigd** door Enable Banking zelf (prijspagina niet te lezen). Sinds eind oktober 2026 alleen ondersteuning via hun AI-assistent voor persoonlijk gebruik. | **Aanbevolen voor automatisch ophalen**, mits Rabobank in productie werkt en het gratis blijft. |
| **2. Export uit Rabobank** | In Rabo Online Bankieren transacties downloaden (CSV of CAMT.053) en in Thuis inlezen. | Gratis, geen derde partij. | **Start hiermee.** Bouwt alles wat het echte werk is (soorten, regels, koppelen aan boekingen). Blijft de terugvaloptie. |
| 3. GoCardless Bank Account Data (voorheen Nordigen) | Was de bekende gratis route. | — | **Afgevallen**: geen nieuwe aanmeldingen sinds juli 2025. |
| 4. Betaalde aggregators (Tink, Yapily, Salt Edge, Ponto) | Zakelijke contracten. | Maandbedragen, gericht op bedrijven. | **Afgevallen**: de bankkoppeling mag niets kosten (besluit 25 nov 2026). Is Enable Banking niet gratis, dan blijft het bij inlezen. |

**Gevolg voor andere gezinnen.** Thuis is voor meerdere gezinnen. De beperkte modus van Enable Banking werkt alleen
voor eigen rekeningen van de eigenaar van de Enable Banking-app. De bankkoppeling is dus **alleen voor ons eigen
gezin**, tenzij er later een (betaald) contract komt. Het inlezen van een export (route 2) kan wel voor iedereen.
Daarom: de app `finance` staat aan voor alle gezinnen zodra hij klaar is (export inlezen), het type `bank` in
`platform_integrations` alleen voor ons gezin.

### Hoe de koppeling met Enable Banking werkt
1. Eenmalig (eigenaar): app registreren in het Control Panel van Enable Banking, kiezen voor productie, sleutelpaar
   maken. De **privésleutel** komt in de Supabase-secrets, nooit in de repository of op de telefoon. Dan "Activate by
   linking accounts": eigen Rabobank-rekening koppelen. De app is dan actief in beperkte modus.
2. In Thuis (rekeninghouder): **Financiën → Instellingen → Rekening koppelen** → Edge Function vraagt een
   autorisatielink aan (`POST /auth`, bank Rabobank NL, `valid_until` = nu + 180 dagen) → doorsturen naar Rabobank →
   inloggen en rekeningen kiezen → terug naar Thuis (de `redirect_url` is een vast https-adres van de app op GitHub
   Pages, vooraf geregistreerd) → Edge Function wisselt de code in (`POST /sessions`) en bewaart de sessie.
   Let op: het koppelen in het Control Panel activeert alleen de app; per rekening is daarna nog deze stap nodig.
3. Elke nacht: Edge Function haalt per rekening de transacties sinds de laatste keer op (met een paar dagen overlap)
   en het saldo.

**Vanuit de browser kan het niet**: de privésleutel ondertekent elk verzoek. Alles loopt via de bestaande Edge
Function `integrations`, nieuw type `bank` (modi `cron` en `sync`, zoals de agendalinks).

## Opzet
### Wie ziet wat (strenger dan alles wat er nu is)
- Een rekening heeft een **eigenaar** (de gebruiker die hem koppelt of inleest).
- **Privé is de standaard**: alleen de eigenaar ziet transacties en saldo. Zelfde patroon als Gezondheid
  (`config.share`).
- Per rekening kan de eigenaar kiezen: **delen met de beheerders van het gezin** (bijv. de en/of-rekening). Leden en
  kinderen zien nooit bankgegevens.
- Hoofdbeheer ziet alleen aantallen (aantal gekoppelde rekeningen, laatste run), **geen** transacties, IBAN's of
  bedragen. Zo staat het in CLAUDE.md, zo blijft het.
- **Ontkoppelen** stopt het ophalen; **verwijderen** wist alle transacties van die rekening.

### Schermen
1. **Overzicht** (opent hierop): deze maand in/uit per soort, vergeleken met het gemiddelde; saldo per rekening;
   melding als een koppeling binnenkort verloopt.
2. **Transacties**: lijst per rekening, zoeken, filter per soort; tik = soort kiezen of regel maken
   ("Altijd zo indelen").
3. **Vaste lasten**: herkende terugkerende afschrijvingen (zelfde tegenpartij, ongeveer zelfde bedrag, maandelijks),
   met de verwachte volgende datum.
4. **Instellingen** (in de app): rekeningen (koppelen, inlezen, delen, ontkoppelen), soorten, regels.
- Op de telefoon: kaarten, geen brede tabellen. IBAN's alleen ingekort (laatste 4). Getest op 320 px.

### Uitbetalingen Booking.com en Airbnb → Verhuur
Dit hoort bij deze app maar schrijft in Verhuur: een transactie wordt gekoppeld aan één of meer boekingen in
`rental_bookings` (koppeltabel, zie Datamodel). Verhuur toont dan per boeking "uitbetaald op …" en een lijst
"nog niet uitbetaald".
- **Airbnb** betaalt naar verwachting **per reservering** uit, kort na aankomst. Koppelen op bedrag en datum, of op
  de reserveringscode als die in de omschrijving staat (**te controleren** met een paar echte afschrijvingen).
- **Booking.com** betaalt vaak **in één keer voor meerdere boekingen** (per week of maand), met een
  uitbetalingsnummer in de omschrijving. Koppelen = de som van de verwachte uitbetalingen per boeking vergelijken met
  het bedrag (**te controleren**: welk ritme, welke omschrijving).
- De app stelt koppelingen voor; de beheerder bevestigt. Klopt een bedrag niet (verschil met de verwachte
  uitbetaling), dan zie je dat.
- De uitbetalingen komen binnen op een **Rabobank-rekening** (bevestigd 25 nov 2026); geen tweede bank nodig.

### Datamodel (schets, `supabase/schema.sql`, idempotent)
- Hergebruik: `integrations` (type `bank`, `config` = `{ bank, account_uids, share, consent_until }`),
  `integration_secrets` (sessie-id van Enable Banking; nooit leesbaar vanuit de app), `integration_runs`.
- `finance_accounts`: `team_id`, `user_id` (eigenaar), `integration_id` (leeg bij inlezen), `name`, `iban_last4`,
  `iban_hash` (om dubbele rekeningen te herkennen zonder het nummer leesbaar op te slaan), `currency`, `share`
  (met beheerders), `balance`, `balance_at`.
- `finance_transactions`: `account_id`, `external_id` (van de bank, of een hash van datum + bedrag + omschrijving bij
  inlezen; uniek per rekening, zodat dubbel ophalen of inlezen niets dubbel maakt), `booked_on`, `amount`
  (negatief = af), `counterparty`, `counterparty_iban_hash`, `description`, `category_id`, `category_source`
  (`rule`, `manual`), `hidden` (bijv. overboekingen tussen eigen rekeningen).
- `finance_categories`: `team_id`, naam, groep (inkomen, vaste lasten, huishouden, vrije tijd, verhuur, sparen),
  volgorde. Standaardset bij het aanzetten.
- `finance_rules`: `team_id`, `user_id`, voorwaarde (tegenpartij bevat / IBAN / omschrijving bevat / bedrag),
  `category_id`, volgorde.
- `rental_booking_payouts` (bij Verhuur): `booking_id`, `transaction_id`, `amount`, `matched_by`, `confirmed_at`.
- RLS: `finance_*` via `has_app(team_id, 'finance')` **en** (eigenaar **of** (`share` en gezinsrol `admin`)).
  Koppelen aan Verhuur alleen als je beide mag zien.

### Dagelijks ophalen
- pg_cron één keer per nacht (bijv. 04:30) in `supabase/cron.sql`, via `integrations` met `{ "mode": "cron" }`.
- "Nu bijwerken" per rekening (telt mee voor de 4 per dag).
- Per transactie `upsert` op (rekening, `external_id`). Een soort die de gebruiker zelf koos, wordt nooit
  overschreven.
- Na het ophalen: regels toepassen op nieuwe transacties, uitbetalingen voor Verhuur voorstellen.
- Verloopt de toestemming binnen 14 dagen: tegel en melding "Bankkoppeling vernieuwen". Verlopen: status
  `expired`, ophalen stopt, gegevens blijven.

## Fasering
1. **Inlezen en indelen**: app `finance`, rekeningen, Rabobank-export (CSV en CAMT.053) inlezen, soorten, regels,
   overzicht per maand, vaste lasten, rechten. Werkt voor ieder gezin.
2. **Uitbetalingen koppelen aan Verhuur** (zodra Verhuur er is).
3. **Enable Banking** (type `bank`): koppelen, dagelijks ophalen, verlopen en vernieuwen. Alleen voor ons gezin.
4. Later: begroting per soort per maand, spaardoelen, meer banken (Frans, ING, …).

Elke stap: release note, kennisbankartikel ("Bankrekening koppelen", "Transacties indelen met regels",
"Wie ziet mijn bankgegevens?"), tests (inlezen CSV/CAMT.053 met nepdata, dubbel inlezen, regels, herkenning vaste
lasten, koppelen van een uitbetaling over meerdere boekingen), rechtentests zoals `scripts/test-platform.mjs`, en de
productiestappen in `supabase/README.md`.

## Eerste stap
1. Bij Enable Banking een account maken, een productie-app registreren en de eigen Rabobank-rekening koppelen. Kijken
   of het lukt, en wat het Control Panel zegt over **kosten en limieten** van de beperkte modus (en de "Restriction
   of Use" in de voorwaarden).
2. Eén testaanroep (lokaal, sleutel niet in de repo): welke velden komen er per transactie binnen (tegenpartij, IBAN,
   omschrijving, boekingsdatum, unieke id)?
3. Een Rabobank-export (CSV) van een paar maanden bekijken; vorm vastleggen in dit plan (zonder bedragen).
4. Een paar echte uitbetalingen van Booking.com en Airbnb opzoeken: omschrijving, ritme, één of meer boekingen.

## Besluiten (25 nov 2026)
- **Naam**: Financiën (id `finance`).
- **Rekeningen**: de gezamenlijke rekening, de persoonlijke rekeningen en de spaarrekeningen. Geen aparte
  verhuurrekening; de uitbetalingen van Booking.com en Airbnb komen op een Rabobank-rekening binnen.
- **Wie ziet wat**: privé is de standaard; de eigenaar kan een rekening delen met de **beheerders van het gezin**.
  Leden en kinderen zien nooit bankgegevens.
- **Kosten**: de bankkoppeling mag niets kosten. Is de beperkte modus van Enable Banking niet gratis, dan blijft het
  bij inlezen van een export (route 2).
- **Historie**: vanaf 1 januari 2026, via een export uit Rabobank. Daarna nieuwe transacties via de koppeling (of
  telkens een nieuwe export).

## Nog te controleren
1. **Spaarrekeningen via PSD2**: de wet gaat over betaalrekeningen; of Rabobank spaarrekeningen via de API deelt, is
   onzeker. Anders: saldo en transacties van de spaarrekening via de export, of alleen de overboekingen ernaartoe
   vanaf de betaalrekening.
2. **Persoonlijke rekening van een partner** in de beperkte modus van Enable Banking: "eigen rekeningen" is mogelijk
   letterlijk bedoeld (alleen van wie de Enable Banking-app heeft). Uitproberen; lukt het niet, dan leest die
   persoon een export in.
3. Kosten en limieten van de beperkte modus (Control Panel, "Restriction of Use" in de voorwaarden).
4. Omschrijving en ritme van de uitbetalingen van Booking.com en Airbnb op de Rabobank-rekening.

## Bronnen
- Rabobank PSD2 account information (180 dagen, historie): https://developer.rabobank.nl/overview/account-information,
  https://docs.developer.rabobank.com/psd2/reference/oauth
- EBA: wijziging RTS (90 → 180 dagen): https://www.eba.europa.eu/eba-response/29323
- Enable Banking: eigen rekeningen koppelen (beperkte modus): https://enablebanking.com/docs/api/linked-accounts/
- Enable Banking API-referentie (`/auth`, `/sessions`, `valid_until`): https://enablebanking.com/docs/api/reference/
- Enable Banking changelog oktober 2026 (ondersteuning persoonlijk gebruik):
  https://enablebanking.com/blog/2026/16/11/changelog-october-2026-675wa
- GoCardless Bank Account Data dicht voor nieuwe aanmeldingen: https://actualbudget.org/docs/advanced/bank-sync/gocardless/,
  https://banksync.io/alternatives/gocardless-bank-account-data
- Overzicht gratis open-banking-API's: https://www.openbankingtracker.com/guides/free-open-banking-apis
