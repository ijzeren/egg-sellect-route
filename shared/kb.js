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
    slug: 'pilates-beginnen', app: 'training', title: 'Beginnen met Pilates: uitleg, voorbeeld en stem', updated: '2026-11-24', version: '3.18.0',
    body: `<p>Nieuw met Pilates? Bij elke oefening staat uitleg stap voor stap en een bewegend voorbeeld.</p>
<h3>De basis</h3>
<ul><li><b>Ademhaling</b>: adem in door je neus en laat je ribben opzij uitzetten. Adem uit door je mond. Bij de zware kant van een beweging adem je meestal uit.</li>
<li><b>Neutrale rug</b>: op je rug heb je een kleine holte onder je onderrug. Bij <b>imprint</b> druk je die zacht in de mat.</li>
<li><b>Buik licht aan</b>: trek je navel zacht naar je ruggengraat, zonder je adem in te houden.</li>
<li><b>Tafelstand</b>: op je rug met je knieën boven je heupen en je onderbenen horizontaal. Op handen en knieën heet dat ook wel tafel.</li>
<li><b>Rustig en gecontroleerd</b>: liever kleiner en netjes dan groot met een zwaai.</li></ul>
<h3>Uitgebreid of beknopt</h3>
<p>Open een les en tik op een oefening. Bij <b>Uitgebreid</b> zie je een bewegend figuurtje en de uitleg: beginhouding, de stappen, waar je het voelt, waar je op let en een makkelijkere variant.
De groene vlek in het figuurtje laat zien waar je het voelt. Een grijs been of arm is de andere kant van je lichaam.
Onder de uitleg staat een link naar video's van de oefening (YouTube, alleen met internet).</p>
<p>Ken je de oefeningen? Kies bovenaan de les <b>Beknopt</b>. Dan zie je de korte weergave van eerst. Tijdens de les wissel je met de knop onderaan. De app onthoudt je keuze op deze telefoon.</p>
<p>Tijdens een oefening per kant draait het figuurtje om als je van kant wisselt.</p>
<h3>De stem</h3>
<p>Tijdens de les zegt een stem wat er komt: de naam van de oefening, je houding (op je rug, op handen en knieën, …) en hoe vaak.
Tien seconden voor het einde hoor je wat hierna komt. Halverwege een oefening per kant hoor je <b>Andere kant</b>, en bij lange oefeningen af en toe een tip, zoals <b>Let op je ademhaling</b>.</p>
<ul><li>Bovenaan de les zet je de <b>Stem</b> en de <b>Piep</b> (de piepjes bij het aftellen) los van elkaar aan of uit.</li>
<li>De stem is de Nederlandse stem van je telefoon en werkt ook zonder internet.</li>
<li>Hoor je niets? Zet het geluid van je telefoon harder en kijk of de stille modus uit staat.</li></ul>
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
    slug: 'agenda', app: 'agenda', title: 'De agenda van het gezin', updated: '2026-11-22', version: '3.15.0',
    body: `<p>In <b>Agenda</b> staat wat de kinderen (en wie je er verder in zet) per dag doen: school, trainingen, wedstrijden en andere afspraken.</p>
<ol><li>Zet eerst de <b>personen</b> erin: Agenda → Personen. Geef iedereen een eigen kleur.
Een kind zonder telefoon of account kan ook. Heeft iemand wel een account in het gezin, koppel dat dan: de agenda opent voor hem of haar meteen op de eigen planning.</li>
<li>Tik op <b>+</b> voor een afspraak. Kies de soort (les, school, training, wedstrijd, anders), voor wie, en <b>Elke week</b> (op welke dagen) of <b>Eén keer</b> (datum).</li>
<li>Bij een <b>wedstrijd</b> vul je ook de verzameltijd in; die staat dan bovenaan bij de dag. Een adres opent in Kaarten.</li></ol>
<p><b>Niet elke dag op dezelfde tijd?</b> Kies bij <b>Elke week</b> de dagen en tik op <b>Tijd per dag</b>. Dan geef je elke dag een eigen begin- en eindtijd, bijvoorbeeld zwemmen op maandag om 16:00 en op woensdag om 18:30. Wat je al had ingevuld, staat er dan bij elke dag alvast in.</p>
<p><b>Gaat een training een keer niet door?</b> Open de afspraak op die dag en tik op <b>Gaat … niet door</b>. Alleen die dag vervalt; de weken erna blijven staan.</p>
<p>Bovenaan kies je <b>Iedereen</b> of één persoon. Met ‹ en › blader je door de dagen; <b>Weekoverzicht</b> toont de hele week.</p>
<p><b>Wie mag wat?</b> Iedereen die Agenda mag gebruiken, kan afspraken en huiswerk toevoegen en wijzigen. Kinderen hebben pas toegang als een beheerder Agenda voor hen aanzet bij <b>Gezin → tik op het kind → Apps</b>.</p>`,
  },
  {
    slug: 'gezondheid', app: 'training', title: 'Gezondheid: gewicht en stappen van je iPhone', updated: '2026-11-23', version: '3.17.2',
    body: `<p>In <b>Training</b> kun je je <b>gewicht</b> en <b>aantal stappen</b> per dag bijhouden, uit de app Gezondheid van je iPhone. Een webapp mag niet zelf in Gezondheid kijken. Daarom stuurt een automatisering in de app <b>Opdrachten</b> de gegevens één keer per dag naar Thuis.</p>
<p class="sec-f">Deze uitleg hoort bij <b>iOS 27.2</b> (november 2026), met de iPhone in het Nederlands. In iOS 26 en 27 is aan deze acties niets veranderd. Staat er op jouw iPhone iets anders? Zoek dan op het Engelse woord tussen haakjes.</p>
<h3>Toestemming en privacy</h3>
<ul><li>Het staat pas aan als jij toestemming geeft (Training → Gezondheid → <b>Aanzetten</b>).</li>
<li>Thuis bewaart alleen het getal per dag: je gewicht en je stappen. Verder niets uit Gezondheid.</li>
<li><b>Alleen jij</b> ziet je gegevens. Wil je dat het gezin ze ook ziet in Training? Zet dan <b>Delen met het gezin</b> aan. Ook de hoofdbeheerder van de app ziet ze niet.</li>
<li><b>Kinderen</b>: eerst geeft een beheerder van het gezin toestemming bij <b>Gezin → (kind) → Gezondheid</b>. Intrekken wist alle metingen van het kind.</li>
<li><b>Stoppen en alles wissen</b> haalt je toestemming, je link en alle metingen weg. Verlaat je het gezin, dan gebeurt dat ook.</li></ul>
<h3>1. Link en automatisering</h3>
<ol><li>Zet Gezondheid aan in Training en tik op <b>Kopieer link</b>. Deze link is persoonlijk en geheim.</li>
<li>Open <b>Opdrachten</b> → tab <b>Automatisering</b> → <b>+</b> → <b>Tijdstip</b> (Time of Day). Kies bijvoorbeeld 21:30 en <b>Elke dag</b>.</li>
<li>Kies <b>Voer onmiddellijk uit</b> (Run Immediately), tik op <b>Volgende</b> en begin met een <b>lege</b> automatisering.</li></ol>
<h3>2. Gewicht ophalen</h3>
<ol><li>Zoek bij de acties op <b>gezondheid</b> en kies <b>Zoek gezondheidswaarden</b> (Find Health Samples).</li>
<li>Tik in de actie op <b>Type</b> en kies <b>Gewicht</b> (Weight). Je vindt het onder <b>Lichaamsmetingen</b>, of typ "gewicht" in het zoekveld.</li>
<li>Zet <b>Sorteer op</b> op <b>Begindatum</b>, <b>Volgorde</b> op <b>Nieuwste eerst</b> en zet <b>Limiet</b> aan op <b>1</b>. Zo krijg je alleen je laatste weging.</li></ol>
<h3>3. Stappen ophalen</h3>
<ol><li>Voeg nog een <b>Zoek gezondheidswaarden</b> toe en kies type <b>Stappen</b> (Steps).</li>
<li>Tik op <b>Voeg filter toe</b> en maak er <b>Begindatum is Vandaag</b> van.</li>
<li>Zet <b>Groepeer op</b> op <b>Dag</b>. Dit is nodig: anders telt Thuis de stappen van je iPhone en je Apple Watch dubbel.</li></ol>
<h3>4. Versturen naar Thuis</h3>
<ol><li>Voeg <b>Haal inhoud van URL op</b> (Get Contents of URL) toe. Tik op <b>URL</b> en plak je link.</li>
<li>Tik op het pijltje in de actie. Zet <b>Methode</b> op <b>POST</b> en <b>Vraag om hoofdtekst</b> op <b>JSON</b>.</li>
<li>Voeg drie velden van het soort <b>Tekst</b> toe. Typ links de naam precies zo, en kies rechts de variabele:
<ul><li><b>weight</b>: het resultaat van de eerste zoekactie (gewicht).</li>
<li><b>weight_date</b>: weer het resultaat van de eerste zoekactie. Tik erop, kies <b>Begindatum</b> en zet de <b>Datumnotatie</b> op <b>ISO 8601</b>. Zo komt een weging van eergisteren ook op eergisteren.</li>
<li><b>steps</b>: het resultaat van de tweede zoekactie (stappen).</li></ul>
Beide resultaten heten <b>Gezondheidswaarden</b>. Kies via <b>Selecteer variabele</b> het resultaat onder de juiste actie.</li>
<li>Voeg als laatste <b>Toon melding</b> toe met <b>Inhoud van URL</b>. Dan zie je wat Thuis antwoordt.</li></ol>
<h3>5. Testen</h3>
<ol><li>Tik op de afspeelknop. De eerste keer vraagt je iPhone of Opdrachten Gezondheid mag lezen. Zet <b>Gewicht</b> en <b>Stappen</b> aan.</li>
<li>Thuis antwoordt bijvoorbeeld: "Opgeslagen: 8.123 stappen (2026-11-23) en 72,4 kg (2026-11-20)." In Training zie je de meting meteen.</li></ol>
<p>Geen weegschaal die met Gezondheid praat? Je kunt je gewicht ook zelf invullen in Gezondheid: <b>Lichaamsmetingen → Gewicht → Voeg gegevens toe</b>. Alleen stappen kan ook: laat dan de gewichtvelden weg.</p>
<h3>Werkt het niet?</h3>
<ul><li><b>Training zegt "Wacht op de eerste meting"</b>: Thuis heeft nog niets ontvangen. Kijk of de link goed is geplakt en of de methode op <b>POST</b> staat.</li>
<li><b>"Geen meting gevonden in Gezondheid"</b>: er staat geen gewicht of stappen in Gezondheid, of Opdrachten mag het niet lezen. Open <b>Gezondheid</b> → je profielfoto → <b>Apps</b> → <b>Opdrachten</b> en zet Gewicht en Stappen aan.</li>
<li><b>"Geen getal gevonden"</b>: rechts in het veld staat geen variabele, maar gewone tekst. Kies de variabele opnieuw.</li>
<li>Bij Gezondheid in Training staat wanneer de laatste meting binnenkwam, of een ⚠︎ met wat er misging.</li>
<li><b>Nieuwe telefoon of link kwijt?</b> Tik op <b>Nieuwe link maken</b> en zet die in je opdracht. De oude link werkt dan niet meer.</li>
<li>Android werkt (nog) niet: daar is geen Opdrachten.</li></ul>
<h3>Versies van deze uitleg</h3>
<ul><li><b>3.17.2</b> (iOS 27.2): namen van de acties verbeterd ("Zoek gezondheidswaarden", "Haal inhoud van URL op"). Gewicht krijgt de datum van de weging mee. Stappen groeperen per dag is nu nodig.</li>
<li><b>3.17.0</b>: eerste versie.</li></ul>`,
  },
  {
    slug: 'agendalinks', app: 'agenda', title: 'Agendalinks: rooster uit Magister in de agenda', updated: '2026-11-22', version: '3.16.0',
    body: `<p>Met een <b>agendalink</b> komen afspraken uit een andere agenda vanzelf in Agenda, bijvoorbeeld het lesrooster uit <b>Magister</b>. De app haalt ze elk half uur op. Je hoeft niets over te typen.</p>
<h3>Toevoegen</h3>
<ol><li>Open <b>Agenda → Agendalinks</b> en tik op <b>Agendalink toevoegen</b>.</li>
<li>Kies <b>voor wie</b> de agenda is, en de soort: <b>Schoolrooster</b> (de afspraken worden lessen) of <b>Andere agenda</b>.</li>
<li>Plak de link (begint met <b>https://</b> of <b>webcal://</b>) en tik op <b>Bewaar</b>. De app haalt de agenda meteen op en laat zien hoeveel afspraken erin staan.</li></ol>
<p>Iedereen die Agenda gebruikt, kan links toevoegen, ook meerdere per persoon (bijvoorbeeld school én sportclub).</p>
<h3>Waar vind ik de link?</h3>
<ul><li><b>Magister</b>: log in op de website van Magister (niet in de app) en open de <b>Agenda</b>. Zoek naar <b>Agenda delen</b>, <b>iCal</b> of <b>CloudAgenda</b> en kopieer de link.
Zie je die optie niet? Dan heeft de school het delen uitgezet. Vraag de mentor of de ICT van school of ze het kunnen aanzetten.</li>
<li><b>Google Agenda</b>: op de computer: Instellingen → kies de agenda → <b>Geheim adres in iCal-indeling</b>.</li>
<li><b>Andere agenda's</b>: elke link naar een agenda in iCal-indeling (vaak eindigt die op <b>.ics</b>) werkt.</li></ul>
<h3>Goed om te weten</h3>
<ul><li><b>De link is geheim.</b> Wie hem heeft, kan de agenda lezen. De app bewaart hem op de server en laat hem aan niemand zien, ook niet aan het gezin. Je ziet alleen het begin van het adres en de laatste tekens.</li>
<li>Afspraken uit een link zijn in de app <b>niet te wijzigen</b>. Verandert het rooster, dan past de app ze vanzelf aan; een les die vervalt, verdwijnt.</li>
<li>De app houdt de afspraken bij van twee weken terug tot drie maanden vooruit.</li>
<li><b>Nu bijwerken</b> (open de link) haalt de agenda meteen op. Staat er een ⚠︎ bij de link, dan lukte ophalen niet; de melding zegt wat je kunt doen. Werkt een link niet meer, plak dan een nieuwe link in hetzelfde scherm.</li>
<li><b>Uitzetten</b> stopt het bijwerken; de afspraken blijven staan. <b>Verwijderen</b> haalt ook alle afspraken uit die link weg.
Wijzigen en verwijderen kan wie de link toevoegde, of een beheerder van het gezin.</li></ul>`,
  },
  {
    slug: 'agenda-andere-apps', app: 'agenda', title: 'Eierronde, leveringen en trainingen in de agenda', updated: '2026-11-22', version: '3.15.0',
    body: `<p>De agenda haalt ook afspraken uit de andere apps. Die zet je niet zelf in de agenda: ze komen vanzelf mee en kloppen altijd met de app waar ze vandaan komen. Tik erop om die app te openen.</p>
<ul><li><b>🥚 Eierronde</b>: op elke loopdag van Egg-sellent, vanaf de starttijd tot 21:00. Valt een loopdag uit (afwezig), dan staat er "gaat niet door".
Starttijd en lopers stel je in bij <b>Egg-sellent → Instellingen → Loopdagen</b> en <b>Lopers</b> (de gezinsbeheerder).</li>
<li><b>📦 Levering eieren</b>: op de leverdatum, met het aantal besteld of geleverd. Ook in de agenda van de lopers.</li>
<li><b>🧘 Trainingen</b>: op je trainingsdagen, in de agenda van iedereen die meedoet. Vul in Training bij <b>Trainingsdagen</b> per dag een starttijd in; dan staat er ook hoe laat en tot wanneer. Elke dag kan een andere tijd hebben; de eerste tijd die je invult, komt alvast bij de dagen die nog leeg zijn.</li></ul>
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
    slug: 'verhuur', app: 'rentals', title: 'Verhuur: boekingen en toeristenbelasting', updated: '2026-11-25', version: '3.20.0',
    body: `<p>In <b>Verhuur</b> houd je de boekingen van jullie vakantiehuis bij en doe je elke maand de aangifte van de toeristenbelasting (taxe de séjour).</p>
<ol><li>Zet de app aan bij <b>Gezin → Apps</b>. Een beheerder voegt eerst het <b>huis</b> toe (naam, plaats, sterren als het huis geclassificeerd is).</li>
<li>Tik op <b>+</b> voor een boeking. Kies waar hij geboekt is: <b>Booking.com</b>, <b>Airbnb</b>, <b>Direct</b> of <b>Eigen gebruik</b> (familie of vrienden). Nog niet zeker? Kies <b>Optie</b> of <b>Verwacht</b>.</li>
<li>Vul aankomst, vertrek, het aantal <b>personen</b> en het aantal <b>volwassenen</b> (18 jaar en ouder) in. Kinderen betalen geen toeristenbelasting, maar tellen wel mee voor de prijs per persoon.</li>
<li>Bij Booking.com en Airbnb vul je de <b>huur</b> in: wat de gast betaalt voor de overnachtingen, zonder schoonmaak, bedlinnen en belasting. Die platforms innen de toeristenbelasting zelf.</li>
<li>Bij een <b>directe boeking</b> vul je de afgesproken prijs per nacht, schoonmaak en bedlinnen in. De app rekent uit wat de gast in totaal betaalt, met de toeristenbelasting apart.</li></ol>
<p><b>Annuleren:</b> open de boeking en tik op <b>Boeking annuleren</b>. Hij blijft bewaard maar telt nergens meer mee. <b>Verwijderen</b> is alleen voor een boeking die per ongeluk is ingevoerd.</p>
<h3>Hoe wordt de toeristenbelasting berekend?</h3>
<p><b>Niet geclassificeerd</b> (geen sterren): 5% van de prijs per persoon per nacht, met een maximum, plus 10% toeslag van het departement. Dat bedrag betaalt elke volwassene per nacht.
Voorbeeld: 700 euro voor 7 nachten, 3 volwassenen en 1 kind. Per nacht 100 euro, per persoon 25 euro. 5% is € 1,25, plus 10% is € 1,38. Maal 3 volwassenen en 7 nachten: € 28,98.</p>
<p><b>Geclassificeerd</b> (met sterren): een vast bedrag per volwassene per nacht, bijvoorbeeld € 1,76 bij 3 sterren. De prijs doet dan niet mee.</p>
<p>De tarieven staan bij <b>Huis en toeristenbelasting</b> en zijn per jaar aan te passen.</p>
<h3>De aangifte</h3>
<p>Elke maand vóór de 5e geef je de maand ervoor aan in het portaal van de Vallée de Kaysersberg (ccvk.consonanceweb.fr). Open in Verhuur <b>Aangifte toeristenbelasting</b>:</p>
<ul><li>Per verblijf staan de waarden in de volgorde van het portaal: platform, begin, einde, personen (occupants), volwassenen (assujettis), kinderen (exonérés) en prijs. Tik op <b>Kopieer</b> en plak het in het portaal.</li>
<li>Vul ook de verblijven via Booking.com en Airbnb in. Die tellen niet mee in het bedrag dat jij betaalt: dat platform draagt zelf af.</li>
<li>Een verblijf over twee maanden staat bij de maand van aankomst. Vul de hele data in, het portaal verdeelt de nachten zelf.</li>
<li>Geen gasten? De aangifte is toch verplicht: klik in het portaal op <b>Déclarer</b> zonder iets in te vullen.</li>
<li>Klaar? Tik op <b>Aangifte gedaan</b>. Wordt daarna nog iets in die maand gewijzigd of geannuleerd, dan waarschuwt de app.</li></ul>
<p><b>Wie mag wat?</b> Een <b>beheerder</b> van Verhuur ziet en wijzigt alles. Een <b>kijker</b> ziet alleen wie wanneer komt en met hoeveel personen, zonder bedragen en namen. De rol stel je in bij <b>Gezin → tik op iemand → Apps</b>.</p>`,
  },
  {
    slug: 'verhuur-kosten', app: 'rentals', title: 'Verhuur: kosten, begroting en jaaroverzicht', updated: '2026-11-25', version: '3.22.0',
    body: `<p>Met <b>Kosten</b>, <b>Begroting</b> en het <b>Jaaroverzicht</b> zie je per jaar wat het vakantiehuis echt oplevert. Alleen een <b>beheerder</b> van Verhuur ziet dit; een kijker niet.</p>
<ol><li><b>Kostensoorten:</b> tik de eerste keer op <b>Standaardsoorten aanmaken</b>. Je krijgt onder meer internet, verzekeringen, elektra, water, stookolie, brandhout, belastingen, onderhoud en onvoorzien. Elk huis is anders: voeg soorten toe of zet ze uit bij <b>Kostensoorten</b>.</li>
<li><b>Begroting:</b> vul per soort het bedrag <b>per jaar</b> in. Volgend jaar neem je de begroting van vorig jaar met één tik over.</li>
<li><b>Kosten:</b> tik op <b>+</b> en vul soort, bedrag en datum in. Bij verbruik (stookolie, brandhout) kun je ook de hoeveelheid invullen, bijvoorbeeld 1500 liter. Nog niet betaald? Zet <b>Betaald</b> uit.</li></ol>
<h3>Kosten per boeking</h3>
<p>Schoonmaak, bedlinnen, de verhuurmakelaar en de vaste kosten per boeking komen uit de <b>boekingen</b>. Die voer je dus niet als factuur in, anders tellen ze dubbel.</p>
<ul><li><b>Makelaar:</b> een percentage over de uitbetaling min schoonmaak en bedlinnen, plus btw.</li>
<li><b>Vaste kosten per boeking:</b> een vast bedrag per verhuring.</li>
<li>Het percentage en de bedragen stel je in bij <b>Huis en toeristenbelasting → Kosten per boeking</b>. Wijkt het bij één boeking af? Vul het bedrag dan bij die boeking in.</li>
<li>Is de uitbetaling nog niet bekend, dan schat de app die met een percentage van de huur (ook in te stellen bij het huis).</li></ul>
<h3>Het jaaroverzicht</h3>
<ul><li><b>Opbrengst:</b> de uitbetalingen van Booking.com en Airbnb, en bij een directe boeking huur, schoonmaak en bedlinnen. De toeristenbelasting telt niet mee: die draag je af.</li>
<li><b>Resultaat</b> = opbrengst − kosten per boeking − vaste lasten + het deel voor eigen gebruik.</li>
<li><b>Eigen gebruik:</b> de schoonmaak en het bedlinnen van jullie eigen verblijf, plus een deel van de vaste lasten naar rato van de nachten. Voorbeeld: 20 van de 100 nachten eigen gebruik, dan is 20% van elektra, water en verzekering voor jullie. De inkomstenbelasting telt niet mee.</li>
<li><b>Investeringen</b> (renovatie, nieuwe keuken) staan apart en tellen niet mee in het resultaat.</li>
<li><b>Kostendekkend:</b> wat de verhuur netto opbrengt (ook de verwachte boekingen en opties), gedeeld door de begrote vaste lasten. Daaronder: hoeveel er nog te dekken is.</li>
<li>Een verblijf telt mee in het jaar van aankomst.</li></ul>
<p>Staat er bij een soort wel een begroting maar nog geen enkele factuur, dan waarschuwt de app: het resultaat is dan te rooskleurig.</p>`,
  },
  {
    slug: 'boodschappen', app: 'groceries', title: 'Boodschappen: de lijst, vaste boodschappen en het weekmenu', updated: '2026-11-28', version: '3.24.0',
    body: `<p>In <b>Boodschappen</b> heeft het gezin één lijst. Iedereen die de app mag gebruiken, ziet dezelfde lijst en kan erop zetten en afvinken.
De lijst ververst vanzelf, dus je kunt met twee mensen tegelijk in de winkel zijn.</p>
<h3>De lijst</h3>
<ol><li>Typ bovenaan wat er bij moet, met de hoeveelheid vooraan als je wilt: <i>2 uien</i>, <i>500 g gehakt</i>, <i>melk</i>. Tik op <b>Voeg toe</b>.</li>
<li>Staat het er al? Dan telt de app de hoeveelheid erbij op (1 ui + 2 uien = 3 uien).</li>
<li>De lijst staat per afdeling, in de volgorde van een ronde door de winkel. Klopt een afdeling niet? Tik op de boodschap en kies een andere. De app onthoudt dat.</li>
<li>In de winkel tik je op het rondje: de boodschap gaat naar <b>In het mandje</b>. Per ongeluk? Tik nog een keer. Het mandje is de volgende dag vanzelf leeg, of tik op <b>Mandje leegmaken</b>.</li></ol>
<h3>Vaste boodschappen</h3>
<p>Wat je steeds weer koopt (melk, brood, wc-papier) zet je bij <b>Vaste boodschappen</b> met hoe vaak: elke week, om de 2 weken, enzovoort.
De app zet het vanzelf op de lijst als het aan de beurt is, iets eerder dan precies na een week, zodat je het op tijd haalt.</p>
<ul><li>Staat een vaste boodschap op de lijst, maar heb je nog genoeg? Tik erop en kies <b>Nog genoeg in huis</b>. Dan komt hij een paar dagen later terug.</li>
<li>Koop je iets duidelijk vaker of minder vaak dan het ritme (minstens 4 keer gekocht)? Dan stelt de app een ander ritme voor. Er verandert niets tot je het zelf kiest.</li>
<li>Een boodschap op de lijst kun je ook <b>vaste boodschap maken</b>: tik erop.</li></ul>
<p>Bij <b>In huis</b> zet je wat je altijd in huis hebt, zoals olie, rijst of kruiden. Dat komt nooit vanzelf op de lijst en staat bij het weekmenu standaard uitgevinkt. Zout, peper en water ook.</p>
<h3>Weekmenu</h3>
<ol><li>Open <b>Weekmenu</b> en kies de week. Tik op <b>Gerecht toevoegen</b> en kies een gerecht uit de app Gerechten.</li>
<li>Zet met − en + voor hoeveel personen. De hoeveelheden rekent de app om.</li>
<li>Tik op <b>Ingrediënten op de lijst</b>. Je ziet alle ingrediënten van die gerechten bij elkaar opgeteld. Vink uit wat je al hebt en tik op <b>Zet … op de lijst</b>.</li></ol>
<p>Voor het weekmenu moet ook de app <b>Gerechten</b> aan staan voor jou. Wat je koopt per stuk rondt de app naar boven af (anderhalve ui wordt 2 uien).</p>
<p>Prijzen en aanbiedingen van Albert Heijn: zie het artikel <b>Boodschappen: prijzen van Albert Heijn, goedkoper en gezonder</b>. Picnic komt later.</p>`,
  },
  {
    slug: 'boodschappen-prijzen', app: 'groceries', title: 'Boodschappen: prijzen van Albert Heijn, goedkoper en gezonder', updated: '2026-11-28', version: '3.24.0',
    body: `<p>Bij elke boodschap kun je één keer kiezen welk product je bij <b>Albert Heijn</b> koopt. Daarna zie je op de lijst de prijs,
de bonus van deze week en een goedkoper of gezonder alternatief.</p>
<h3>Een product kiezen</h3>
<ol><li>Tik op een boodschap op de lijst, bijvoorbeeld <i>halfvolle melk</i>.</li>
<li>Tik bij <b>Albert Heijn</b> op <b>Kies een product bij AH</b>. De app zoekt op de naam van de boodschap; je kunt ook iets anders typen.</li>
<li>Tik op het product dat je wilt. Je ziet de inhoud, de prijs, de prijs per kilo of liter, de Nutri-Score (A is het gezondst) en de bonus.</li></ol>
<p>De keuze geldt voor het hele gezin en blijft bewaard. Staat er volgende week weer <i>melk</i> op de lijst (ook als vaste boodschap of uit het weekmenu), dan weet de app welk product het is.
Een ander product kiezen kan altijd: tik op het product bij de boodschap. <b>Geen product kiezen</b> haalt de keuze weg.</p>
<h3>Goedkoper en gezonder</h3>
<ul><li><b>Goedkoper</b>: een product van hetzelfde soort (bijvoorbeeld halfvolle melk) dat minstens 10% minder kost. Staat er een hoeveelheid bij de boodschap (<i>500 g gehakt</i>), dan telt wat je echt betaalt: een pak van 1 kilo is dan niet goedkoper. Een goedkoper product heeft nooit een slechtere Nutri-Score.</li>
<li><b>Gezonder</b>: een product van hetzelfde soort met een betere Nutri-Score.</li>
<li>Tik op het voorstel om te wisselen. Er verandert niets vanzelf.</li>
<li>Wil je een vast merk, zoals je favoriete pindakaas? Zet <b>Alleen dit merk</b> aan. Dan stelt de app geen goedkoper ander merk meer voor.</li></ul>
<h3>Het totaal</h3>
<p>Bovenaan de lijst staat wat de boodschappen met een gekozen product ongeveer kosten bij AH, en wat de bonus scheelt.
De app rekent uit hoeveel verpakkingen je nodig hebt (750 g gehakt = 2 pakken van 500 g). Bij een actie als <i>1 + 1 gratis</i> telt de korting alleen als je er genoeg koopt; dat zie je bij het product.
Boodschappen zonder gekozen product tellen niet mee.</p>
<h3>Goed om te weten</h3>
<ul><li>De prijzen worden één keer per dag bijgewerkt, als iemand de app opent. Het zijn de prijzen van de AH-webwinkel; in de winkel zijn ze bijna altijd gelijk.</li>
<li>Albert Heijn heeft geen officiële koppeling. Werkt het even niet, dan blijft de lijst gewoon werken, alleen zonder nieuwe prijzen. Je ziet dan van welke dag de prijzen zijn.</li>
<li>Je hoeft niet in te loggen bij AH. De app stuurt alleen zoekwoorden naar Albert Heijn, nooit je naam of je lijst.</li></ul>`,
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
  {
    slug: 'financien-inlezen', app: 'finance', title: 'Financiën: transacties van je bank inlezen', updated: '2026-11-25', version: '3.19.0',
    body: `<p>Financiën haalt (nog) niet zelf je transacties op bij de bank. Je downloadt ze één keer als bestand en leest dat in. Daarna kun je af en toe een nieuw bestand inlezen.</p>
<h3>Rabobank</h3>
<ol><li>Log in bij <b>Rabo Online Bankieren</b>, het liefst op de computer. In de Rabo-app kan downloaden niet altijd.</li>
<li>Zoek in het menu <b>Downloaden transacties</b>.</li>
<li>Kies de rekening(en). Meerdere rekeningen in één bestand kan, ook je spaarrekening.</li>
<li>Kies de periode, bijvoorbeeld vanaf 1 januari, en het formaat <b>CSV</b>.</li>
<li>Open in Thuis <b>Financiën → Bestand inlezen</b> en kies het bestand. Controleer de naam van een nieuwe rekening en tik op <b>Inlezen</b>.</li></ol>
<h3>Andere banken</h3>
<p>Kies bij je bank het formaat <b>CAMT.053</b> (soms "XML" of "afschrift"). Bijna elke Nederlandse bank heeft dat.</p>
<h3>Goed om te weten</h3>
<ul><li>Hetzelfde bestand of een overlappende periode opnieuw inlezen kan geen kwaad: wat er al staat, slaat de app over. Een soort die je zelf hebt gekozen, blijft staan.</li>
<li>Een overboeking tussen twee rekeningen die je allebei hebt ingelezen, telt niet mee in de totalen. Die vind je onder <b>Telt niet mee</b>.</li>
<li>Creditcards en pdf-afschriften kunnen (nog) niet.</li>
<li>Het rekeningnummer zelf bewaart de app niet, alleen de laatste 4 tekens.</li></ul>`,
  },
  {
    slug: 'financien-indelen', app: 'finance', title: 'Financiën: soorten, regels en vaste lasten', updated: '2026-11-25', version: '3.19.0',
    body: `<p>Elke transactie krijgt een <b>soort</b>, zoals Boodschappen of Energie en water. Zo zie je per maand waar het geld heen gaat.</p>
<h3>Zelf indelen</h3>
<ol><li>Tik op het overzicht op <b>nog niet ingedeeld</b>.</li><li>Tik op een transactie en kies de soort.</li>
<li>Komt deze winkel of partij vaker terug? Tik op <b>Altijd zo indelen</b>. Dat maakt een regel.</li></ol>
<h3>Regels</h3>
<ul><li>Een regel zegt bijvoorbeeld: als de naam "Albert Heijn" bevat, dan is het Boodschappen. Je kunt kiezen voor alleen afschrijvingen of alleen bijschrijvingen.</li>
<li>Regels werken voor alles wat er al staat en voor alles wat je later inleest.</li>
<li>Passen er twee regels? Dan wint de regel met de langste tekst.</li>
<li>Kies je zelf een soort bij een transactie, dan blijft die staan. Regels veranderen dat niet meer.</li>
<li>Regels en soorten zijn van het hele gezin. Iedereen met Financiën deelt dezelfde indeling.</li></ul>
<h3>Vaste lasten</h3>
<p>De app zoekt zelf naar afschrijvingen die elke maand terugkomen, met ongeveer hetzelfde bedrag (minstens 3 van de laatste 6 maanden). Je ziet rond welke dag ze komen en wanneer de volgende verwacht wordt.</p>
<h3>Telt niet mee</h3>
<p>Een terugbetaling of een overboeking naar je eigen spaarrekening is geen uitgave. Zet bij die transactie <b>Telt mee in de totalen</b> uit.</p>`,
  },
  {
    slug: 'financien-privacy', app: 'finance', title: 'Financiën: wie ziet mijn bankgegevens?', updated: '2026-11-25', version: '3.19.0',
    body: `<ul><li><b>Alleen jij</b> ziet een rekening die jij inleest. Ook de beheerders van het gezin zien hem niet.</li>
<li>Je kunt een rekening <b>delen met de beheerders</b> van het gezin, bijvoorbeeld de gezamenlijke rekening. Ga naar <b>Rekeningen</b>, tik op de rekening en zet <b>Delen met de beheerders</b> aan. Zij zien dan alle transacties van die rekening en kunnen ze ook inlezen en indelen.</li>
<li><b>Leden en kinderen</b> zien nooit de rekening van een ander.</li>
<li>De beheerder van de app (hoofdbeheer) ziet geen bankgegevens van gezinnen.</li>
<li>Het rekeningnummer zelf staat niet in de app, alleen de laatste 4 tekens.</li>
<li>Heeft iemand anders in het gezin dezelfde rekening al ingelezen? Dan kun jij hem niet nog een keer toevoegen. Vraag diegene om hem te delen.</li>
<li><b>Rekening verwijderen</b> wist alle transacties van die rekening. Verlaat je het gezin, dan worden jouw rekeningen in dat gezin ook gewist.</li>
<li><b>Bankkoppeling</b>: alleen jij ziet je koppeling met de bank. De sleutel van de bank staat alleen op de server, nooit op je telefoon of in de app.</li>
<li><b>Verhuur</b>: koppel je een uitbetaling van Booking.com of Airbnb aan een boeking, dan zien de beheerders van Verhuur bij die boeking de datum en het bedrag. De rest van je rekening zien ze niet. Die uitbetaling blijft bij de boeking staan, ook als je de rekening later verwijdert.</li></ul>`,
  },
  {
    slug: 'verhuur-uitbetalingen', app: 'finance', title: 'Uitbetalingen van Booking.com en Airbnb koppelen', updated: '2026-11-25', version: '3.21.0',
    body: `<p>Booking.com en Airbnb maken het geld van een verhuur over naar je bankrekening. In Financiën koppel je die bijschrijving aan de boeking in Verhuur. Zo zie je welke boekingen betaald zijn en welke nog niet.</p>
<h3>Wie kan dit?</h3>
<ul><li>Wie <b>beheerder van Verhuur</b> is en de rekening ziet waar het geld op binnenkwam (je eigen rekening, of een rekening die met jou gedeeld is).</li>
<li>Beheerders van Verhuur zien daarna bij de boeking de datum en het bedrag. De rest van de rekening zien ze niet.</li></ul>
<h3>Zo werkt het</h3>
<ol><li>Lees de nieuwste transacties in (zie <a href="?article=financien-inlezen">transacties inlezen</a>).</li>
<li>Tik in Financiën op <b>Uitbetalingen verhuur</b>. De app herkent een uitbetaling aan “Airbnb” of “Booking.com” in de naam of omschrijving.</li>
<li>Tik op een uitbetaling. Staat er een <b>Voorstel</b>? Tik op <b>Koppel</b>. Klopt het niet, kies dan <b>Andere boeking kiezen</b> en vink de juiste boeking(en) aan.</li></ol>
<h3>Hoe komt de app aan het voorstel?</h3>
<ul><li>Staat het boekingsnummer in de omschrijving, dan is het die boeking.</li>
<li>Anders zoekt de app een boeking van hetzelfde platform waarvan de <b>uitbetaling</b> (in Verhuur, bij Bedragen) precies dit bedrag is.</li>
<li>Booking.com betaalt vaak meerdere boekingen in één keer uit. Dan zoekt de app welke boekingen samen precies dit bedrag zijn.</li>
<li>Geen voorstel? Vul in Verhuur bij de boekingen de uitbetaling in, of kies zelf.</li></ul>
<h3>Goed om te weten</h3>
<ul><li>Koppel je één boeking waar nog geen uitbetaling bij stond, dan vult de app die in Verhuur in.</li>
<li>Meerdere boekingen: de app verdeelt het bedrag naar verhouding van wat je per boeking verwachtte.</li>
<li>Een nog niet ingedeelde uitbetaling krijgt de soort <b>Verhuur</b>.</li>
<li>In Verhuur staat bij <b>Nog niet uitbetaald</b> wat al binnen had moeten zijn: Airbnb 5 dagen na aankomst, Booking.com 35 dagen na vertrek.</li>
<li>Een directe boeking die de gast overmaakte, kun je ook koppelen: open de bijschrijving en kies <b>Koppel aan een boeking in Verhuur</b>.</li></ul>`,
  },
  {
    slug: 'financien-bank', app: 'finance', title: 'Financiën: Rabobank koppelen', updated: '2026-11-26', version: '3.23.0',
    body: `<p>Koppel je Rabobank-rekening, dan komen nieuwe transacties en het saldo elke nacht vanzelf binnen. Je hoeft dan geen export meer te downloaden.</p>
<h3>Koppelen</h3>
<ol><li>Open <b>Financiën → Rekeningen</b> en tik op <b>Rabobank-rekening koppelen</b>.</li>
<li>Je gaat naar Rabobank (via Enable Banking, een Europese partij met een vergunning om rekeningen te lezen). Log in en kies welke rekeningen.</li>
<li>Daarna kom je terug in Thuis. De app haalt de transacties van de afgelopen 90 dagen op.</li></ol>
<p>Op de iPhone kom je na het inloggen soms terug in Safari in plaats van in de app. Dat is goed: er staat <b>Gekoppeld</b>, en in de app zie je alles ook.</p>
<h3>Goed om te weten</h3>
<ul><li>De app kan alleen <b>lezen</b>. Betalen of geld overmaken kan niet.</li>
<li>De toestemming geldt <b>180 dagen</b>. Twee weken ervoor zie je in Financiën en op het startscherm <b>Bankkoppeling vernieuwen</b>. Tik erop en log opnieuw in bij Rabobank.</li>
<li>Ouder dan 90 dagen haalt de bank niet op. Wil je het hele jaar? Lees één keer een export in (zie <a href="?article=financien-inlezen">transacties inlezen</a>). Wat in beide zit, telt de app maar één keer.</li>
<li><b>Nu bijwerken</b> haalt meteen op. Verder doet de app het elke nacht zelf.</li>
<li><b>Ontkoppelen</b> stopt het ophalen. Wat er al is, blijft staan.</li>
<li>Rekeningen die je koppelt, zijn privé, net als bij inlezen. Delen met de beheerders kan bij de rekening.</li>
<li>Voorlopig kan dit alleen in ons eigen gezin: de gratis versie van Enable Banking werkt alleen voor de rekeningen van de eigenaar van de app.</li></ul>`,
  },
];

export const kbBySlug = slug => KB.find(a => a.slug === slug);
