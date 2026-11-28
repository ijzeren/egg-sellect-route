# Plan: boodschappen (Albert Heijn en Picnic)

*Opgesteld 22 nov 2026. Status (23 nov 2026): stap A gebouwd (v3.18.0), stap B gebouwd (v3.19.0); C en D nog niet.
Open vragen staan onderaan.*

**Hoe stap B is gebouwd (wijkt hier en daar af van het plan hieronder):**
- Tabellen: `grocery_choices` (per gezin, per naam via `nameKey`, per winkel; `brand_only`), `grocery_products`
  (cache, geen `team_id`), `grocery_store_state` (alleen server: token, "subcategorie vandaag opgehaald", tellers).
  Nog niet: `grocery_weeks`, `grocery_settings` (stap D).
- Edge Function `groceries-products`: `search` (zoeken, 30 resultaten) en `refresh` (gekozen producten via
  `/product/search/v2/products?ids=…`, daarna per AH-subcategorie één zoekopdracht per dag voor de alternatieven).
  Alleen wat nog niet van vandaag is gaat naar AH; samen max. 30 aanroepen per gezin per minuut.
- Rekenen in de app (`groceries/prices.js`): verpakkingen, bonusacties (`1 + 1 gratis`, `2e halve prijs`,
  `2 voor €`), goedkoper (≥ 10%, met hoeveelheid op echte kosten, nooit slechtere Nutri-Score, naam moet passen),
  gezonder (betere Nutri-Score), totaal.
- Online meerpakken (`isVirtualBundle`, "volume voordeel", bonus tot 2999) tellen niet mee.

## Doel
Sneller, eenvoudiger en goedkoper boodschappen doen, en gezonder eten. Concreet:

| Wens | Wat de app doet |
|---|---|
| **Voorspelbaar** | De lijst vult zich grotendeels zelf: vaste boodschappen met een ritme en de gerechten van deze week. |
| **Goedkoper** | Per artikel de prijs, de bonus van deze week, de prijs per kilo of liter en een goedkoper alternatief. |
| **Gezonder** | Nutri-Score per artikel, een gezonder alternatief, en de gezondheidsscore van de gerechten (al in Gerechten). |
| **Sneller, eenvoudiger** | Eén gedeelde lijst voor het gezin, gesorteerd per afdeling. Later: met één tik in het mandje van Picnic. |
| **Beste deal per week** | Eén lijst, prijzen van meerdere winkels tegelijk, artikelen per winkel gekoppeld, en een advies waar je deze week het goedkoopst bestelt (of hoe je het beste splitst). |

## Wat technisch kan (belangrijk)
**Albert Heijn en Picnic hebben geen officiële API.** Wel bestaan er nagebouwde koppelingen met de API van hun
telefoonapps. Die werken, maar zijn niet gedocumenteerd, kunnen zonder aankondiging veranderen en vallen mogelijk
buiten de voorwaarden. Picnic verandert zijn API ongeveer elke één tot drie maanden.

Waar het om draait is **inloggen**:

| | Zonder inloggen | Met inloggen |
|---|---|---|
| **Albert Heijn** | Producten zoeken met prijs, bonus (incl. bonusperiode), voedingswaarden en Nutri-Score. | Boodschappenlijst lezen/vullen, kassabonnen (wat je kocht), bestellingen en mandje, persoonlijke Bonus Box. |
| **Picnic** | Niets. | Zoeken met prijs, mandje vullen, bezorgmomenten, eerdere bezorgingen met artikelen. |

- **AH zonder inloggen is de stevige basis.** Een anoniem token (`api.ah.nl/mobile-auth/v1/auth/token/anonymous`)
  geeft toegang tot zoeken (`/mobile-services/product/search/v2`) met `currentPrice`, `priceBeforeBonus`,
  `bonusMechanism` en de bonusdatums. Geen account, geen wachtwoord, geen risico voor het gezin.
- **AH met inloggen is onpraktisch.** Inloggen gaat via de AH-site, die terugstuurt naar `appie://login-exit?code=…`.
  Dat adres kan een webapp niet opvangen; je moet de code uit de ontwikkelaarsconsole van een desktopbrowser kopiëren.
  Op de telefoon kan dat niet. Daarnaast vervangt AH de login bij elke vernieuwing: maar één plek kan een login
  tegelijk gebruiken. Of de AH-app op de telefoon daar last van heeft, is niet bekend. Kassabonnen werkten begin 2026
  een tijd niet (verhuisd naar GraphQL). **Niet aanbevolen**, hooguit later en alleen als het echt iets toevoegt.
- **Picnic vraagt e-mail, wachtwoord en een sms- of e-mailcode (tweestapsverificatie).** Daarna is er een sessie-token
  dat bij elk antwoord kan wisselen. Het wachtwoord hoeft niet bewaard te worden, alleen het token. Alternatief zonder
  wachtwoord: het token (`x-picnic-auth`) uit een bestaande app-sessie overnemen. Volgens één bron vragen de
  mandje-aanroepen sinds augustus 2026 extra headers; niet zeker of dat nog werkt.
- **Vanuit de browser kan het niet.** De app draait op GitHub Pages; de AH- en Picnic-servers staan dat niet toe
  (CORS) en tokens horen niet op de telefoon. Alle aanroepen gaan via een **Supabase Edge Function**.
- **Tokenduur niet vastzetten.** Bronnen spreken elkaar tegen (7 dagen tegenover `expires_in` = 7199 seconden).
  Gebruik altijd het veld uit het antwoord en vernieuw op tijd.

## Opzet: nieuwe app Boodschappen (`/groceries/`)
Een eigen app, omdat het lijstje los van gerechten ook nuttig is (wc-papier, melk). Gerechten levert ingrediënten aan.

### 1. De lijst (geen koppeling nodig)
- **Eén gedeelde lijst per gezin**, live bijgewerkt (Supabase Realtime), afvinken in de winkel.
- **Vaste boodschappen met een ritme**: "melk, elke week", "wc-papier, om de 2 weken". Het ritme werkt zoals bij
  Egg-sellent: wat aan de beurt is komt vanzelf op de lijst. De app leert van het afvinken: koop je iets steeds eerder
  of later, dan stelt de app een ander ritme voor (niet stilletjes aanpassen).
- **Weekmenu**: kies gerechten voor de week (en voor hoeveel personen). De ingrediënten komen op de lijst, opgeteld
  ("2 uien" + "1 ui" = 3 uien) en omgerekend naar het aantal personen. "Zout en peper" en wat je in huis hebt
  (voorraadkast, zelf aan te vinken) slaat de app over.
- **Per afdeling gesorteerd** (groente, zuivel, brood, …), zodat je in één ronde door de winkel loopt. De afdeling
  komt van het gekoppelde AH-product of, zonder koppeling, van een eenvoudige woordenlijst.
- De app opent op wat nu telt (zie geheugen "open most relevant"): de lijst als er iets op staat, anders het weekmenu.

### 2. Producten, prijzen en alternatieven (AH zonder inloggen)
- Een item ("halfvolle melk") krijgt één keer een **gekozen product** (bijv. AH Halfvolle melk 1,5 l). De keuze
  onthoudt de app per gezin, zodat de lijst volgende week direct klopt.
- Per product: prijs, prijs per kilo of liter, **bonus deze week**, Nutri-Score.
- **Goedkoper**: bij elk item toont de app, als die er is, één suggestie: hetzelfde soort product met een lagere prijs
  per kilo of liter (vaak het huismerk), of iets wat deze week in de bonus is. Eén tik = wisselen.
- **Gezonder**: hetzelfde voor een betere Nutri-Score (bijv. volkoren in plaats van wit). Bij een gerecht toont de app
  de bestaande gezondheidsscore en tip.
- **Totaal**: geschatte kosten van de lijst en wat de bonus scheelt.
- Zoeken en prijzen gaan via de Edge Function `groceries-products` met een **cache** in de database (prijzen per dag,
  bonus per bonusweek), zodat een weeklijst AH niet per item opnieuw aanroept. Mislukt AH, dan werkt de lijst gewoon
  door, alleen zonder prijzen.

### 3. Picnic (met inloggen, optioneel)
Alleen als het gezin bij Picnic bestelt.
- **Instellen** (per gezin, beheerder): e-mail en wachtwoord gaan één keer via de Edge Function naar Picnic, daarna de
  sms-code. Bewaard wordt **alleen het token**, nooit het wachtwoord. Werkt het token niet meer, dan vraagt de app
  opnieuw in te loggen.
- **Lijst → mandje**: met één tik gaan de artikelen met een Picnic-product naar het Picnic-mandje. Bestellen en het
  bezorgmoment kiezen doe je zelf in de Picnic-app (geen betalingen vanuit Thuis).
- **Eerdere bezorgingen** helpen het ritme te leren (wat bestel je elke week?).
- Prijzen en alternatieven werken dan ook met Picnic-producten.

### 4. Vergelijken: waar bestel je deze week het best?
Eén lijst voor het gezin; de app haalt **tegelijk** de prijzen bij alle gekoppelde winkels op en geeft een advies.

**Artikelen per winkel koppelen** (één keer per item, daarna onthouden in `grocery_choices`):
1. **Merkartikelen**: hetzelfde product bij beide winkels herkennen aan de streepjescode (EAN/GTIN), als de winkels
   die meegeven (nog te controleren voor AH en Picnic); anders aan merk + naam + inhoud.
2. **Huismerk, vers en los**: geen streepjescode die overeenkomt. Hier telt "vergelijkbaar": zelfde soort, zelfde
   inhoud of eenheid (bijv. "halfvolle melk 1 l" bij AH tegenover Picnic). Een voorstel komt van de app
   (zoeken op naam, eenheidsprijs) of van de Assistent (geplande routine, zoals bij gerechten verrijken); het gezin
   bevestigt met één tik. Wie liever een vast merk wil, zet bij het item "alleen dit merk".
3. Geen goede match bij een winkel? Dan staat het item daar als "niet te krijgen" en telt het mee in het advies.

**Rekenen per week** (alleen met prijzen van deze week, bonus inbegrepen):
- Per winkel: **totaal voor de hele lijst**, met de hoeveelheden omgerekend naar de verpakkingen die je moet kopen
  (2 × 500 g of 1 × 1 kg, wat het goedkoopst is), plus bezorgkosten en het minimale bestelbedrag van die winkel.
- **Splitsen**: wat het oplevert om bijvoorbeeld de bonusartikelen bij AH te halen en de rest bij Picnic. De app stelt
  dat alleen voor als het genoeg scheelt (drempel instelbaar, bijv. € 5), want twee keer bestellen of halen kost tijd.
- **Advies op één scherm**: "Deze week: Picnic, € 87,40 (AH € 93,10)". Met per item waar het verschil zit en wat
  ontbreekt. Gezonder blijft een aparte keuze: het advies ruilt nooit stilletjes voor een ongezonder product.
- Bezorgkosten en minimumbedrag wisselen per moment en per winkel: eerst als instelling per gezin, later (als de
  koppeling het geeft) uit de bezorgmomenten van de winkel.
- **Daarna**: lijst naar het Picnic-mandje (stap 3), of de lijst per winkel en per afdeling voor in de winkel.

Het rekenen gebeurt in de Edge Function op de prijzen uit de cache (`grocery_products`). De uitkomst per week
bewaart de app (`grocery_weeks`), zodat je later ziet wat het advies je heeft opgeleverd.

### 5. Albert Heijn met inloggen (niet aanbevolen)
Kassabonnen (wat je echt kocht) en de AH-boodschappenlijst vullen. Alleen als 1–4 goed werken en het gezin het
echt mist; de nadelen staan hierboven. Voor het vergelijken is het niet nodig: AH-prijzen en bonus zijn er ook zonder
inloggen.

### Database (idempotent in `supabase/schema.sql`)
- `grocery_items` — de lijst: `team_id`, `name`, `qty`, `unit`, `product_id` (gekoppeld product), `source`
  (`manual`, `staple`, `recipe`), `recipe_id`, `checked_at`, `checked_by`. RLS via `has_app(team_id, 'groceries')`.
- `grocery_staples` — vaste boodschappen: `team_id`, `name`, `every_days`, `last_bought_on`, `product_id`.
- `grocery_menu` — weekmenu: `team_id`, `week`, `recipe_id`, `servings`.
- `grocery_choices` — gekoppeld product per item, **per winkel**, per gezin (`team_id`, `name`, `store` →
  `product_id`, `confirmed`, `brand_only`). Zo heeft "halfvolle melk" een AH- én een Picnic-product.
- `grocery_weeks` — advies per week: `team_id`, `week`, totaal per winkel, gekozen winkel of splitsing, besparing.
- `grocery_settings` — per gezin: bezorgkosten en minimumbedrag per winkel, drempel voor splitsen.
- `grocery_products` — cache van productgegevens (`store`, `product_id`, naam, prijs, eenheidsprijs, bonus en
  bonusperiode, Nutri-Score, afdeling, `fetched_at`). Geen gezinsgegevens; alleen te schrijven door de Edge Function.
- Picnic-koppeling: een nieuwe `type` `picnic` in `integrations` (naast `ical` en `apple_health`; `user_id` =
  eigenaar, `label`, `config`, `status`, `last_error`) en het token in `integration_secrets.secret` (alleen service
  role, nooit via REST leesbaar), zoals in [plan-integraties.md](plan-integraties.md). Het token wordt na **elke**
  aanroep teruggeschreven. Elk gezin zijn eigen token; nooit één token voor meerdere gezinnen. Aan/uit voor iedereen
  via `platform_integrations` (`type` = `picnic`). Namen kunnen nog licht verschuiven: volg `supabase/schema.sql`.
  Let op bij het toevoegen van `picnic`: de constraint `integrations_type_check` en de functies
  `platform_set_integration` en `platform_integration_stats` hebben een vaste lijst types; die moeten alle drie mee.

### Edge Functions
- `groceries-products` — zoeken, productgegevens en alternatieven bij AH (anoniem token, gedeeld en vernieuwd op de
  server) en, als ingesteld, bij Picnic. Beperkt per gezin (bijv. maximaal zoveel aanroepen per minuut).
- Picnic: inloggen (wachtwoord + code), mandje vullen, eerdere bezorgingen ophalen. Bij voorkeur als type `picnic` in
  de bestaande Edge Function `integrations` (die draait al elke 30 minuten en heeft "Nu bijwerken"), zodat het
  token-beheer op één plek zit; alleen het mandje vullen is een losse actie die de app aanroept.

### Hoofdbeheer
- Boodschappen is een gewone app in `platform_apps`. Picnic komt als integratie in `platform_integrations`, zodat de
  hoofdbeheerder het voor iedereen kan uitzetten als Picnic de koppeling breekt.
- Geen inzage in lijsten; alleen aantallen.

## Versies
| Stap | Wat | Afhankelijk van |
|---|---|---|
| **A** | App Boodschappen: gedeelde lijst, vaste boodschappen met ritme, weekmenu uit Gerechten, sortering per afdeling | niets |
| **B** | AH-producten: prijs, bonus, Nutri-Score, goedkoper en gezonder alternatief, totaal | AH anoniem (onofficieel) |
| **C** | Picnic: inloggen, Picnic-prijzen, lijst → mandje, ritme leren van bezorgingen | integratiefundament (3.16) |
| **D** | Vergelijken: artikelen per winkel koppelen, totaal per winkel, splitsen, advies per week | B en C |
| later | AH met inloggen (kassabonnen, AH-lijst) | alleen als het echt nodig is |

Picnic-prijzen zijn er alleen met inloggen. Vergelijken met Picnic kan dus pas na stap C; tot die tijd toont de app
alleen AH-prijzen.

Elke stap: release note, kennisbankartikel (o.a. "Boodschappen en het ritme", "Picnic koppelen"), tests (ritme,
optellen van ingrediënten en eenheden, omrekenen naar personen, cache, wat er gebeurt als AH of Picnic niet
antwoordt), schermen op 320 px breed, productiestappen in `supabase/README.md`.

## Besloten (22 nov 2026)
- Meerdere winkels samenvoegen tot één lijst en per week bepalen waar de beste deal is (stap D).
- **Winkels: Albert Heijn en Picnic.** Andere winkels niet.
- **AH: in de winkel én bezorgen.** Het advies rekent beide uit: AH-winkel (geen bezorgkosten) en AH-bezorgen
  (bezorgkosten en minimumbedrag), naast Picnic.
- **Splitsen mag vanaf € 5 verschil** (drempel per gezin aan te passen).
- **Standaard het goedkoopste vergelijkbare product** (vaak huismerk), behalve bij artikelen met "alleen dit merk".

## Open vragen
1. **Onofficiële koppelingen**: oké dat prijzen of het mandje soms een tijd niet werken tot het hersteld is?
2. **Weekmenu**: plannen jullie gerechten vooruit (per week), of beslis je per dag?
3. **Gezonder**: is de Nutri-Score genoeg, of ook letten op bijvoorbeeld suiker en zout per product?
4. **Streepjescodes**: geven AH en Picnic de EAN/GTIN mee? **AH: nee** (23 nov 2026): de zoekresultaten hebben geen
   EAN en de oude detail-aanroep (`/product/detail/v4/fir/{id}`) geeft 404. Wel kan AH een streepjescode omzetten naar
   een product (`/mobile-services/product/search/v1/gtin/{code}`). Voor stap D dus: de EAN van Picnic opzoeken bij
   AH, of matchen op merk + naam + inhoud. Picnic: nog uitzoeken bij stap C.

Bronnen: [albert-heijn-mcp (olekpuchka)](https://github.com/olekpuchka/albert-heijn-mcp),
[AH-app API-notities (gist)](https://gist.github.com/jabbink/8bfa44bdfc535d696b340c46d228fdd1),
[openclaw-skill-albert-heijn](https://github.com/markooms/openclaw-skill-albert-heijn),
[python-picnic-api (fork)](https://github.com/codesalatdev/python-picnic-api),
[picnic-api (Node)](https://github.com/MRVDH/picnic-api),
[PhPicnicAPI](https://github.com/django23/PhPicnicAPI/blob/main/README.md),
[picape: Picnic zonder inloggen met wachtwoord](https://github.com/adri/picape/pull/452).
