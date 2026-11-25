# Thuis
De huis-gezinsapp (voorheen "familie-app"). De apps van het gezin onder één icoon: een startscherm (hub) met daaronder losse apps.

**App:** https://ijzeren.github.io/egg-sellect-route/

| Pad | App |
|---|---|
| `/` | Hub: tegels per app met een korte stand van zaken |
| `/eggs/` | **Egg-sellent** — *Vers aan de deur, slim gepland.* Eierronde, afspraken en besteladvies |
| `/training/` | **Training** — Pilates 30 (30 lessen) en Bio-circuit (30 min op de toestellen, gewicht per toestel), op je vaste trainingsdagen, samen of apart |
| `/recipes/` | **Gerechten** — recepten van het gezin met bereidingsschema, sterren per lid en een gezondheidsscore |
| `/agenda/` | **Agenda** — schoolrooster, trainingen, wedstrijden en huiswerk van de kinderen |
| `/finance/` | **Financiën** — bij- en afschrijvingen van de eigen bankrekeningen (export uit de bank), ingedeeld per soort; privé per rekening |
| `/rentals/` | **Verhuur** — vakantiehuis: boekingen, eigen gebruik en de aangifte van de toeristenbelasting |

Een gezin (in de database een *team*) heeft meerdere gebruikers met een rol (beheerder, lid, kind); aansluiten gaat
met een code. Per gezin staan apps aan of uit, per lid regel je toegang en rol in een app. Inloggen, gezin, leden,
apps en weergave regel je in de hub; app-specifieke instellingen in de app. Werkafspraken: [CLAUDE.md](CLAUDE.md).

**Hulp** (in de hub): kennisbank, veelgestelde vragen (voor alle gezinnen), vragen stellen binnen je gezin
(iedereen kan antwoorden, en de Assistent), en "Wat is nieuw". De hoofdbeheerder neemt goedgekeurde antwoorden op in de FAQ.

**Beheer** (alleen hoofdbeheerder): apps voor alle gezinnen aan/uit, gezinnen uitschakelen of verwijderen, hoofdbeheerders
en de Assistent aanwijzen. Zonder inzage in de gegevens van gezinnen.

## Op de iPhone zetten
1. Open de link hierboven in **Safari**.
2. Deel-knop → **Zet op beginscherm**.
3. Gebruik daarna alleen het icoon op het beginscherm (die heeft een eigen opslag, los van Safari).

Eén icoon voor alle apps: zo delen ze login en opslag. Bestaande Egg-sellent-icoontjes blijven werken en
openen nu de hub. Updates komen vanzelf binnen.

## Bestanden
Geen build: GitHub Pages publiceert de bestanden zoals ze zijn. Paden en bestandsnamen altijd in het
Engels, schermteksten in het Nederlands.

| | |
|---|---|
| `index.html` | hub (pagina); stuurt oude meldingslinks (`?v=…`) door naar `eggs/`, handelt inloglinks zelf af |
| `shared/theme.css`, `shared/ui.css` | gedeeld thema (licht/donker) en bouwstenen |
| `shared/family.js` | config, inloggen, gezinnen, passkeys, opslag per app (`family:<app>:<key>`), thema |
| `hub/app.js` | hub: inloggen, gezin (leden, rollen, apps), weergave, wat is nieuw |
| `shared/apps.js` | lijst van apps voor de hub; **een app toevoegen = één item hier + een eigen map** |
| `shared/releases.js` | versies en release notes (getoond bij "Wat is nieuw") |
| `shared/kb.js` | kennisbank: handleidingen (Hulp → Kennisbank); bron voor de Assistent |
| `scripts/runner.mjs`, `docs/runner.md` | de Assistent: geplande Claude-routine die open vragen beantwoordt |
| `eggs/index.html` | Egg-sellent (schermen, logica, opslag, synchronisatie) |
| `training/` | Training: `app.js` (schermen, speler, sync), `program.js` (planning, testbaar), `programs.js` (lijst), `voice.js` (stem tijdens een les), `sports/pilates/` (`guide.js` uitleg, `figures.js` + `rig.js` figuurtjes; bekijken in `tools/figures.html`), `sports/biocircuit/` |
| `recipes/` | Gerechten: `app.js` (schermen, opslaan), `recipe.js` (omrekenen, bereidingsschema, sterren; testbaar) |
| `scripts/recipe-scores.mjs`, `docs/recipe-scores.md` | de Assistent: geplande routine die gerechten een gezondheidsscore geeft |
| `scripts/recipe-enrich.mjs`, `docs/recipe-enrich.md` | de Assistent: geplande routine die geïmporteerde gerechten afmaakt (stappen, tijden) |
| `agenda/` | Agenda: `app.js` (schermen, opslaan), `plan.js` (wat is er wanneer, rooster plakken, huiswerk; testbaar) |
| `finance/` | Financiën: `app.js` (schermen, inlezen, opslaan), `import.js` (Rabobank CSV en CAMT.053 lezen; testbaar), `money.js` (overzicht, regels, vaste lasten; testbaar). Plan: `docs/plan-finance.md` |
| `rentals/` | Verhuur: `app.js` (schermen, opslaan), `tax.js` (nachten, toeristenbelasting, aangifte per maand; testbaar). Plan en vervolg: `docs/plan-rentals.md` |
| `sw.js` | offline werken en updates voor alles; **verhoog `VERSION` bij elke wijziging** en zet nieuwe bestanden in `ASSETS` |
| `config.js` | koppeling met Supabase (leeg = alleen op deze telefoon) |
| `manifest.webmanifest`, `icon-*.png` | naam en icoon op het beginscherm |
| `supabase/` | databaseschema, mailtekst met inlogcode en [installatiehandleiding](supabase/README.md) |
| `tests/` | `npm test`: versies en release notes, Pilates-inhoud en planning, Bio-circuit, gerechten, agenda |
| `PLAN.md` | plan van Egg-sellent (schermafbeeldingen in `docs/design/`) |

## Training: trainingsdagen en bonus
Je kiest één keer op welke dagen je traint (bijv. ma/wo/vr). De lessen worden daarover ingepland; een gemiste
dag schuift de rest op. Op een andere dag kun je altijd een les doen: dat is een **bonustraining** en je loopt
dan voor op schema. Binnen een gezin kun je samen een training volgen (iedereen dezelfde voortgang) of ieder
een eigen training hebben, ook naast elkaar.
