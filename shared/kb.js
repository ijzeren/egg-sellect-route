// Kennisbank van de familie-app: handleidingen bij functies die uitleg nodig hebben.
// Getoond in de hub (Hulp → Kennisbank). De runner die vragen beantwoordt, gebruikt deze artikelen als bron.
//
// Afspraken (zie CLAUDE.md): ingewikkelde functie = artikel hier + verwijzing vanuit de release note (kb: 'slug').
//   slug     Engels of Nederlands woord-met-streepjes, uniek, verandert niet (er wordt naar verwezen)
//   app      'hub' (algemeen) of het id van een app
//   title    vraagvorm of korte naam
//   updated  datum van de laatste inhoudelijke wijziging (jjjj-mm-dd) + versie
//   body     eenvoudige HTML (p, ul/ol/li, b, i); alleen door ons geschreven, nooit gebruikersinvoer
export const KB = [
  {
    slug: 'op-beginscherm', app: 'hub', title: 'De app op je iPhone zetten', updated: '2026-11-22', version: '3.0.0',
    body: `<ol><li>Open de link van de app in <b>Safari</b>.</li><li>Tik op de deel-knop en kies <b>Zet op beginscherm</b>.</li>
<li>Gebruik daarna alleen het icoon op het beginscherm. Dat heeft een eigen opslag, los van Safari.</li></ol>
<p>Eén icoon bevat alle apps van je gezin. Zo deel je één login en werkt alles ook zonder internet. Updates komen vanzelf binnen.</p>`,
  },
  {
    slug: 'inloggen', app: 'hub', title: 'Inloggen en passkeys', updated: '2026-11-22', version: '3.1.0',
    body: `<p>Je logt in op het startscherm. Dat geldt daarna voor alle apps.</p>
<ol><li>Tik op <b>Log in</b> en vul je e-mailadres in.</li><li>Je krijgt een mail met een code van 6 cijfers. Vul die in.</li>
<li>Nog geen account? Dat wordt vanzelf aangemaakt.</li></ol>
<p><b>Passkey (Face ID):</b> ga naar <b>Gezin → Passkeys</b> en maak een passkey. Daarna log je in zonder mail. De passkey staat in je iCloud-sleutelhanger.</p>
<p><b>Uitloggen</b> kan bij Gezin → Account. Wijzigingen die nog niet verstuurd zijn (geen internet), gaan dan verloren; de app waarschuwt je.</p>`,
  },
  {
    slug: 'gezin-rollen', app: 'hub', title: 'Gezin, rollen en uitnodigen', updated: '2026-11-22', version: '3.1.0',
    body: `<p>Alles in de app hoort bij een <b>gezin</b>. Een gezin heeft leden met een rol:</p>
<ul><li><b>Beheerder</b>: beheert het gezin, de leden, uitnodigingen en welke apps aan staan.</li>
<li><b>Lid</b>: gebruikt de apps die aan staan.</li>
<li><b>Kind</b>: ziet alleen de apps die een beheerder voor hem of haar aanzet.</li></ul>
<p><b>Iemand uitnodigen</b> (beheerder): Gezin → Iemand uitnodigen → kies de rol → <b>Maak uitnodigingscode</b> → <b>Deel code</b>.
De ander logt in en kiest <b>Ik heb een code</b>. Een code is 14 dagen geldig; een nieuwe code maakt de vorige ongeldig.</p>
<p><b>Rol wijzigen</b>: Gezin → tik op een lid. Er blijft altijd minstens één beheerder.</p>
<p>Je kunt in meer dan één gezin zitten. Wisselen doe je bij Gezin → Jouw gezinnen.</p>`,
  },
  {
    slug: 'apps-aanzetten', app: 'hub', title: 'Apps aanzetten en toegang per lid', updated: '2026-11-22', version: '3.1.0',
    body: `<p>Elk gezin kiest zelf welke apps het gebruikt. Een beheerder zet ze aan of uit bij <b>Gezin → Apps</b>.</p>
<ul><li>Een app die aan staat, kan elk lid gebruiken. Kinderen alleen als je het per kind aanzet.</li>
<li>Per lid kun je toegang uitzetten of een rol in de app kiezen: Gezin → tik op een lid → Apps.
Bijvoorbeeld in Egg-sellent: <b>beheerder</b> (instellingen en bestellen) of <b>bezorger</b>.</li>
<li>Een app uitzetten verwijdert niets. Zet je hem weer aan, dan is alles er nog.</li></ul>
<p><b>Algemene instellingen</b> (account, gezin, leden, weergave) staan op het startscherm bij Gezin. Instellingen van één app staan in die app.</p>`,
  },
  {
    slug: 'vragen-stellen', app: 'hub', title: 'Vragen stellen en de FAQ', updated: '2026-11-22', version: '3.2.0',
    body: `<p>Kom je er niet uit? Kijk eerst in de <b>Veelgestelde vragen</b> en deze kennisbank. Staat het er niet bij:</p>
<ol><li>Ga naar <b>Hulp → Vragen</b> en stel je vraag. Kies eventueel over welke app het gaat.</li>
<li>Iedereen in je gezin kan antwoorden. Ook de <b>Assistent</b> zoekt een antwoord in de kennisbank en in de app zelf en zet dat erbij.</li>
<li>Helpt een antwoord? Tik op <b>Dit helpt</b>. De vrager of een beheerder kan dat doen.</li></ol>
<p>Goede antwoorden kan de beheerder van de app, na het weghalen van persoonlijke details, opnemen in de veelgestelde vragen voor alle gezinnen.
Andere gezinnen zien nooit je vraag zelf.</p>`,
  },
  {
    slug: 'trainingsdagen-bonus', app: 'training', title: 'Trainingsdagen en bonustraining', updated: '2026-11-22', version: '3.0.0',
    body: `<p>Pilates 30 heeft 30 lessen van 30 minuten. Je kiest één keer op welke dagen je traint, bijvoorbeeld maandag, woensdag en vrijdag.</p>
<ul><li>De lessen worden op die dagen ingepland. Je ziet bij de volgende les wanneer hij gepland staat.</li>
<li>Mis je een dag, dan schuift de rest op. Er gaat niets verloren.</li>
<li>Op een andere dag kun je altijd een les doen: dat is een <b>bonustraining</b>. Die telt mee, dus je loopt dan voor op schema.</li>
<li><b>Op rij</b> telt je trainingsdagen achter elkaar waarop je getraind hebt. Een bonusdag breekt de reeks niet.</li></ul>
<p>Trainingsdagen wijzigen: Training → Instellingen → Trainingsdagen. De planning past zich meteen aan.</p>
<p><b>Veiligheid:</b> stop bij pijn (spierbrand mag) en kies de makkelijkere variant. Bij blessures, rugklachten, zwangerschap of twijfel: overleg eerst met je huisarts of fysiotherapeut.</p>`,
  },
  {
    slug: 'samen-trainen', app: 'training', title: 'Samen of apart trainen', updated: '2026-11-22', version: '3.0.0',
    body: `<p>Een <b>training</b> is één voortgang door het programma. Je kiest wie er meedoet:</p>
<ul><li><b>Samen</b>: één training met meerdere gezinsleden. Iedereen ziet dezelfde voortgang, op de eigen telefoon.</li>
<li><b>Apart</b>: ieder een eigen training.</li>
<li>Beide kan naast elkaar, bijvoorbeeld samen met je partner én een eigen training.</li></ul>
<p>Instellen: Training → Instellingen → <b>Wie doen er mee?</b> Zet gezinsleden aan of uit, of maak een nieuwe training voor jezelf.
Bij meer trainingen wissel je daar ook tussen.</p>`,
  },
  {
    slug: 'eggs-ronde', app: 'eggs', title: 'Een ronde lopen', updated: '2026-11-22', version: '2.8.0',
    body: `<p>Het tabblad <b>Ronde</b> toont de adressen van vandaag in loopvolgorde, met het afgesproken aantal eieren.</p>
<ol><li>Tik op <b>Start ronde</b> (of <b>Verder bij …</b>).</li>
<li>Bij een huis: <b>Zoals afgesproken</b>, of pas het aantal aan. Ook <b>Niet thuis</b> of <b>Geen eieren</b>.</li>
<li>Leg bij elk bezoek vast <b>hoeveel</b> en <b>wanneer</b> de volgende keer is. Dat maakt het besteladvies beter.</li></ol>
<p>Wie deze week al gekocht, geweigerd of uitgesteld heeft, valt uit de ronde, behalve bij een afspraak later in dezelfde week.
Niet thuis verandert de afspraak niet: het adres komt op de volgende loopdag terug.</p>
<p><b>Afwezig?</b> Zet de dag bij Planning op afwezig. Klanten wiens vaste dag dan uitvalt, krijgen aan de deur het aanbod om voor 2 weken te nemen of een andere dag te kiezen.</p>`,
  },
  {
    slug: 'eggs-besteladvies', app: 'eggs', title: 'Hoe werkt het besteladvies?', updated: '2026-11-22', version: '2.8.0',
    body: `<p>Bij <b>Planning</b> staat per week hoeveel eieren je het beste kunt bestellen. Het advies is bewust voorzichtig: liever een paar te weinig dan veel over.</p>
<p>Per adres telt mee:</p>
<ul><li><b>Verkocht</b>: al bezocht in die week, het echte aantal.</li>
<li><b>Afgesproken</b>: de laatste afspraak valt in die week.</li>
<li><b>Vast ritme</b>: het ritme van het adres (elke week, om de 2 weken, …) doorgetrokken.</li>
<li>Nieuwe of lang niet bezochte adressen tellen niet mee; die zie je alleen als aantal.</li></ul>
<p><b>Advies = verkocht + (afgesproken + vast ritme) × realisatie</b>, afgerond op de eenheid uit Instellingen (bijv. 30 = een tray).
Realisatie is hoeveel procent van de afspraken de afgelopen 8 weken echt verkocht is.</p>
<p>Vul bij Planning in wat je echt besteld hebt. Dan toont de app ook wat er over is, en houdt het advies rekening met de marge uit Instellingen.</p>`,
  },
];

export const kbBySlug = slug => KB.find(a => a.slug === slug);
