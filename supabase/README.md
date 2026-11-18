# Eggselent koppelen aan Supabase

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
eigen opslag). Daarom logt Eggselent in met een **6-cijferige code** die je in de app typt.
Supabase stuurt standaard alleen een link, dus de mailteksten moeten aangepast worden.
**Dat kan pas nadat stap 4 (eigen mailserver) is ingesteld.** Tot die tijd werkt de link uit
de standaardmail ook: tikken op de link logt in. Op de iPhone opent die link wel in Safari en
niet in de app op het beginscherm, dus voor dagelijks gebruik is de code nodig.

1. **Authentication → Emails → Templates**.
2. Pas **Magic Link** én **Confirm signup** allebei zo aan:
   - Onderwerp: `Je inlogcode voor Eggselent`
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
Vereist Docker.

```bash
npx supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime,storage-api,postgres-meta,supavisor
docker exec -i supabase_db_lynn-eggselent psql -U postgres -d postgres < supabase/schema.sql
python3 -m http.server 8765
```

- Mails (met de inlogcode) zie je op http://127.0.0.1:54324.
- Koppel een browsertabblad aan de lokale Supabase zonder `config.js` te wijzigen: in de
  console `localStorage.setItem('eggselent-config', JSON.stringify({supabaseUrl:'http://127.0.0.1:54321', supabaseKey:'<PUBLISHABLE_KEY uit supabase status>'}))` en herladen.
- Twee telefoons nabootsen: `http://127.0.0.1:8765` en `http://telefoon-b.localhost:8765` hebben
  elk hun eigen opslag.
- Stoppen: `npx supabase stop`.
