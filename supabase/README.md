# Egg-sellent koppelen aan Supabase

Hiermee krijgt de app inloggen (met een code per mail), teams en synchronisatie tussen
telefoons. Zonder deze stappen werkt de app gewoon lokaal op één telefoon.

Reken op ±30 minuten.

---

## 1. Project aanmaken
1. Maak een account op [supabase.com](https://supabase.com) en klik **New project**.
2. Kies als regio **Central EU (Frankfurt)**. De gegevens (adressen van klanten) blijven dan
   in de EU.
3. Bewaar het databasewachtwoord in je wachtwoordmanager. De app heeft het niet nodig.

## 2. Database inrichten
1. Ga naar **SQL Editor** → **New query**.
2. Plak de hele inhoud van [`schema.sql`](schema.sql) en klik **Run**.
   Het script kan veilig opnieuw worden uitgevoerd, bijvoorbeeld na een update.

Dit maakt de tabellen, de regels die ervoor zorgen dat elk team **alleen zijn eigen gegevens**
ziet, en de functies voor team aanmaken, uitnodigen en lid worden.

## 3. Inloggen met een code (belangrijk voor de iPhone)
Een inloglink in een mail opent in Safari, niet in de app op je beginscherm (die heeft een
eigen opslag). Daarom logt Egg-sellent in met een **6-cijferige code** die je in de app typt.
Supabase stuurt standaard alleen een link, dus de mailteksten moeten aangepast worden.
**Dat kan pas nadat stap 4 (eigen mailserver) is ingesteld.** Tot die tijd werkt de link uit
de standaardmail ook: tikken op de link logt in. Op de iPhone opent die link wel in Safari en
niet in de app op het beginscherm, dus voor dagelijks gebruik is de code nodig.

1. **Authentication → Emails → Templates**.
2. Pas **Magic Link** én **Confirm signup** allebei zo aan:
   - Onderwerp: `Je inlogcode voor Egg-sellent`
   - Inhoud: de inhoud van [`templates/code.html`](templates/code.html). Het belangrijkste is
     `{{ .Token }}`; dat wordt de code.
3. **Authentication → Sign In / Providers → Email**: laat *Email* aan staan.
   Stel bij *Email OTP Length* **6** in (of laat de standaard staan; de app accepteert 6–10 cijfers).

## 4. Eigen mailserver (nodig voordat anderen zich aanmelden)
De ingebouwde mailserver van Supabase is alleen om te testen: hij verstuurt een paar mails per
uur, en alleen naar e-mailadressen van leden van je Supabase-organisatie. Voor echte
gebruikers:

1. **Authentication → Emails → SMTP Settings → Enable custom SMTP**.
2. Vul de gegevens van je mailserver in (je eigen domein, of een dienst als Resend, Postmark of
   Brevo; bij dit volume meestal gratis). Afzender bijvoorbeeld `noreply@jouwdomein.nl`.
3. **Authentication → Rate Limits**: zet "emails per hour" op bijvoorbeeld 30.

Zet ook **Authentication → URL Configuration**: *Site URL* = het adres van de app
(bijv. `https://ijzeren.github.io/egg-sellect-route/`) en voeg dat adres met `**` erachter toe
bij *Redirect URLs*. Anders stuurt de inloglink naar de verkeerde plek.

## 5. App koppelen
1. **Project Settings → API Keys** (of de knop **Connect**): kopieer
   - de **Project URL** (`https://xxxx.supabase.co`)
   - de **publishable key** (`sb_publishable_…`) of, bij oudere projecten, de **anon key**.
2. Zet die in [`../config.js`](../config.js).
   **Nooit** de *secret* / *service_role* key gebruiken: die geeft volledige toegang.
3. Verhoog in [`../sw.js`](../sw.js) het versienummer (`VERSION`), zodat telefoons de nieuwe
   versie ophalen.

## 6. Online zetten
Upload naar je https-adres (bijv. `https://eieren.jouwdomein.nl/`):

```
index.html  sw.js  manifest.webmanifest  config.js  icon-180.png  icon-192.png  icon-512.png
```

De mappen `supabase/`, `tools/` en `docs/` zijn niet nodig op de server.

**Gebruik hetzelfde adres als het prototype**, als dat al op iemands telefoon staat. Dan blijven
de gegevens van het prototype staan en gaan ze bij "Nieuw eierbedrijf" mee naar het team.

## 7. Eerste keer gebruiken
1. **Beheerder** (bijv. Lynn): open de app → e-mailadres → code uit de mail →
   **Nieuw eierbedrijf**. Alles wat al op de telefoon stond, gaat mee naar het team.
2. **Instellingen → Team → Uitnodigingscode maken → Code delen** (bijv. via WhatsApp).
3. **Bezorger**: zet de app op het beginscherm → inloggen → **Ik heb een uitnodigingscode**.

Een bezorger kan rondes lopen, adressen beheren, afwezigheid melden en bestellingen invullen.
Alleen de beheerder kan loopdagen, afronding en de tekst bij afwezigheid wijzigen, en leden
uitnodigen of verwijderen.

## 8. Inloggen met passkeys (Face ID)
1. **Authentication → Passkeys**: zet aan.
2. Relying party: *ID* `ijzeren.github.io`, *naam* `Egg-sellent`, *origin* `https://ijzeren.github.io`.
3. In de app: eerst één keer inloggen met een code; de app vraagt daarna "Voortaan inloggen met
   Face ID?". Later ook via Instellingen → Passkeys.

Een passkey hoort bij het adres van de app. Verhuist de app naar een eigen domein, dan moet
iedereen opnieuw een passkey aanmaken.

## 9. Meldingen
1. **Databasetabellen**: zitten in [`schema.sql`](schema.sql) (opnieuw uitvoeren is veilig).
2. **Functie uitrollen** (eenmalig `npx supabase login`):
   ```bash
   npx supabase functions deploy push --project-ref istqegonfkfrkyddfajd --no-verify-jwt
   npx supabase secrets set --env-file supabase/functions/.env --project-ref istqegonfkfrkyddfajd
   ```
   `supabase/functions/.env` bevat het VAPID-sleutelpaar (staat niet in git). De publieke sleutel
   staat ook in [`../config.js`](../config.js). Nieuw paar maken: `npx web-push generate-vapid-keys`;
   dan moeten alle telefoons de meldingen opnieuw aanzetten.
3. **Tijdschema**: voer [`cron.sql`](cron.sql) uit in de SQL Editor (elke 15 minuten).
4. In de app (vanaf het beginscherm): Instellingen → Meldingen → *Zet meldingen aan*, en
   *Stuur testmelding*.

Wat er gestuurd wordt:
- **Ochtend van een loopdag**: aantal adressen en eieren. De getallen komen uit een samenvatting
  die de app na elke synchronisatie bijwerkt (`team_digest`).
- **Bestellen**: op de gekozen dag om 18:00, met het advies voor volgende week.
- **Teamberichten**: als iemand een dag afwezig meldt.

---

## Goed om te weten
- **Gratis plan**: een project dat 7 dagen niet gebruikt wordt, wordt gepauzeerd (opnieuw
  aanzetten in het dashboard). De telefoons blijven dan gewoon werken en versturen hun
  wijzigingen zodra het project weer draait. Het Pro-plan (±$25/mnd) pauzeert niet en maakt
  dagelijkse backups.
- **Backup**: het gratis plan maakt geen automatische backups. Maak af en toe een backup via
  Instellingen in de app, of via **Database → Backups** (Pro).
- **Offline**: alles wordt eerst op de telefoon opgeslagen. Het bolletje rechtsboven toont de
  status: ✓ bijgewerkt · ⟳ 3 (wacht op versturen) · offline · ⚠️ (tik om opnieuw te proberen).
- **Conflict**: vullen twee mensen hetzelfde huis op dezelfde dag in, dan wint de laatste
  wijziging.

## Lokaal ontwikkelen
Vereist Docker. Draait de app op `localhost` of `127.0.0.1`, dan gebruikt hij automatisch de
lokale Supabase (zie `local` in [`../config.js`](../config.js)):

- **Er wordt geen mail verstuurd.** De inlogcode is altijd **123456**. Op het inlogscherm staat
  dan een blauwe melding "Lokaal testen".
- Achter de schermen maakt de app bij de eerste keer een lokaal account aan; daarna log je met
  hetzelfde adres en 123456 weer in.
- De vaste code werkt alleen als de app met een lokale Supabase praat (`http://127.0.0.1` of
  `http://localhost`), nooit met de online database.
- Het schema wordt bij het starten automatisch geladen
  (`migrations/…_eggselent_schema.sql` verwijst naar [`schema.sql`](schema.sql)).

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor
python3 -m http.server 8765
```

Open daarna http://localhost:8765.

- Alles wissen en opnieuw beginnen: `npx supabase db reset`.
- Stoppen: `npx supabase stop`.
- Passkeys lokaal: alleen via `http://localhost:8765` (niet via 127.0.0.1; passkeys werken niet
  op een IP-adres).
- De meldingenfunctie draait lokaal mee; sleutels uit `supabase/functions/.env`.
- Twee telefoons nabootsen: `http://127.0.0.1:8765` en `http://telefoon-b.localhost:8765` hebben
  elk hun eigen opslag.
- Zonder Supabase testen (alleen op deze telefoon): in de console
  `localStorage.setItem('eggselent-config', JSON.stringify({supabaseUrl:''}))` en herladen.

### Productiegegevens lokaal gebruiken
Echte adressen en echte historie lokaal, om mee te testen:

```bash
node scripts/prod-naar-lokaal.mjs
```

- Leest productie **alleen-lezen** via de Supabase CLI (je eigen `npx supabase login`; geen
  databasewachtwoord of geheime sleutel). Productie wordt nooit gewijzigd.
- Zet teams, adressen, bezoeken (ook verwijderde), afwezigheid, bestellingen en voorraad in de
  lokale database. Een eerdere kopie van dezelfde teams wordt eerst weggehaald; andere lokale
  teams blijven staan. Opnieuw draaien geeft een verse kopie.
- Teamleden worden op e-mailadres gekoppeld aan dezelfde lokale gebruiker. Bestaat die lokaal nog
  niet: log lokaal één keer in met dat adres (code 123456) en draai het script opnieuw. Of geef een
  lokaal adres mee dat beheerder wordt: `node scripts/prod-naar-lokaal.mjs jij@voorbeeld.nl`.
- Daarna in de app: Instellingen → Team → Jouw teams → kies het team.
- Niet gekopieerd: accounts, uitnodigingen en meldingen.
- De kopie bevat echte namen, adressen en e-mailadressen; ze staat alleen in de lokale database.
  `npx supabase db reset` wist alles weer.

---

## Van Egg-sellent 2.8 naar de familie-app 3.5 in één keer
Alle stappen hieronder samen, in deze volgorde, **vóór** de push naar `main` (een push gaat direct naar alle telefoons):
1. **SQL Editor**: voer [`schema.sql`](schema.sql) één keer uit (het bevat alles t/m v3.5).
2. **SQL Editor**: voer [`migrate-family-dongstra.sql`](migrate-family-dongstra.sql) één keer uit; controleer de laatste regel
   (Familie Dongstra, member:Lynn, admin:Marien, eggs:walker, eggs + training, 145 adressen, 183 bezoeken).
3. Maak het account voor de Assistent aan (zie v3.2.0, stap 2).
4. **Redirect URLs**: `https://ijzeren.github.io/egg-sellect-route/**` (met `**`).
5. Push naar `main`.
6. Na de push: zet in de app bij **Gezin → Apps** Gerechten en Agenda aan, en per kind bij **Gezin → (kind) → Apps**
   (zie v3.4.0 en v3.5.0). Plan de routine voor de gezondheidsscore (zie v3.4.0, stap 2).

Push je vóór stap 1–2, dan werken synchroniseren van Training en de rechten per app niet op de telefoons.
De losse secties hieronder beschrijven per versie wat er veranderde.

---

## Update naar de familie-app (v3.0.0)
Egg-sellent staat nu onder `/eggs/`, met een hub op de root en de app Training ernaast.
Doe dit **voordat** je de nieuwe versie naar GitHub pusht:

1. **SQL Editor**: voer [`schema.sql`](schema.sql) opnieuw uit. Dat voegt de tabel `training_tracks` toe
   (voortgang van trainingen per gezin); de bestaande tabellen blijven zoals ze zijn.
2. **Authentication → URL Configuration → Redirect URLs**: controleer dat er
   `https://ijzeren.github.io/egg-sellect-route/**` staat (met `**`). De inloglink stuurt nu terug naar
   `…/egg-sellect-route/eggs/`; zonder `**` werkt die link niet meer. (Inloggen met de code werkt pas als de eigen mailserver en het mailsjabloon
   uit stap 3–4 zijn ingesteld; tot dan stuurt Supabase alleen een link.)
3. Optioneel: deploy de push-functie opnieuw (`npx supabase functions deploy push`). Die stuurt dan
   direct naar `eggs/`. Niet verplicht: de app stuurt oude meldingslinks zelf door.

## Update naar gezinnen, rollen en apps (v3.1.0)
Inloggen gebeurt voortaan in het startscherm; gezinnen hebben rollen (beheerder, lid, kind) en apps per gezin.
Doe dit **vóór** je v3.1.0 pusht (na de stappen van v3.0.0 hierboven):

1. **SQL Editor**: voer [`schema.sql`](schema.sql) opnieuw uit. Nieuw: `team_apps`, `team_member_apps`, rechten per
   app. De rol "bezorger" wordt gezinsrol "lid" met de rol bezorger in Egg-sellent. Er gaat niets verloren.
2. **SQL Editor**: voer [`migrate-family-dongstra.sql`](migrate-family-dongstra.sql) uit. Het team "Lynn" heet daarna
   "Familie Dongstra" en Egg-sellent en Training staan aan. De laatste regel toont ter controle de rollen en aantallen.
3. Redirect URLs: de inloglink komt nu terug op het startscherm (`…/egg-sellect-route/`); met `**` (zie v3.0.0) is dat al goed.

Getest op een lokale kopie van productie (22 nov 2026): migratie twee keer achter elkaar, 20 rechtencontroles
(o.a. bezorger kan gezin en eierinstellingen niet wijzigen, app uit = geen toegang tot de gegevens).

## Update naar Hulp: kennisbank, FAQ en vragen (v3.2.0)
Doe dit vóór je v3.2.0 pusht. Push je 3.1.0 en 3.2.0 tegelijk, dan volstaat: `schema.sql` uitvoeren, daarna
`migrate-family-dongstra.sql`, daarna stap 2 hieronder.

1. **SQL Editor**: voer [`schema.sql`](schema.sql) opnieuw uit (nieuw: `platform_roles`, `faq`, `questions`, `answers`
   en de functies voor de Assistent en de hoofdbeheerder; plus 5 eerste veelgestelde vragen).
   Voer daarna [`migrate-family-dongstra.sql`](migrate-family-dongstra.sql) opnieuw uit: Marien wordt hoofdbeheerder
   (FAQ beheren). Controle: `select count(*) from platform_roles;` → 1.
2. **Account voor de Assistent** (de geplande Claude-routine die vragen beantwoordt):
   1. **Authentication → Users → Add user → Create new user**: e-mailadres bijv. `assistent@<jouw domein>`, een sterk
      wachtwoord, *Auto Confirm User* aan. Bewaar het wachtwoord in je wachtwoordmanager.
   2. **SQL Editor**: `insert into platform_roles (user_id, role) select id, 'runner' from auth.users where email = 'assistent@…';`
   3. Dit account kan alleen open vraagteksten lezen en antwoorden plaatsen (geen namen, gezinnen of gegevens).
      Gebruik: `RUNNER_EMAIL=… RUNNER_PASSWORD=… node scripts/runner.mjs list` — zie [`docs/runner.md`](../docs/runner.md).

## Update naar Bio-circuit in Training (v3.3.0)
Geen databasewijziging: Bio-circuit gebruikt dezelfde tabel `training_tracks` (programma `biocircuit`).
De app haalt nu de trainingen van alle programma's in één keer op; oudere telefoons blijven werken.

## Update naar Gerechten (v3.4.0)
Doe dit **vóór** je v3.4.0 pusht:

1. **SQL Editor**: voer [`schema.sql`](schema.sql) opnieuw uit. Nieuw: `recipes`, `recipe_ratings`, en voor de Assistent
   `runner_unscored_recipes()` en `runner_score_recipe()`. Gezinsleden kunnen de gezondheidsscore niet zelf zetten
   (geen schrijfrecht op die kolommen); wijzigt een recept, dan maakt de database de score leeg.
   Controle: `select count(*) from recipes;` → 0.
2. **Routine voor de gezondheidsscore**: de instructies staan in [`docs/recipe-scores.md`](../docs/recipe-scores.md).
   Ingesteld (22 nov 2026) als geplande taak "Gezondheidsscore gerechten" in de Claude-app op Mariens Mac, elke ochtend
   rond 07:30. Die gebruikt de Supabase CLI-login van die Mac (`npx supabase login`), geen runner-account. Draait de app
   niet, dan loopt de taak bij de volgende start. Liever in de cloud of los van de Mac? Gebruik dan het runner-account
   (v3.2.0, stap 2) met `RUNNER_EMAIL`/`RUNNER_PASSWORD`; het script kiest dat vanzelf.
3. Na de push: een beheerder zet **Gerechten** aan bij Gezin → Apps. Kinderen per kind.

Getest op de lokale database (22 nov 2026): schema twee keer achter elkaar; lid kan score niet zetten (ook niet bij
invoegen); ander lid kan andermans recept niet wijzigen, beheerder wel; sterren alleen op eigen naam; runner-functies
alleen voor de runner; score op een verouderde versie wordt geweigerd; recept wijzigen wist de score.

## Update naar Agenda (v3.5.0)
Doe dit **vóór** je v3.5.0 pusht:

1. **SQL Editor**: voer [`schema.sql`](schema.sql) opnieuw uit. Nieuw: `agenda_people`, `agenda_items`, `agenda_tasks`
   (alleen voor wie Agenda mag gebruiken in het gezin). Controle: `select count(*) from agenda_people;` → 0.
2. Na de push: een beheerder zet **Agenda** aan bij Gezin → Apps, en voor een kind met eigen account bij
   Gezin → (kind) → Apps. Kinderen zonder account zet je gewoon als persoon in de agenda.

## Update naar Beheer voor de hoofdbeheerder (v3.6.0)
**SQL Editor**: voer [`schema.sql`](schema.sql) opnieuw uit. Nieuw: `platform_apps` (apps voor alle gezinnen aan/uit),
`teams.disabled_at` (gezin uitschakelen) en de functies `platform_*` voor het scherm Beheer. Er verandert niets voor
gezinnen tot de hoofdbeheerder iets uitzet. Getest met `scripts/test-platform.mjs` (22 controles) op de lokale kopie.

## Update naar gerechten verrijken (v3.8.0)
Doe dit **vóór** je v3.8.0 pusht, en vóór de volgende run van de geplande taak "Gezondheidsscore gerechten"
(die vraagt nu naar de nieuwe kolom `status`):

1. **SQL Editor** (of `npx supabase db query --remote -f supabase/schema.sql`): voer [`schema.sql`](schema.sql) opnieuw uit.
   Nieuw op `recipes`: `status` ('import' of 'ready', bestaande gerechten worden 'ready'), `source` en `source_name`
   (de originele upload, tot het verrijken), en de functies `runner_import_recipes()` en `runner_enrich_recipe()`.
   `runner_unscored_recipes()` geeft voortaan alleen gerechten die klaar zijn. Gezinsleden kunnen status en upload niet
   zelf wijzigen. Controle: `select status, count(*) from recipes group by status;` → alleen 'ready'.
2. **Geplande taak "Gerechten verrijken"** (Claude-app op Mariens Mac): werkwijze in
   [`docs/recipe-enrich.md`](../docs/recipe-enrich.md), script `scripts/recipe-enrich.mjs` (CLI-login of runner-account).

Getest op de lokale database (22 nov 2026): schema twee keer; lid kan status en upload niet wijzigen; titel wijzigen
houdt het gerecht op 'import'; import zonder upload is meteen klaar; runner-functies alleen voor de runner; lege stap en
verouderde versie geweigerd; na verrijken upload weg, status klaar en pas dan in de lijst voor de gezondheidsscore.
