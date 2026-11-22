# De Assistent: gezondheidsscore van gerechten

Instructies voor de geplande Claude-routine die gerechten uit de app Gerechten een gezondheidsscore geeft.
Script: `scripts/recipe-scores.mjs` (zelfde runner-account als de vragen, zie [runner.md](runner.md)).

## Werkwijze
1. `node scripts/recipe-scores.mjs list` → gerechten zonder score (id, titel, soort, porties, ingrediënten, stappen, updated_at).
   Lege lijst? Klaar.
2. Beoordeel elk gerecht met de maatstaf hieronder. Kijk naar de ingrediënten **per portie** (deel door `servings`)
   en naar de bereiding in de stappen (frituren, veel boter of room, lang bakken in olie).
3. Sla op: `node scripts/recipe-scores.mjs score <id> <updated_at> <score> -` met de uitleg via stdin.
   Neem `updated_at` precies over uit de lijst. Gaf het script "Niet opgeslagen", dan is het gerecht net gewijzigd: overslaan.
4. Twijfel je of iets wel een gerecht is (een test, onzin, te weinig gegevens)? Geef geen score en noem het in het verslag.

## Maatstaf (1-10)
Gebaseerd op de Schijf van Vijf (Voedingscentrum). Begin bij 5 en tel op of af:
- **Omhoog**: veel groente of fruit (ongeveer 200 g groente per portie bij een hoofdgerecht is top), volkoren
  (volkorenpasta, zilvervliesrijst, volkorenbrood), peulvruchten, vis, noten, olijfolie of andere zachte olie,
  stomen/koken/roosteren.
- **Omlaag**: bewerkt of rood vlees (worst, spek, gehakt, salami), veel kaas, room, boter of kokosmelk,
  frituren, witte rijst/pasta/brood zonder groente, veel suiker (nagerecht, saus, frisdrank), veel zout
  (bouillonblokjes, sojasaus, kant-en-klare sauzen en mixen).
- **Soort telt mee**: een nagerecht of taart is niet "slecht" maar hoort bij af en toe (meestal 2-4).
  Een salade met alleen sla en dressing is niet automatisch een 9.
- Richtlijn: 9-10 voorbeeldig volgens de Schijf van Vijf · 7-8 gezond · 5-6 prima, met een duidelijk minpunt ·
  3-4 af en toe · 1-2 echt een uitzondering.

## Uitleg bij de score
- Nederlands, je-vorm, 2-3 korte zinnen: wat goed is, wat de score omlaag haalt, en **één concrete tip** om het
  gezonder te maken (bijv. "Gebruik volkorenpasta en de helft kaas, dan wordt het een 7.").
- Gezinsleden zien de uitleg bij het gerecht. Geen medisch advies, geen oordeel over wie het kookt.
- Hoeveelheden die ontbreken ("zout naar smaak") niet zwaar laten wegen.

## Rechten
Het runner-account heeft in `platform_roles` de rol `runner`. Voor gerechten kan het alleen `runner_unscored_recipes()`
en `runner_score_recipe()` gebruiken: titel, soort, porties, ingrediënten en stappen, geen namen of gezinnen.
Wijzigt iemand later het recept (titel, porties, ingrediënten of stappen), dan vervalt de score en komt het gerecht
vanzelf weer in de lijst.
