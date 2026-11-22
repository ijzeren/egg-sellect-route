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
    version: '3.11.1', date: '2026-11-22', title: 'Eieren: duidelijker laatste keren',
    notes: [
      { app: 'eggs', text: 'Bij een huis zie je in de laatste 4 keer nu een grijze 0 als iemand geen eieren nam, en een rode NT als iemand niet thuis was (was een rood kruis).' },
    ],
  },
  {
    version: '3.11.0', date: '2026-11-22', title: 'Sauzen en "Past goed bij"',
    notes: [
      { app: 'recipes', text: 'Nieuwe soort: Saus en dip. Filter erop met Filter → Soort.', kb: 'gerechten' },
      { app: 'recipes', text: 'Elk gerecht heeft nu "Past goed bij": andere gerechten uit jullie verzameling en losse suggesties. Koppel je een saus aan een gerecht, dan zie je hem bij dat gerecht ook.', kb: 'gerechten' },
      { app: 'recipes', text: 'Receptpagina\'s in de stijl van jullie BBQ-recepten (.html) en Markdown met tabellen kun je nu ook importeren.', kb: 'gerechten-importeren' },
      { app: 'recipes', text: 'Nieuw in het gezin: pepersaus (steak au poivre), tzatziki en spareribs Memphis style.' },
    ],
  },
  {
    version: '3.10.1', date: '2026-11-22', title: 'Startscherm: groet bovenaan',
    notes: [
      { app: 'hub', text: 'De groet staat weer bovenaan het startscherm. Je gezin, leden, apps en account vind je onder de tegels.' },
      { app: 'hub', text: 'De melding "sessie verlopen" op het startscherm wordt weer netjes weergegeven.' },
    ],
  },
  {
    version: '3.10.0', date: '2026-11-22', title: 'Gerechten filteren',
    notes: [
      { app: 'recipes', text: 'Filter gerechten op soort, bereiding (smoker, oven, airfryer …), bereidingstijd, aantal personen, gezondheidsscore, sterren en ingrediënten (met of zonder).', kb: 'gerechten' },
      { app: 'recipes', text: 'De lijst laadt verder als je naar beneden scrolt, ook bij heel veel gerechten.' },
      { app: 'recipes', text: 'Alle gerechten hebben nu een gezondheidsscore.', kb: 'gezondheidsscore' },
    ],
  },
  {
    version: '3.9.1', date: '2026-11-22', title: 'Training opent het juiste programma',
    notes: [
      { app: 'training', text: 'Training opent meteen het programma dat er nu toe doet: waar je vandaag nog moet trainen, anders de eerstvolgende training, anders het programma dat je het laatst gebruikte.', kb: 'trainingsdagen-bonus' },
    ],
  },
  {
    version: '3.9.0', date: '2026-11-22', title: 'Gerechten met fases, temperaturen en tips',
    notes: [
      { app: 'recipes', text: 'Een gerecht toont de bereiding nu in fases, met genummerde stappen, de tijd per stap (ook een bereik, zoals 4–6 uur), de temperatuur en de kerntemperatuur.', kb: 'gerechten' },
      { app: 'recipes', text: 'Nieuw bij een gerecht: benodigdheden en tips. "Aan tafel om" plant nu ook gerechten die dagen van tevoren beginnen.', kb: 'gerechten' },
      { app: 'recipes', text: 'Importeren kan nu ook uit .json-bestanden (schema.org-recepten), en Markdown met fases, tijdregels en benodigdheden wordt beter herkend.', kb: 'gerechten-importeren' },
    ],
  },
  {
    version: '3.8.0', date: '2026-11-22', title: 'Geïmporteerde gerechten worden afgemaakt',
    notes: [
      { app: 'recipes', text: 'Een geïmporteerd gerecht wordt automatisch afgemaakt door de Assistent: duidelijke stappen, bereidingstijden en hoeveelheden, op basis van je originele bestand.', kb: 'gerechten-importeren' },
      { app: 'recipes', text: 'Daarna wordt het originele bestand verwijderd en krijgt het gerecht zijn gezondheidsscore. Tot die tijd staat er "Wordt verrijkt".', kb: 'gerechten-importeren' },
    ],
  },
  {
    version: '3.7.1', date: '2026-11-22', title: 'Past altijd op je telefoon',
    notes: [
      { app: 'hub', text: 'Geen schermen meer die breder zijn dan je telefoon. Lange woorden, zoals vakken, adressen en namen van gerechten, breken netjes af.' },
    ],
  },
  {
    version: '3.7.0', date: '2026-11-22', title: 'Gerechten importeren',
    notes: [
      { app: 'recipes', text: 'Importeer gerechten uit Markdown, tekst of een opgeslagen pagina, bijvoorbeeld recepten die Claude voor je schreef. Meerdere bestanden en meerdere recepten tegelijk.', kb: 'gerechten-importeren' },
      { app: 'recipes', text: 'De app herkent naam, personen, ingrediënten, bereiding en minuten per stap; je controleert alles voordat het erin gaat.', kb: 'gerechten-importeren' },
    ],
  },
  {
    version: '3.6.0', date: '2026-11-22', title: 'Beheer voor de hoofdbeheerder',
    notes: [
      { app: 'hub', text: 'Nieuw scherm Beheer voor de hoofdbeheerder van de app: apps voor alle gezinnen aan of uit, gezinnen uitschakelen of verwijderen, en hoofdbeheerders en de Assistent aanwijzen.', kb: 'hoofdbeheer' },
      { app: 'hub', text: 'Is je gezin uitgeschakeld, dan zie je dat op het startscherm. Er wordt niets verwijderd.' },
      { app: 'hub', text: 'Na het inloggen worden je gezin, hulp en beheer meteen geladen.' },
    ],
  },
  {
    version: '3.5.0', date: '2026-11-22', title: 'Nieuwe app: Agenda',
    notes: [
      { app: 'agenda', text: 'Nieuw: Agenda. Schoolrooster, trainingen, wedstrijden en afspraken van de kinderen in één dag- en weekoverzicht.', kb: 'agenda' },
      { app: 'agenda', text: 'Een kind hoeft geen eigen account te hebben om in de agenda te staan.', kb: 'agenda' },
      { app: 'agenda', text: 'Schoolrooster snel invoeren: per dag de lessen plakken.', kb: 'agenda-rooster-huiswerk' },
      { app: 'agenda', text: 'Huiswerk en toetsen bijhouden en afvinken; de app stelt de datum van de volgende les van dat vak voor.', kb: 'agenda-rooster-huiswerk' },
    ],
  },
  {
    version: '3.4.0', date: '2026-11-22', title: 'Nieuwe app: Gerechten',
    notes: [
      { app: 'recipes', text: 'Nieuw: Gerechten. Zet je favoriete gerechten erin met ingrediënten en bereidingsschema; de app rekent om naar het aantal personen en vertelt hoe laat je moet beginnen.', kb: 'gerechten' },
      { app: 'recipes', text: 'Geef sterren aan gerechten. Zo zie je wat het hele gezin het lekkerst vindt.', kb: 'gerechten' },
      { app: 'recipes', text: 'Elk gerecht krijgt automatisch een gezondheidsscore van 1 tot 10, met een tip om het gezonder te maken.', kb: 'gezondheidsscore' },
      { app: 'hub', text: 'Een beheerder zet Gerechten aan bij Gezin → Apps. Kinderen alleen als je het per kind aanzet.', kb: 'apps-aanzetten' },
    ],
  },
  {
    version: '3.3.0', date: '2026-11-22', title: 'Bio-circuit in Training',
    notes: [
      { app: 'training', text: 'Nieuw programma: Bio-circuit. 30 minuten op de toestellen in de sportschool, op je eigen vaste trainingsdagen.', kb: 'bio-circuit' },
      { app: 'training', text: 'Noteer na elke training je gewicht per toestel; volgende keer zie je wat je de vorige keer deed.', kb: 'bio-circuit' },
      { app: 'training', text: 'Training begint nu met een keuze uit de programma\'s. Ieder kiest zelf waar hij of zij aan meedoet.' },
    ],
  },
  {
    version: '3.2.0', date: '2026-11-22', title: 'Hulp: kennisbank, veelgestelde vragen en vragen stellen',
    notes: [
      { app: 'hub', text: 'Kennisbank met handleidingen bij alle apps, onder Hulp op het startscherm.' },
      { app: 'hub', text: 'Veelgestelde vragen voor alle gezinnen.' },
      { app: 'hub', text: 'Stel een vraag aan je gezin. Iedereen in het gezin kan antwoorden, en de Assistent zoekt ook een antwoord. Goede antwoorden komen in de veelgestelde vragen.', kb: 'vragen-stellen' },
      { app: 'hub', text: 'Wat is nieuw: na elke update zie je wat er veranderd is.' },
    ],
  },
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
export const APP_NAMES = { hub: 'Algemeen', eggs: 'Egg-sellent', training: 'Training', recipes: 'Gerechten', agenda: 'Agenda' };
