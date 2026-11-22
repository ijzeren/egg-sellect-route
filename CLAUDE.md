# Familie-app — werkafspraken

Eén PWA voor gezinnen: een hub op `/` met apps eronder (`/eggs/` Egg-sellent, `/training/` Training, `/recipes/` Gerechten,
`/agenda/` Agenda).
Geen build: GitHub Pages publiceert `main` zoals het is (elke push naar `main` gaat direct naar alle telefoons).
Backend: Supabase (zie `supabase/`). Overzicht van bestanden: `README.md`.

## Taal en namen
- Schermteksten, release notes en kennisbank: **Nederlands**, korte zinnen, mobiel eerst.
- Paden, mappen, bestandsnamen, opslagsleutels en app-id's: **altijd Engels** (`eggs`, `training`, `shared/theme.css`).

## Elke wijziging
1. **Versie ophogen** (semantisch, één versie voor de hele familie-app):
   - major `x.0.0`: grote omslag of iets wat gebruikers opnieuw moeten doen
   - minor `3.x.0`: nieuwe functie of nieuwe app
   - patch `3.1.x`: foutoplossing of kleine verbetering
   Op drie plekken gelijk: `shared/releases.js` (bovenste release), `sw.js` (`VERSION`), `eggs/index.html` (`APP_VERSION`).
2. **Release notes** bovenaan `shared/releases.js`: per app, in gewone taal voor gebruikers. De hub toont ze bij "Wat is nieuw".
3. **Ingewikkelde functie** (meerdere stappen, rollen/rechten, iets wat uitleg nodig heeft): ook een **kennisbankartikel**
   in `shared/kb.js` en verwijs ernaar vanuit de release note (`kb: 'slug'`).
4. Nieuw bestand? Zet het in `ASSETS` in `sw.js` (anders werkt het niet offline).
5. `npm test` moet slagen (controleert o.a. versies, release notes, kennisbankverwijzingen, Pilates-inhoud, planning).
6. Databasewijziging: in `supabase/schema.sql`, **idempotent** (veilig om opnieuw te draaien op productie, geen gegevens
   kwijt). Eenmalige datamigraties in een apart bestand in `supabase/`. Test tegen een lokale kopie van productie
   (`scripts/prod-naar-lokaal.mjs`) en zet in `supabase/README.md` wat er in productie moet gebeuren vóór de push.

## Gezin, rollen en apps
- Gezin = `teams` in de database. Gezinsrollen: `admin` (beheerder), `member` (lid), `child` (kind).
- Apps per gezin aan/uit (`team_apps`); per lid toegang en app-rol (`team_member_apps`). Rechten zitten in de
  database (RLS met `has_app(team, app)` / `app_role(team, app)`), de app toont alleen wat mag.
- **Algemene instellingen** (account, passkeys, gezin, leden, weergave) staan in de hub. **App-specifieke** instellingen
  blijven in de app.
- Inloggen gebeurt alleen in de hub (`shared/family.js`); apps sturen naar `../?login` als er geen sessie is.

## Hoofdbeheer (alles buiten de gezinnen)
- Rol `admin` in `platform_roles` (nu alleen de eigenaar van de app). Scherm Beheer in de hub.
- Mag alleen aan/uit en verwijderen: apps voor alle gezinnen (`platform_apps`), gezinnen uitschakelen (`teams.disabled_at`)
  of verwijderen, rollen hoofdbeheerder/Assistent. **Geen inzage in gezinnen**: functies `platform_*` geven alleen
  naam, aantallen en apps; nooit leden, e-mailadressen van leden of gegevens. Houd dat zo bij uitbreidingen.
- Een uitgeschakeld gezin of een platformbreed uitgezette app werkt via `is_member` / `has_app`; nieuwe apps krijgen dat
  vanzelf als ze RLS met `has_app` gebruiken.

## Hulp
- Kennisbank: `shared/kb.js` (artikelen in gewone taal; ook de bron voor de Assistent).
- FAQ, vragen en antwoorden: tabellen `faq`, `questions`, `answers`. Vragen blijven binnen het gezin; de hoofdbeheerder
  (`platform_roles` = admin) ziet alleen goedgekeurde antwoorden en publiceert die (geanonimiseerd) in de FAQ.
- De Assistent: geplande Claude-routine, werkwijze in `docs/runner.md`, script `scripts/runner.mjs`.

## Nieuwe app toevoegen
1. Map met Engelse naam, eigen `index.html` die `../shared/theme.css`, `../shared/ui.css` en `../config.js` laadt.
2. Item in `shared/apps.js` (id, naam, route, icoon, `about`, eventueel `roles`, `status()` voor de tegel).
3. Gegevens in Supabase met `team_id` en RLS via `has_app(team_id, '<id>')`.
4. Bestanden in `sw.js`, release note, kennisbankartikel.
