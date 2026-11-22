# Familie-app
De apps van het gezin onder één icoon: een startscherm (hub) met daaronder losse apps.

**App:** https://ijzeren.github.io/egg-sellect-route/

| Pad | App |
|---|---|
| `/` | Hub: tegels per app met een korte stand van zaken |
| `/eggs/` | **Egg-sellent** — *Vers aan de deur, slim gepland.* Eierronde, afspraken en besteladvies |
| `/training/` | **Training** — Pilates 30: 30 lessen op je vaste trainingsdagen, samen of apart, met bonuslessen |

Een gezin (in de database een *team*) heeft meerdere gebruikers met een rol (beheerder, lid, kind); aansluiten gaat
met een code. Per gezin staan apps aan of uit, per lid regel je toegang en rol in een app. Inloggen, gezin, leden,
apps en weergave regel je in de hub; app-specifieke instellingen in de app. Werkafspraken: [CLAUDE.md](CLAUDE.md).

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
| `eggs/index.html` | Egg-sellent (schermen, logica, opslag, synchronisatie) |
| `training/` | Training: `app.js` (schermen, speler, sync), `program.js` (planning, testbaar), `sports/pilates/` (oefeningen en lessen) |
| `sw.js` | offline werken en updates voor alles; **verhoog `VERSION` bij elke wijziging** en zet nieuwe bestanden in `ASSETS` |
| `config.js` | koppeling met Supabase (leeg = alleen op deze telefoon) |
| `manifest.webmanifest`, `icon-*.png` | naam en icoon op het beginscherm |
| `supabase/` | databaseschema, mailtekst met inlogcode en [installatiehandleiding](supabase/README.md) |
| `tests/` | `npm test`: versies en release notes, Pilates-inhoud (elke les precies 30 min) en planning |
| `PLAN.md` | plan van Egg-sellent (schermafbeeldingen in `docs/design/`) |

## Training: trainingsdagen en bonus
Je kiest één keer op welke dagen je traint (bijv. ma/wo/vr). De lessen worden daarover ingepland; een gemiste
dag schuift de rest op. Op een andere dag kun je altijd een les doen: dat is een **bonustraining** en je loopt
dan voor op schema. Binnen een gezin kun je samen een training volgen (iedereen dezelfde voortgang) of ieder
een eigen training hebben, ook naast elkaar.
