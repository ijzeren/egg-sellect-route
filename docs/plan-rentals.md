# Plan: Verhuur (overzicht per vakantiehuis)

*Opgesteld 25 nov 2026. Status: **fase 1 gebouwd in v3.20.0** (boekingen met de hand, aangifte, rollen), **fase 2 in
v3.22.0** (kosten, begroting, jaaroverzicht, import van de spreadsheet); fase 3–4 volgen (zie Fasering). Open vragen staan onderaan. Versie: eerstvolgende vrije minor (3.18.0 is Pilates; zie `shared/releases.js`).*

Nieuwe app **Verhuur** (`/rentals/`, app-id `rentals`). Eerste huis: **Vacances au Bonhomme** (Le Bonhomme, Haut-Rhin,
intercommunalité Vallée de Kaysersberg).

## Doel
| Wens | Wat de app doet |
|---|---|
| **Boekingen vanzelf binnen** | Eén keer per dag alle boekingen van Booking.com en Airbnb ophalen. |
| **Aangifte in één keer** | Per maand een tabel die je regel voor regel overneemt in het aangifteportaal van de taxe de séjour. |
| **Annuleringen netjes** | Geannuleerd = niet meer in het overzicht, wel bewaard (met datum van annuleren). |
| **Directe boekingen** | Zelf invoeren: data, personen, prijs per nacht, schoonmaak, bedlinnen. De app rekent de toeristenbelasting uit. |

## Wat technisch kan (belangrijk)
**Booking.com en Airbnb geven geen API aan losse verhuurders.**
- **Booking.com**: de Connectivity API's zijn alleen voor *Connectivity Partners* (softwarebedrijven: channel managers,
  PMS). Toegang loopt via een koppeling die de eigenaar aan zo'n partner geeft.
- **Airbnb**: de API is alleen voor uitgenodigde softwarepartners. Airbnb neemt op dit moment geen nieuwe aanvragen aan.
- **Zelf partner worden** (als ontwikkelaar een licentie aanvragen): **niet haalbaar of zinvol**. Airbnb neemt niemand
  aan. Booking.com vraagt een bedrijf met PCI- en privacy-eisen (PII), volledige verwerking van prijzen en
  beschikbaarheid een jaar vooruit, een minimum aantal accommodaties per regio, en sluit de aanmelding regelmatig
  (in 2026 volgens meerdere bronnen gepauzeerd). Bovendien kan een advertentie maar met één channel manager tegelijk
  verbonden zijn: het huis loopt al via Lodgify (bevestigd 25 nov 2026), dus die plek is bezet.

Wat wel kan, in volgorde van voorkeur:

| Route | Wat je krijgt | Kosten | Oordeel |
|---|---|---|---|
| **1. Lodgify Public API** | Lodgify is al verbonden met Booking.com en Airbnb. Via de API (`api.lodgify.com/v2/reservations/bookings`, header `X-ApiKey`) lezen we alle boekingen van alle kanalen: data, status, bron, gasten, bedragen. | Zit in het Lodgify-abonnement, **mits het plan de Public API bevat** (niet elk plan; sleutel aanvragen in Lodgify: *Settings → Public API*). | **Aanbevolen.** Volledig automatisch, officieel, één koppeling voor alle kanalen. |
| **2. iCal + zelf aanvullen** | Agendalinks van Booking.com en Airbnb (of van Lodgify). Data en annuleringen automatisch (een boeking die verdwijnt = geannuleerd). Personen, volwassenen en prijs vul je per boeking zelf in. Airbnb-iCal geeft alleen "Reserved", de data, een link naar de reservering en de laatste 4 cijfers van het telefoonnummer. Wat de Booking.com-iCal bevat: **te controleren** (waarschijnlijk alleen "bezet"). | Gratis. Hergebruikt de bestaande agendakoppeling (`supabase/functions/integrations/ical.mjs`). | **Terugvaloptie** als de Lodgify-API niet in het plan zit. |
| 3. E-mails van de platforms uitlezen | Bevestigingsmails bevatten gasten en prijs. | Gratis, maar breekbaar (opmaak verandert). | Niet aanbevolen. |

**Lodgify Public API v2 — wat de documentatie zegt** (`docs.lodgify.com/reference/getallasync`, gelezen 25 nov 2026):
- `GET https://api.lodgify.com/v2/reservations/bookings`, pagina's (`page`, `size` tot 50 standaard).
- Filters: `updatedSince` (alleen gewijzigd sinds), `stayFilter` (`Upcoming`, `Current`, `Historic`, `All`,
  `ArrivalDate`, `DepartureDate` + `stayFilterDate`), `trash` (`False`/`True`/`All`), `includeTransactions`,
  `includeQuoteDetails`, `includeExternal`.
- Per boeking: `id`, `arrival`, `departure`, `property_id`, `status` (`Open`, `Tentative`, `Booked`, `Declined`),
  **`canceled_at`**, `is_deleted` (in prullenbak), `created_at`, `updated_at`.
- **Bron**: `source` met o.a. `AirbnbIntegration`, `Airbnb`, `BookingCom`, `Manual`, `ICal`, `PublicApi`, `Other`;
  `source_text` en `external_booking` (gegevens zoals het kanaal ze stuurde; daar zit het kanaalnummer naar verwachting).
- **Gasten**: `rooms[].guest_breakdown` met `adults`, `children`, `infants`, `pets` (`people` is verouderd).
- **Bedragen**: `currency_code`, `total_amount`, `subtotals` met `stay`, `promotions`, `fees`, `taxes`, `addons`, `vat`,
  plus `amount_paid` en `amount_due`. Gemiddelde nachtprijs = `subtotals.stay` ÷ nachten.

Nog te controleren met één testaanroep (zie "Eerste stap"):
- of Airbnb en Booking.com via Lodgify de **kinderen apart** doorgeven, of alles als `adults` binnenkomt;
- wat er in `fees` zit (schoonmaak?) en of de taxe van het platform in `taxes` staat;
- hoe een annulering er precies uitziet (`status` = `Declined` en `canceled_at` gevuld?);
- welke Lodgify-plannen de Public API bevatten en waar de sleutel staat (volgens derden: *Settings → Public API*).

**Vanuit de browser kan het niet** (CORS, en de API-sleutel hoort niet op de telefoon). Alles gaat via een Supabase Edge
Function; de sleutel staat in `integration_secrets` (zelfde patroon als de agendalinks), nooit in een antwoord of log.

## Taxe de séjour in Le Bonhomme
Bron: gidsen en tarievenaffiche van de Communauté de communes de la Vallée de Kaysersberg (CCVK) en de hulpfiche van
het aangifteportaal.

**Wie, waar, wanneer**
- Inning: *Régie taxe de séjour*, Office de tourisme de la vallée de Kaysersberg, `taxedesejour@kaysersberg.com`,
  03 89 71 76 88.
- Aangifte en betaling: **elke maand vóór de 5e**, over de vorige maand, via `https://ccvk.consonanceweb.fr`
  ("Je déclare en ligne"). Ook verplicht als er niemand was. Betalen met kaart in het portaal, overschrijving of cheque.
- Je moet een **registre du logeur** bijhouden (aantal gasten per verblijf) en de taxe op de factuur aan de gast zetten.

**Wat het portaal per verblijf vraagt (één regel = één verblijf)** — sluit precies aan op de gevraagde tabel:
1. Platform (keuzelijst) of leeg = direct. Leboncoin als "etalage" (gast betaalt jou) telt als direct.
2. Begin- en einddatum. Het aantal nachten rekent het portaal zelf uit. **Een verblijf over twee maanden**: hele data
   invullen, het portaal verdeelt de nachten zelf.
3. Aantal **occupants** (volwassenen + kinderen; alleen gevraagd bij niet-geclassificeerd), **assujettis**
   (volwassenen, 18+) en **exonérés** (kinderen onder 18).
4. Voor niet-geclassificeerd: de prijs (nodig voor het percentage). Exact veld (prijs per nacht of totaal) **te
   controleren** na inloggen.

Het portaal rekent de taxe per regel zelf uit ("TSU"). **Verblijven via een platform dat int, moet je óók invullen**;
die staan er ter informatie en tellen niet mee in het te betalen totaal. Alleen directe verblijven betaal je zelf af.
Of het portaal een bestand (CSV/Excel) kan inlezen is **onbekend** (alleen te zien na inloggen).

**Wie int**
- **Airbnb** int en draagt af in Frankrijk, als de gemeente haar tarieven in Ocsitan (de rijksdatabase) heeft staan.
- **Booking.com** int voor jullie (bevestigd door jou: betalingen via Booking.com).
- **Direct**: jullie innen en dragen af. Dit is het enige bedrag dat je echt betaalt.

**Hoe het bedrag wordt berekend — en waarom het classement ertoe doet**
De formule hangt af van of het huis een geclassificeerd *meublé de tourisme* is (met sterren, na een officiële keuring):

- **Geclassificeerd (sterren)**: vast bedrag per volwassene per nacht, inclusief 10% departementale toeslag
  (CCVK, 2025/2026): ★ € 0,88 · ★★ € 1,10 · ★★★ € 1,76 · ★★★★ € 2,75 · ★★★★★ € 3,63. Prijs doet er niet toe.
  Voorbeeld: 2 volwassenen + 1 kind, 7 nachten, 3★ → 2 × 7 × € 1,76 = € 24,64.
- **Niet geclassificeerd**: **5% van de prijs per persoon per nacht** (prijs zonder belasting, gedeeld door **alle**
  gasten, kinderen meegeteld), met een plafond, plus 10% departementale toeslag, en dan maal het aantal volwassenen en
  nachten. Bedragen afronden op centen. Minderjarigen zijn vrijgesteld "op vertoon van een bewijs": kunnen laten zien
  hoe oud de kinderen zijn (bijv. uit de boeking).
  Voorbeeld CCVK: 700 € voor 7 nachten, 3 volwassenen + 1 kind → 100 €/nacht ÷ 4 = 25 € → 5% = 1,25 + 10% = 1,38 €
  → 1,38 × 7 × 3 = **€ 28,98**.

Het classement bepaalt dus of de app een vast tarief of een percentage van de nachtprijs gebruikt. Bij
niet-geclassificeerd is de **gemiddelde nachtprijs** nodig; bij geclassificeerd niet.

**Tegenstrijdigheid in de bronnen (instelbaar maken, navragen bij de régie):**
- Plafond niet-geclassificeerd: de gids zegt **€ 3,00** (+10% = € 3,30); de nieuwere tarievenaffiche zegt **€ 4,60**
  (+10% = € 0,46, samen € 5,06 = het palace-tarief). Waarschijnlijk geldt nu € 4,60.
- Of **schoonmaak en bedlinnen** meetellen in "de prijs van de nacht" staat niet in de gidsen.
- Of Airbnb-**baby's** meetellen als occupant.

Daarom: percentage, plafond, toeslag en vaste tarieven **per huis per jaar instelbaar**, met de CCVK-waarden als
standaard.

## Opzet van de app
### Rollen
- **Beheerder** (`admin`): alles, ook bedragen, instellingen, directe boekingen invoeren.
- **Kijker** (`member`, getoond als "Kijker", zoals andere apps `member` als standaardrol gebruiken): ziet wie wanneer komt en met hoeveel personen (bijv. voor schoonmaak), **geen bedragen**.
  Bedragen staan daarom in een aparte tabel die alleen `app_role = admin` mag lezen (RLS werkt per rij, niet per kolom).

### Schermen
1. **Komend** (opent hierop, zie "open most relevant"): wie komt er nu / als volgende, aantal personen, vertrek.
2. **Aangifte** (alleen beheerder): kies een maand. Tabel per boeking, in de volgorde van het portaal:

   | Geboekt bij | Van | Tot | Nachten | Personen | Volwassenen | Kinderen | Gem. nachtprijs | Taxe | Geïnd door |
   |---|---|---|---|---|---|---|---|---|---|

   - Kinderen = personen − volwassenen (het portaal vraagt "exonérés").
   - "Taxe" = wat de app verwacht; bij platformboekingen ter controle, bij direct het te betalen bedrag.
   - Onderaan: **totaal te betalen** (alleen directe boekingen) en een waarschuwing als iets ontbreekt
     (bijv. aantal volwassenen onbekend).
   - Op de telefoon: geen brede tabel maar één kaart per boeking met dezelfde velden in portaalvolgorde, met een
     kopieerknop per waarde (nooit breder dan 320 px). Daarnaast **CSV downloaden** voor op de computer.
   - "Klaar met aangifte" → maand gemarkeerd als aangegeven (datum). Komt er daarna een wijziging of annulering in die
     maand binnen, dan toont de app: "Na aangifte gewijzigd — corrigeer in het portaal."
3. **Directe boeking** (beheerder): zie deel 2.
4. **Instellingen** (in de app, beheerder): huizen, koppeling Lodgify (API-sleutel) of iCal-links, belastingregels per
   jaar, standaardprijzen (schoonmaak, bedlinnen).
5. **Geannuleerd**: filter met bewaarde annuleringen en de datum van annuleren.

### Dagelijks ophalen
- Edge Function (nieuw `rentals`, of een nieuw type in `integrations`) met `{ "mode": "cron" }` en "Nu bijwerken".
- pg_cron **één keer per dag** (bijv. 05:00) in `supabase/cron.sql`.
- Per boeking `upsert` op (huis, bron, extern nummer). Wat we niet vanzelf krijgen (bij iCal: gasten, prijs) wordt nooit
  overschreven door een sync.
- **Annuleringen**: status "geannuleerd" (of bij iCal: niet meer in de feed voor een datum in de toekomst) →
  `cancelled_at` zetten, nooit verwijderen. Weer terug in de feed → opnieuw actief (komt voor bij iCal-storingen).
- Logboek per run (aantal nieuw, gewijzigd, geannuleerd, fout), zichtbaar bij Instellingen.

### Datamodel (schets, `supabase/schema.sql`, idempotent)
- `rental_houses`: `team_id`, naam, gemeente, `classification` (`none` of 1–5 sterren), standaardprijzen.
- `rental_tax_rules`: `house_id`, `year`, `percent` (5), `cap` (4,60), `dept_percent` (10), vaste tarieven per ster.
- `rental_bookings`: `team_id`, `house_id`, `source` (`booking`, `airbnb`, `direct`, `other`), `external_id`,
  `status`, `arrival`, `departure`, `guests`, `adults`, `children`, `infants`, `tax_collected_by` (`platform`/`host`),
  `first_seen_at`, `last_seen_at`, `cancelled_at`, `created_by`, `updated_at`.
- `rental_booking_amounts` (alleen beheerder): `booking_id`, `currency`, `accommodation` (huur totaal), `cleaning`,
  `linen`, `other_fees`, `tourist_tax`, `raw` (antwoord van Lodgify, voor controle).
  Gemiddelde nachtprijs = `accommodation` ÷ nachten (berekend, niet opgeslagen).
- `rental_declarations`: `house_id`, maand, `declared_at`, `declared_by`.
- RLS via `has_app(team_id, 'rentals')`; bedragen en aangifte via `app_role(team_id, 'rentals') = 'admin'`.
- Gastnamen: alleen als het nodig is (factuur directe boeking). Uit Lodgify bewaren we geen namen, e-mail of telefoon.

## Deel 2: directe boekingen
Invoer (beheerder): van, tot, aantal personen, waarvan volwassenen, afgesproken **prijs per nacht**, **schoonmaak**,
**bedlinnen** (bedrag per set of totaal — zie vragen), optioneel naam gast en notitie.

De app rekent direct uit en toont:
- nachten, huur (prijs × nachten), schoonmaak, bedlinnen;
- **taxe de séjour** met de regels van het huis voor dat jaar (zie formule hierboven);
- **totaal voor de gast**, met de taxe apart vermeld (verplicht op de factuur).

Optioneel later: een eenvoudige bevestiging/factuurtekst om te delen, en de boeking ook in Lodgify zetten zodat de
data dicht gaan op Booking.com en Airbnb (nu: zelf blokkeren in Lodgify).

## Deel 3: kosten, begroting en resultaat per huis
Doel: per huis en per jaar precies weten wat de verhuur oplevert. Kosten, opbrengsten, eigen gebruik en een begroting
die sluit. Elk huis is anders geregeld, dus **de kostensoorten zijn per huis instelbaar**.

### Inventarisatie: wat er nu wordt bijgehouden (spreadsheet Bonhomme)
De huidige administratie is één Excel-bestand met 22 tabbladen. **Bedragen en namen staan bewust niet in dit plan**:
deze repository is openbaar. Alleen de opbouw:

| Tabblad | Wat erin staat | In de app |
|---|---|---|
| Boekingen 2023–2026 | Per boeking: gast, van, tot, status (Optie, Verwacht, Geboekt, Afgerond, Geannuleerd), personen, nachten, totaalprijs, uitbetaling, schoonmaak, bedlinnen, toeristenbelasting, vaste kosten per boeking, commissie verhuurmakelaar, verdiensten, rendement, kanaal, land van herkomst. | Boekingen (importeren). Optie/Verwacht = **verwachte boeking** voor de begroting. |
| Kosten / Kosten 2025 / Kosten 2026 | Begroting per kostensoort (per maand of per jaar), percentages per boeking (gemeente, makelaar, platform), lijst "extra facturen" (bedrijf, datum, bedrag, factuurnummer, omschrijving, voldaan). | Begroting per jaar + kosten (werkelijk). |
| Dashboard | Aantal boekingen per kanaal en per land, per jaar. | Jaaroverzicht (berekend). |
| Overzicht 2023/2024, Opbrengsten | Rekenmodel bezetting → opbrengst, met investering en lening; deels kapot (`#REF!`). | Vervalt; het jaaroverzicht rekent met echte cijfers. |
| Verhuurperiodes | Seizoen per week (hoog/midden/laag), nachtprijzen, platformpercentages. | Later (prijzen staan in Lodgify). |
| Belastingdienst - Kosten | Facturen met bedrijf, opdracht, datum, bedrag en type (renovatie of onderhoud). | Kosten met soort **Investering/renovatie** apart van exploitatie. |
| Inventaris gîte | Inventarislijst per ruimte (keuken: borden, glazen, pannen, aantallen). | **Inventaris** (importeren). |
| Fioul | Aankoop stookolie: liters, prijs, totaal. | Kosten met hoeveelheid (liters). |
| Leningen | Wie, wanneer, bedrag, waarvoor. | Open vraag (zie onder). |
| Tuin planning, Hottub, Jardin, Tuinverlichting, Zwembad | Klussen- en projectbegrotingen (offertes, onderdelen). | Niet in de eerste versie; eventueel later "projecten". |
| Sheet1 | Draaitabel per maand. | Vervalt. |

**Wat opvalt (eerst samen nakijken vóór import):**
- **Verdiensten**: in de meeste regels wordt de btw (×1,2) op de makelaarscommissie twee keer gerekend: de commissie
  is al ×1,2 en daarna gaat (commissie + schoonmaak + bedlinnen + vaste kosten) nog eens ×1,2. In een paar regels
  niet. Daardoor zijn de verdiensten per boeking niet onderling vergelijkbaar.
- De commissie van 2026 rekent met het percentage van het tabblad 2025.
- Uitbetaling soms met een vast bedrag in de formule, bij verwachte boekingen met een vast percentage.
- Verwachte toeristenbelasting = personen × nachten × vast bedrag. Dat klopt niet met de regels van de CCVK
  (alleen volwassenen, percentage van de nachtprijs, plafond).
- Er is alleen "personen", geen aantal **volwassenen**; voor de aangifte is dat nodig (vanaf nu invullen).
- **Eigen gebruik** staat nu als "Direct" met prijs 0 en soms een bijdrage. In de app wordt dat een eigen soort.

### Begrippen in de app
- **Opbrengst** van een boeking = uitbetaling (wat binnenkomt na platformkosten), zonder de toeristenbelasting die het
  platform int.
- **Kosten per boeking** (automatisch, per huis instelbaar): schoonmaak, bedlinnen, vaste kosten per boeking,
  commissie verhuurmakelaar (percentage over uitbetaling min schoonmaak en bedlinnen, plus btw). Eén keer goed
  vastleggen, daarna rekent elke boeking hetzelfde.
- **Kosten** (werkelijk): datum, kostensoort, bedrag, leverancier, omschrijving, factuurnummer, betaald ja/nee,
  eventueel hoeveelheid (liters stookolie, m³ brandhout, kWh). Later: foto of pdf van de factuur.
- **Begroting**: per jaar per kostensoort een bedrag (per maand × 12 of per jaar). Het jaaroverzicht zet begroot naast
  werkelijk.
- **Eigen gebruik**: een verblijf van de familie zelf (soort `own`), met nachten en personen, de directe kosten
  (schoonmaak, bedlinnen) en eventuele bijdrage. Telt niet als verhuur in de aangifte. Een gratis verblijf valt niet
  onder de taxe de séjour (alleen verblijf "à titre onéreux"); een betaalde bijdrage wel: navragen.
- **Investering/renovatie**: apart van de jaarlijkse kosten, zodat het resultaat van de verhuur niet vertekent.

### Kostensoorten Bonhomme (eerste voorstel)
Gevraagd: elektra, water, stookolie, verhuurmakelaar, bedlinnen, schoonmaak, tuinman, administratiekantoor, brandhout,
overig. In de spreadsheet staan daarnaast: internet, taxe foncière, taxe d'habitation (tweede woning),
verzekeringen, riool, controle verwarmingsketel, schoorsteenveger, inkomstenbelasting, onvoorzien. Per soort:
naam, groep (vast, verbruik, per boeking, belasting, investering), en of hij in de begroting meetelt.

### Schermen (aanvulling)
- **Jaar** (beheerder): opbrengsten, kosten per soort (begroot en werkelijk), resultaat, **% kostendekkend** en
  "nog te dekken", bezetting (nachten verhuurd, eigen gebruik, leeg), per kanaal en per land. Inclusief verwachte
  boekingen als aparte regel, zodat je ziet of de begroting sluit.
- **Kosten** (beheerder): lijst per jaar, snel invoeren (soort, bedrag, datum), filter per soort.
- **Inventaris** (beheerder en kijker): per ruimte: voorwerp, aantal, notitie; afvinken bij controle na een verblijf.

### Datamodel (aanvulling)
- `rental_cost_categories`: `house_id`, naam, groep, volgorde, actief.
- `rental_costs`: `house_id`, `category_id`, datum, bedrag, hoeveelheid + eenheid, leverancier, omschrijving,
  factuurnummer, betaald, `booking_id` (optioneel, kosten bij één verblijf).
- `rental_budget`: `house_id`, jaar, `category_id`, bedrag.
- `rental_booking_rules`: `house_id`, geldig vanaf, standaard schoonmaak, bedlinnen, vaste kosten per boeking,
  commissiepercentage en btw.
- `rental_inventory`: `house_id`, ruimte, voorwerp, aantal, notitie, gecontroleerd op.
- `rental_bookings.source` krijgt `own` (eigen gebruik); `status` krijgt `option` en `expected` (voor de begroting,
  niet in de aangifte); veld `country` (herkomst).
- Alles met bedragen alleen voor `app_role = admin`; inventaris ook voor kijkers.

### Importeren wat er nu is
Eenmalig, via een script dat het Excel-bestand **lokaal** leest (`scripts/`, het bestand en de gegevens komen nooit in
de repository) en na controle in Supabase zet. Eerst een droge run met een samenvatting per tabblad en per jaar
(aantallen en totalen) om naast de spreadsheet te leggen; pas daarna echt schrijven.

## Fasering
1. **Boekingen handmatig** (start, zonder API): app `rentals`, huis Bonhomme, boekingen invoeren en bewerken
   (platform, direct, eigen gebruik, verwacht), toeristenbelasting berekenen, Aangifte per maand, rollen.
2. **Kosten, begroting en jaaroverzicht**, plus import van de historie.
3. **Inventaris**.
4. **Lodgify-koppeling** (dagelijks ophalen), zodra de API-toegang er is. Handmatig ingevoerde platformboekingen worden
   dan gekoppeld op kanaal, data en aantal personen, niet dubbel.

## Tegel in de hub
- "Aankomst vr 12 dec · 4 pers." of "Nu bezet tot zo 14 dec".
- Van de 1e tot de 5e: "Aangifte november klaarzetten" (alleen beheerder).

## Eerste stap
1. Controleren of het Lodgify-plan de **Public API** bevat; zo ja, een sleutel aanmaken.
2. Eén testaanroep (lokaal, sleutel niet in de repo) op de boekingen van het afgelopen jaar: velden vastleggen in dit
   plan (bron, status, annulering, gasten, bedragen).
3. Bij de régie navragen: plafond 2026, schoonmaak/bedlinnen in de grondslag, baby's, verblijf over twee maanden.
4. Bouwen volgens de fasering hierboven: eerst handmatige boekingen, Lodgify als laatste.

## Open vragen
**Voor jou**
1. Zit de **Public API** in het Lodgify-plan? Lodgify gebruiken jullie (bevestigd); de eigenaar zoekt dat uit.
   Anders: iCal + zelf aanvullen.
2. Is het huis **geclassificeerd** (sterren)? Zo nee: bewust zo, of loopt er een aanvraag?
3. Bedlinnen: vast bedrag per verblijf, per persoon of per set? Schoonmaak: vast bedrag?
4. Moet de app bij een directe boeking ook iets doen in Lodgify (data blokkeren), of doe je dat zelf?
5. Komen er later meer huizen bij (andere gemeente = andere regels)? Het model ondersteunt het al.
6. Wat is "vaste kosten" per boeking (nu een vast bedrag, soms hoger)?
7. Commissie makelaar: waarschijnlijk één keer btw (zie Besluiten). Bevestigen met een paar facturen van de makelaar;
   die worden aangeleverd en geïnventariseerd.
8. Leningen en projecten (hottub, zwembad, tuin): in de app of niet?

**Besluiten (25 nov 2026)**
- Kostensoorten Bonhomme: de gevraagde tien, plus internet, verzekeringen, belastingen (taxe foncière, taxe
  d'habitation, inkomstenbelasting), onderhoud (riool, ketelcontrole, schoorsteenveger) en **onvoorzien**
  (incidentele reparaties, kapotte oven, enz.). **Investeringen/renovaties apart**, buiten het jaarresultaat.
- Eigen gebruik: **directe kosten plus een deel van energie en vaste lasten naar rato van de nachten**.
- Commissie makelaar: uitgangspunt **één keer btw**; definitief na controle van facturen.
- Import: boekingen 2023–2026, begroting en facturen, inventaris, **met gastnamen** (alleen zichtbaar voor beheerders).
  Alles wat geïmporteerd is, blijft in de app aan te passen.

**Fase 2 gebouwd (v3.22.0), keuzes bij de import van de spreadsheet**
- Totaalprijs = huur (`accommodation`): de spreadsheet rekent er ook de prijs per nacht mee.
- Volwassenen staan er niet in: bij de import volwassenen = personen (met een notitie). Oude aangiftes zijn al gedaan.
- Direct zonder prijs = eigen gebruik; Optie/Verwacht zonder kanaal = kanaal "anders" (schatting).
- Tabblad "Kosten" zonder jaar = begroting 2024. "Extra facturen" → kosten Onvoorzien (zonder datum in een voorbij jaar
  op 31 december; in het lopende jaar zijn het begrotingsposten).
- Belastingdienst - Kosten: Renovatie → investeringen, Onderhoud → onderhoud. **Niet** ingelezen: facturen van de
  makelaar (type Verhuur; die bedragen zitten al in de boekingen) en geschatte vaste lasten zonder datum.
- Fioul is een prijsverloop, geen aankoop: niet ingelezen.
- Kosten per boeking zonder btw over schoonmaak en bedlinnen. Rekent de makelaar daar wel btw over, dan is het
  resultaat te hoog (open vraag 7: facturen nakijken).

**Voor de régie (taxedesejour@kaysersberg.com)**
1. Plafond voor niet-geclassificeerd in 2026: € 3,00 of € 4,60?
2. Tellen schoonmaak- en bedlinnenkosten mee in de prijs van de nacht?
3. Tellen baby's (Airbnb "infants") mee als occupant?
4. Verblijf over twee maanden: in welke maandaangifte vul je het in?
5. Kan het portaal een bestand (CSV/Excel) met verblijven inlezen?

## Bronnen
- Booking.com Connectivity: https://developers.booking.com/connectivity/docs, https://connect.booking.com
- Airbnb API (geen nieuwe aanvragen): https://www.airbnb.com/partner, https://www.bnbcalc.com/help/articles/does-airbnb-have-an-api
- Airbnb iCal-inhoud: https://www.uplisting.io/blog/how-the-airbnb-icalendar-ical-changes-will-affect-you-and-how-to-avoid-disruption
- Lodgify API: https://docs.lodgify.com/reference/getallasync
- CCVK taxe de séjour: https://www.cc-kaysersberg.fr/economie/guide_ts_tarif_variable.pdf,
  https://www.cc-kaysersberg.fr/economie/2025-ts-affiche-tarifs-francais.pdf,
  https://www.cc-kaysersberg.fr/economie/2025-guide-hebergeurs-ts-tarifs-fixes.pdf
- Aangifteportaal en hulpfiche: https://ccvk.consonanceweb.fr
- Inning door platforms: https://www.economie.gouv.fr/entreprises/taxe-de-sejour-quelles-sont-les-obligations-des-hebergeurs
