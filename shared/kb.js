// Kennisbank van Thuis (de huis-gezinsapp): handleidingen bij functies die uitleg nodig hebben.
// Getoond in de hub (Hulp → Kennisbank). De runner die vragen beantwoordt, gebruikt deze artikelen als bron.
//
// Afspraken (zie CLAUDE.md): ingewikkelde functie = artikel hier + verwijzing vanuit de release note (kb: 'slug').
//   slug     Engels of Nederlands woord-met-streepjes, uniek, verandert niet (er wordt naar verwezen)
//   app      'hub' (algemeen) of het id van een app
//   title    vraagvorm of korte naam
//   updated  datum van de laatste inhoudelijke wijziging (jjjj-mm-dd) + versie
//   body     eenvoudige HTML (p, ul/ol/li, b, i); alleen door ons geschreven, nooit gebruikersinvoer
//   platformOnly  alleen zichtbaar voor de hoofdbeheerder van de app
export const KB = [
  {
    slug: 'hoofdbeheer', app: 'hub', platformOnly: true, title: 'Beheer (hoofdbeheerder)', updated: '2026-11-22', version: '3.6.0',
    body: `<p>Het scherm <b>Beheer</b> is alleen voor de hoofdbeheerder van de app. Het gaat over alles buiten de gezinnen.
Je ziet er bewust geen gegevens van gezinnen: alleen de naam van een gezin, het aantal leden en welke apps aan staan.</p>
<ul><li><b>Apps voor alle gezinnen</b>: zet een app uit, dan verdwijnt hij bij alle gezinnen. Er wordt niets verwijderd; aanzetten maakt alles terug zichtbaar. Welke beschikbare apps een gezin gebruikt, kiest het gezin zelf.</li>
<li><b>Gezinnen</b>: tik op een gezin om het uit te schakelen (leden kunnen dan niet bij hun gegevens, er wordt niets verwijderd) of te verwijderen.
Verwijderen kan niet ongedaan worden: typ de naam van het gezin over ter bevestiging. Alle gegevens van dat gezin gaan weg; de accounts van de leden blijven.</li>
<li><b>Hoofdbeheerders en Assistent</b>: geef iemand de rol hoofdbeheerder, of wijs het account van de Assistent aan. Het account moet al bestaan.
Er blijft altijd minstens één hoofdbeheerder.</li>
<li><b>FAQ beheren</b>: goedgekeurde antwoorden uit gezinnen herschrijven (zonder namen) en opnemen in de veelgestelde vragen.</li></ul>`,
  },
  {
    slug: 'op-beginscherm', app: 'hub', title: 'De app op je iPhone zetten', updated: '2026-11-22', version: '3.14.0',
    body: `<ol><li>Open de link van de app in <b>Safari</b>.</li><li>Tik op de deel-knop en kies <b>Zet op beginscherm</b>.</li>
<li>Gebruik daarna alleen het icoon op het beginscherm. Dat heeft een eigen opslag, los van Safari.</li></ol>
<p>Eén icoon bevat alle apps van je gezin. Zo deel je één login en werkt alles ook zonder internet. Updates komen vanzelf binnen.</p>
<h3>Nieuw icoon: Thuis</h3>
<p>Sinds versie 3.14 heet de app <b>Thuis</b>, met een huis met een hart als icoon. Op de iPhone verandert een icoon op het beginscherm niet vanzelf:
staat er bij jou nog <b>Familie</b> met het ei, dan werkt dat gewoon door. Je hoeft niets te doen.</p>
<p>Wil je toch het nieuwe icoon?</p>
<ol><li>Open eerst het oude icoon met internet aan, zodat alles wat je hebt ingevoerd is verstuurd.</li>
<li>Zet de app opnieuw op je beginscherm (stappen hierboven).</li>
<li>Log in het nieuwe icoon in. Het nieuwe icoon heeft een eigen opslag, dus je moet één keer opnieuw inloggen.</li>
<li>Werkt alles? Houd het oude icoon ingedrukt en kies <b>Verwijder app</b>.</li></ol>`,
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
<p><b>Welk programma opent Training?</b> Doe je mee aan meer programma's (bijv. Pilates 30 en Bio-circuit), dan opent Training het programma waar je
vandaag nog moet trainen. Is dat er niet, dan het programma met de eerstvolgende training, en anders het programma dat je het laatst gebruikte.
Via <b>‹ Training</b> linksboven kies je altijd zelf een ander programma.</p>
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
    slug: 'bio-circuit', app: 'training', title: 'Bio-circuit: trainen op de toestellen', updated: '2026-11-22', version: '3.3.0',
    body: `<p>Bio-circuit is een vast circuit van 30 minuten op de toestellen in de sportschool. Niet iedereen hoeft mee te doen:
alleen wie het programma opent en trainingsdagen kiest, heeft een Bio-circuit-training.</p>
<ol><li>Open <b>Training → Bio-circuit</b> en kies je vaste trainingsdagen.</li>
<li>Zet bij <b>Instellingen → Toestellen</b> de toestellen in de volgorde van jouw sportschool. Toevoegen, weghalen en verschuiven kan.</li>
<li>Tik op <b>Start training</b>. Je gaat 2 rondes langs alle toestellen: werken, dan wisselen naar het volgende toestel.
De tijd per toestel past zich aan het aantal toestellen aan, zodat het samen 30 minuten blijft.</li>
<li>Na afloop noteer je het <b>gewicht per toestel</b>. Volgende keer zie je bij elk toestel wat je de vorige keer deed.</li></ol>
<p>Zonder de app getraind? Tik bij het circuit op <b>Getraind zonder de app</b> en vul je gewichten in.
Op een andere dag trainen is een <b>bonustraining</b>; die telt gewoon mee.</p>
<p><b>Samen trainen</b> kan ook, net als bij Pilates: Instellingen → Wie doen er mee? Het gewicht is dan van de training, dus apart trainen is meestal handiger.</p>
<p><b>Veiligheid:</b> laat de toestellen de eerste keer instellen door een trainer. Stop bij pijn. Bij blessures, hartklachten of twijfel: overleg eerst met je huisarts.</p>`,
  },
  {
    slug: 'gerechten', app: 'recipes', title: 'Gerechten toevoegen en sterren geven', updated: '2026-11-22', version: '3.11.0',
    body: `<p>In <b>Gerechten</b> verzamelt het gezin zijn favoriete recepten. Iedereen die de app mag gebruiken, kan gerechten toevoegen en sterren geven.</p>
<ol><li>Tik rechtsboven op <b>+</b>. Vul de naam, de soort en voor hoeveel personen in.</li>
<li>Zet de <b>ingrediënten</b> erin, één per regel, met de hoeveelheid vooraan (bijv. <i>500 g gehakt</i>). Dan kan de app omrekenen naar meer of minder personen.</li>
<li>Maak de <b>bereiding</b>: per stap wat je doet en hoeveel minuten het duurt. Een bereik vul je in met "tot" (bijv. 240 tot 360 minuten = 4–6 uur).
Gaat een stap tegelijk met de vorige (rijst koken terwijl de saus pruttelt), vink <b>tegelijk</b> aan. Optioneel per stap: een korte titel, een fase
(bijv. Voorbereiding, Roken), de temperatuur van oven of smoker en de kerntemperatuur.</li>
<li>Zet eventueel <b>benodigdheden</b> (smoker, kernthermometer) en <b>tips</b> erbij. Een tip met "Label: tekst" krijgt een kopje.</li>
<li>Bij <b>Past goed bij</b> tik je gerechten uit jullie verzameling aan die er goed bij passen, en typ je andere suggesties (bijv. Friet).</li>
<li>Tik op <b>Bewaar</b>.</li></ol>
<p>Bij een gerecht kies je <b>Aan tafel om</b>, bijvoorbeeld 18:00. De app zet dan bij elke stap hoe laat je moet beginnen, ook als dat een of meer
dagen van tevoren is (bijv. pekelen of sous vide). Bij een bereik plant de app met de kortste tijd; houd zelf wat ruimte aan.</p>
<p><b>Sterren:</b> geef 1 tot 5 sterren. Tik nog een keer op dezelfde ster om ze weg te halen. In de lijst zie je het gemiddelde van het gezin; sorteer op <b>Lekkerst</b> of <b>Gezondst</b> om te kiezen wat je gaat eten.</p>
<p><b>Past goed bij:</b> bij elk gerecht staan de gerechten en suggesties die erbij passen. Tik op een gerecht om het te openen.
Koppelen werkt twee kanten op: zet je bij de tzatziki de brisket, dan staat de tzatziki ook bij de brisket. Handig voor sauzen, dips en bijgerechten:
kies de soort <b>Saus en dip</b> of <b>Bijgerecht</b> en koppel ze aan de gerechten waar ze bij horen.</p>
<p><b>Filteren:</b> tik naast het zoekveld op <b>Filter</b>. Kies soort, bereiding (smoker, BBQ, oven, airfryer, sous vide, pan, frituur, koken
of zonder koken), bereidingstijd, aantal personen, gezondheidsscore of sterren, en ingrediënten die er wel of juist niet in moeten
(meerdere met een komma). Onder de knop staat hoeveel gerechten er overblijven. Actieve filters staan bovenaan de lijst; tik op ✕ om er één weg te halen.
Je filters blijven bewaard tot je ze wist.</p>
<p>De lijst toont eerst 25 gerechten; scrol naar beneden voor de rest.</p>
<p><b>Wijzigen of verwijderen</b> kan wie het gerecht plaatste, en een beheerder van de app.</p>`,
  },
  {
    slug: 'gerechten-importeren', app: 'recipes', title: 'Gerechten importeren', updated: '2026-11-22', version: '3.9.0',
    body: `<p>Heb je recepten al ergens staan, bijvoorbeeld door Claude geschreven? Dan hoef je ze niet over te typen.</p>
<ol><li>Ga naar <b>Gerechten</b> en tik onderaan op <b>Gerechten importeren</b>.</li>
<li>Tik op <b>Kies bestanden</b> en kies een of meer bestanden: een receptbestand (<i>.json</i>, schema.org), Markdown (<i>.md</i>), tekst (<i>.txt</i>) of een opgeslagen pagina (<i>.html</i>, bijvoorbeeld een artifact).
Heb je van een recept zowel een .json als een .md, kies dan de .json: die is het nauwkeurigst. Receptpagina's in de opmaak van jullie
receptstijlgids (.html) worden ook herkend, met fases, tijden, temperaturen en tips.
Of plak de tekst en tik op <b>Lees in</b>.</li>
<li>Controleer de lijst. Per gerecht zie je hoeveel personen, ingrediënten en stappen er zijn gevonden. Wat ontbreekt, staat in het oranje.
Zet uit wat je niet wilt importeren; gerechten die al bestaan staan standaard uit.</li>
<li>Tik op <b>Importeer</b>. Ontbrekende tijden of personen vul je daarna aan bij het gerecht (Wijzig).</li></ol>
<p><b>Zo herkent de app een recept:</b> een kop met de naam (bijv. <i># Lasagne</i>), een kop of vette regel <i>Ingrediënten</i> met een lijst,
en een kop <i>Bereiding</i> met de stappen. "Voor 4 personen" of "Personen: 4" geeft het aantal personen; "15 minuten" in een stap wordt de tijd van die stap,
en een stap die begint met "Ondertussen" gaat tegelijk met de vorige. Meerdere recepten in één bestand kan: elk met een eigen kop.</p>
<p>De app neemt ook fases (bijv. <i>### Roken</i> onder Bereiding), stap-titels (<i>1. **Titel** — tekst</i>), regels als <i>⏱ Tijd: 4 u – 6 u · 🌡 Temperatuur: 120 °C</i>,
benodigdheden en tips over.</p>
<p>Tip: vraag Claude om je recepten "als schema.org-JSON" of "als Markdown, met kopjes Ingrediënten en Bereiding en minuten per stap". Dan gaat het importeren het best.</p>
<p><b>Daarna maakt de Assistent het af.</b> Een geïmporteerd gerecht staat eerst op <b>Wordt verrijkt</b>. Je kunt het al gebruiken.
De Assistent leest je originele bestand nog een keer en maakt het gerecht compleet: losse, duidelijke stappen met bereidingstijden,
stappen die tegelijk kunnen, en hoeveelheden zoals de app ze kan omrekenen. Hij blijft trouw aan je recept en voegt geen eigen ingrediënten toe.
Meestal gebeurt dat binnen een paar uur.</p>
<p>Is het gerecht klaar, dan wordt het originele bestand verwijderd en krijgt het gerecht zijn gezondheidsscore.
De Assistent ziet alleen het recept en het bestand, niet wie het plaatste of bij welk gezin het hoort.</p>
<p>Wijzig je een gerecht terwijl het nog wordt verrijkt, dan wacht de Assistent tot de volgende ronde en gebruikt hij jouw versie.</p>`,
  },
  {
    slug: 'gezondheidsscore', app: 'recipes', title: 'Hoe werkt de gezondheidsscore?', updated: '2026-11-22', version: '3.4.0',
    body: `<p>Elk gerecht krijgt een score van <b>1 tot 10</b>. Die wordt automatisch bepaald door de Assistent, meestal binnen een dag nadat je een gerecht toevoegt of wijzigt. Tot die tijd staat er <b>…</b>.</p>
<p>De score volgt de Schijf van Vijf van het Voedingscentrum, per portie:</p>
<ul><li><b>Hoger</b> door veel groente, volkoren, peulvruchten, vis, noten en zachte olie.</li>
<li><b>Lager</b> door bewerkt of veel rood vlees, veel kaas, room of boter, frituren, veel suiker of zout.</li>
<li>Een nagerecht of taart scoort meestal laag. Dat is niet erg: het hoort bij af en toe.</li></ul>
<p>Bij de score staat een korte uitleg met een tip om het gerecht gezonder te maken.</p>
<p>Je kunt de score niet zelf aanpassen. Wijzig je de naam, het aantal personen, de ingrediënten of de stappen, dan wordt de score opnieuw bepaald.
De Assistent ziet alleen het recept, niet wie het plaatste of bij welk gezin het hoort.</p>`,
  },
  {
    slug: 'agenda', app: 'agenda', title: 'De agenda van het gezin', updated: '2026-11-22', version: '3.5.0',
    body: `<p>In <b>Agenda</b> staat wat de kinderen (en wie je er verder in zet) per dag doen: school, trainingen, wedstrijden en andere afspraken.</p>
<ol><li>Zet eerst de <b>personen</b> erin: Agenda → Personen. Geef iedereen een eigen kleur.
Een kind zonder telefoon of account kan ook. Heeft iemand wel een account in het gezin, koppel dat dan: de agenda opent voor hem of haar meteen op de eigen planning.</li>
<li>Tik op <b>+</b> voor een afspraak. Kies de soort (les, school, training, wedstrijd, anders), voor wie, en <b>Elke week</b> (op welke dagen) of <b>Eén keer</b> (datum).</li>
<li>Bij een <b>wedstrijd</b> vul je ook de verzameltijd in; die staat dan bovenaan bij de dag. Een adres opent in Kaarten.</li></ol>
<p><b>Gaat een training een keer niet door?</b> Open de afspraak op die dag en tik op <b>Gaat … niet door</b>. Alleen die dag vervalt; de weken erna blijven staan.</p>
<p>Bovenaan kies je <b>Iedereen</b> of één persoon. Met ‹ en › blader je door de dagen; <b>Weekoverzicht</b> toont de hele week.</p>
<p><b>Wie mag wat?</b> Iedereen die Agenda mag gebruiken, kan afspraken en huiswerk toevoegen en wijzigen. Kinderen hebben pas toegang als een beheerder Agenda voor hen aanzet bij <b>Gezin → tik op het kind → Apps</b>.</p>`,
  },
  {
    slug: 'agenda-andere-apps', app: 'agenda', title: 'Eierronde, leveringen en trainingen in de agenda', updated: '2026-11-22', version: '3.13.0',
    body: `<p>De agenda haalt ook afspraken uit de andere apps. Die zet je niet zelf in de agenda: ze komen vanzelf mee en kloppen altijd met de app waar ze vandaan komen. Tik erop om die app te openen.</p>
<ul><li><b>🥚 Eierronde</b>: op elke loopdag van Egg-sellent, vanaf de starttijd tot 21:00. Valt een loopdag uit (afwezig), dan staat er "gaat niet door".
Starttijd en lopers stel je in bij <b>Egg-sellent → Instellingen → Loopdagen</b> en <b>Lopers</b> (de gezinsbeheerder).</li>
<li><b>📦 Levering eieren</b>: op de leverdatum, met het aantal besteld of geleverd. Ook in de agenda van de lopers.</li>
<li><b>🧘 Trainingen</b>: op je trainingsdagen, in de agenda van iedereen die meedoet. Vul in Training bij <b>Trainingsdagen</b> een starttijd in; dan staat er ook hoe laat en tot wanneer.</li></ul>
<p>Je ziet deze afspraken in je eigen agenda als je persoon in de Agenda gekoppeld is aan je account (Agenda → Personen). Wie Egg-sellent of Training niet mag gebruiken, ziet die afspraken niet.</p>`,
  },
  {
    slug: 'agenda-rooster-huiswerk', app: 'agenda', title: 'Schoolrooster en huiswerk', updated: '2026-11-22', version: '3.5.0',
    body: `<p><b>Schoolrooster invoeren:</b> Agenda → Schoolrooster invoeren. Kies voor wie en welke dag, en plak of typ de lessen, één per regel:</p>
<p><i>8:30-9:20 Wiskunde, 1.12</i><br><i>9:20-10:10 Engels, 2.04</i></p>
<p>Eerst de tijden, dan het vak, en na een komma het lokaal. Regels zonder tijd (zoals "Pauze") slaat de app over. Tik op <b>Bewaar</b>; de app gaat dan door naar de volgende dag.
De lessen gelden voor het schooljaar dat eronder staat. Wisselt het rooster per week (A- en B-week), maak die lessen dan als losse afspraak met <b>even</b> of <b>oneven weken</b>.</p>
<p><b>Huiswerk of een toets:</b> tik op <b>Huiswerk of toets toevoegen</b>. Kies voor wie, het vak en wat er moet gebeuren.
Staat het rooster erin, dan stelt de app de datum van de <b>volgende les van dat vak</b> voor. Afvinken doe je met het rondje ervoor.</p>
<p>Huiswerk dat vandaag of morgen af moet, zie je ook op het startscherm bij de tegel Agenda. Te laat? Dan staat het in het rood bovenaan.</p>`,
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
    slug: 'eggs-besteladvies', app: 'eggs', title: 'Hoe werkt de planning en het besteladvies?', updated: '2026-11-22', version: '3.12.1',
    body: `<p><b>Planning</b> bestaat uit drie delen: wat er ligt, wat eraan komt en wat je moet bestellen.</p>
<ul><li><b>Voorraad</b>: wat er nu ligt. Geleverd min kapot min verkocht (de verkoop komt vanzelf uit de ronde). De oudste eieren gaan eerst. Klopt het niet, tik op <b>Voorraad tellen</b>.</li>
<li><b>Onderweg</b>: elke levering die nog niet binnen is, met datum, aantal en over hoeveel dagen. Tik erop om hem te wijzigen.
Is hij binnen, tik dan op <b>Alles is binnen</b> en vul daarna de kapotte eieren in. Pas dan telt hij mee in de voorraad.</li>
<li><b>Bestellen</b>: het advies voor de eerstvolgende levering waarvoor nog niets besteld is. Bestellen doe je op de besteldag (bijv. donderdag) voor de levering erna (bijv. woensdag).
Tik op <b>Leg bestelling vast</b>; dan staat hij bij Onderweg en gaat het advies naar de week erna.</li></ul>
<p><b>Advies</b> = verwachte verkoop van die levering tot de levering erna, plus de marge (Instellingen), min wat er bij de levering naar verwachting nog ligt (voorraad + onderweg − verkoop tot dan).
De verwachte verkoop komt per adres uit de afspraken, de frequentie, de voorkeursdagen, de loopdagen en hoe vaak de klant echt thuis was. <b>Hoe berekend</b> laat elke stap zien.</p>
<p>Staat er een levering twee keer op dezelfde dag, dan meldt de app <b>Dubbel ingevoerd?</b>. Verwijder er dan één; anders telt hij dubbel mee en valt het advies te laag uit.</p>`,
  },
  {
    slug: 'eggs-sumup', app: 'eggs', title: 'Afrekenen met SumUp', updated: '2026-11-22', version: '3.12.0',
    body: `<p>Wie met SumUp afrekent, kan Egg-sellent na een verkoop meteen de SumUp-app laten openen. Dit is een <b>persoonlijke instelling</b>: alleen op jouw telefoon.</p>
<ol><li>Zet de <b>SumUp-app</b> op je telefoon en log daarin in.</li>
<li>Zet in Egg-sellent bij <b>Instellingen → Afrekenen met SumUp</b> de schakelaar aan.</li>
<li>Tik op <b>Test: open SumUp</b>. Opent SumUp, dan werkt het.</li></ol>
<p>Aan de deur: kies je een aantal eieren (of <b>Zoals afgesproken</b>), dan vraagt de app <b>Afrekenen in SumUp?</b> met het aantal en de doosjes (bijvoorbeeld 16 eieren: 1×10 + 1×6). Tik je op <b>Open SumUp</b>, dan opent SumUp. Het bedrag en de artikelen kies je in SumUp; daar staan de prijzen. Daarna ga je zelf terug naar Egg-sellent. Later afrekenen kan met de knop <b>Afrekenen in SumUp</b> bij het huis.</p>
<p>Gaat SumUp niet open? Dan meldt de app dat. Controleer of de SumUp-app op de telefoon staat. Egg-sellent houdt niet bij of er betaald is; dat zie je in SumUp.</p>`,
  },
];

export const kbBySlug = slug => KB.find(a => a.slug === slug);
