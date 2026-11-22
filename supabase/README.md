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

## Update naar de familie-app (v3.0.0)
Egg-sellent staat nu onder `/eggs/`, met een hub op de root en de app Training ernaast.
Doe dit **voordat** je de nieuwe versie naar GitHub pusht:

1. **SQL Editor**: voer [`schema.sql`](schema.sql) opnieuw uit. Dat voegt de tabel `training_tracks` toe
   (voortgang van trainingen per gezin); de bestaande tabellen blijven zoals ze zijn.
2. **Authentication → URL Configuration → Redirect URLs**: controleer dat er
   `https://ijzeren.github.io/egg-sellect-route/**` staat (met `**`). De inloglink stuurt nu terug naar
   `…/egg-sellect-route/eggs/`; zonder `**` werkt die link niet meer. (Inloggen met de code werkt altijd.)
3. Optioneel: deploy de push-functie opnieuw (`npx supabase functions deploy push`). Die stuurt dan
   direct naar `eggs/`. Niet verplicht: de app stuurt oude meldingslinks zelf door.
