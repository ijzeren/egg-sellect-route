// Release notes van de familie-app: wat gebruikers zien bij "Wat is nieuw" in de hub.
//
// Afspraken (zie ook CLAUDE.md):
// - Elke wijziging die live gaat krijgt een nieuwe versie, bovenaan deze lijst. Semantische versies:
//     major (4.0.0)  grote omslag of iets wat gebruikers opnieuw moeten doen (opnieuw inloggen, nieuwe werkwijze)
//     minor (3.2.0)  nieuwe functie of nieuwe app
//     patch (3.1.1)  foutoplossing of kleine verbetering
// - Dezelfde versie staat in sw.js (VERSION) en eggs/index.html (APP_VERSION); `npm test` controleert dat.
// - Notities in gewone taal voor gebruikers, per app: 'hub' (algemeen), 'eggs', 'training', …
// - Ingewikkelde functie? Schrijf er ook een kennisbankartikel bij (shared/kb.js) en verwijs ernaar met `kb`.
export const RELEASES = [
  {
    version: '3.1.0', date: '2026-11-22', title: 'Gezinnen, rollen en één keer inloggen',
    notes: [
      { app: 'hub', text: 'Inloggen gebeurt nu in het startscherm en geldt voor alle apps.', kb: 'inloggen' },
      { app: 'hub', text: 'Gezinnen: maak een gezin, nodig anderen uit met een code en kies per lid de rol: beheerder, lid of kind.', kb: 'gezin-rollen' },
      { app: 'hub', text: 'Per gezin zet je apps aan of uit, en per lid kun je toegang en rol in een app regelen.', kb: 'apps-aanzetten' },
      { app: 'hub', text: 'Weergave (licht/donker) en passkeys staan nu bij Gezin en gelden voor alle apps.' },
      { app: 'eggs', text: 'Het eierteam is nu het gezin Dongstra. Alle adressen, bezoeken en voorraad zijn meegekomen.' },
      { app: 'eggs', text: 'Beheerder of bezorger stel je per gezinslid in bij Gezin.' },
    ],
  },
  {
    version: '3.0.0', date: '2026-11-22', title: 'De familie-app',
    notes: [
      { app: 'hub', text: 'Nieuw startscherm met een tegel per app en de stand van zaken.' },
      { app: 'eggs', text: 'Egg-sellent staat nu onder het startscherm; alles werkt zoals je gewend bent.' },
      { app: 'training', text: 'Nieuw: Training met Pilates 30. Kies je vaste trainingsdagen; op andere dagen kun je een bonustraining doen.', kb: 'trainingsdagen-bonus' },
      { app: 'training', text: 'Samen trainen of ieder apart, met de voortgang op al je telefoons.', kb: 'samen-trainen' },
    ],
  },
  { version: '2.8.0', date: '2026-11-20', title: 'Stroopwafels', notes: [{ app: 'eggs', text: 'Stroopwafelweken plannen, aankondigen aan de deur, afspraken, verkoop en voorraad per pakje.' }] },
  { version: '2.7.1', date: '2026-11-20', title: 'Besteladvies verbeterd', notes: [{ app: 'eggs', text: 'Advies voor de eerstvolgende levering zonder bestelling; de app vraagt wat er besteld is als de besteldag voorbij is.' }] },
  { version: '2.7.0', date: '2026-11-19', title: 'Reeks wijzigen', notes: [{ app: 'eggs', text: 'Voorkeursdag en frequentie van een adres wijzigen; doosjes van 6 en 10 bijhouden.' }] },
  { version: '2.6.0', date: '2026-11-19', title: 'Eierboekhouding', notes: [{ app: 'eggs', text: 'Voorraad, leveringen en tellingen; besteladvies binnen een marge.' }] },
  { version: '2.5.0', date: '2026-11-19', title: 'Frequentie per adres', notes: [{ app: 'eggs', text: 'Per adres elke week, of om de 2, 3 of 4 weken.' }] },
  { version: '2.4.0', date: '2026-11-19', title: 'Passkeys en meldingen', notes: [{ app: 'eggs', text: 'Inloggen met Face ID, meldingen op loopdagen en bij bestellen.' }] },
  { version: '2.0.0', date: '2026-11-19', title: 'Egg-sellent online', notes: [{ app: 'eggs', text: 'Accounts, teams en synchronisatie tussen telefoons.' }] },
];
export const VERSION = RELEASES[0].version;
export const APP_NAMES = { hub: 'Algemeen', eggs: 'Egg-sellent', training: 'Training' };
