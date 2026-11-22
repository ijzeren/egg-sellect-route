// Gerechten importeren: Markdown zoals Claude het schrijft, meerdere recepten per bestand, vette kopjes, zonder koppen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipes, minutesIn, servingsIn, categoryIn } from '../recipes/import.js';

const CLAUDE = `# Lasagne van oma

Een klassieker voor de zondag. **Personen:** 6 · **Bereidingstijd:** 1 uur 20 min

## Ingrediënten
- 500 g rundergehakt
- 2 uien
- 1 blik tomatenblokjes (400 g)

### Voor de saus
- 50 g boter
- 500 ml melk

## Bereiding
1. Fruit de ui en bak het gehakt rul in **10 minuten**.
2. Ondertussen: maak de bechamelsaus (10 min).
3. Bak de lasagne 45 minuten in de oven op 180 °C.

## Tips
- Lekker met een frisse salade.

## Voedingswaarde (per portie)
- 650 kcal
`;

test('recept zoals Claude het schrijft', () => {
  const [x, ...rest] = parseRecipes(CLAUDE);
  assert.equal(rest.length, 0);
  const r = x.recipe;
  assert.equal(r.title, 'Lasagne van oma');
  assert.equal(r.servings, 6);
  assert.deepEqual(r.ingredients, ['500 g rundergehakt', '2 uien', '1 blik tomatenblokjes (400 g)', 'Voor de saus:', '50 g boter', '500 ml melk']);
  assert.deepEqual(r.steps.map(s => [s.min, s.par]), [[10, false], [10, true], [45, false]]);
  assert.match(r.intro, /^Een klassieker voor de zondag/);
  assert.deepEqual(r.tips, [{ label: '', text: 'Lekker met een frisse salade.' }]);
  assert.doesNotMatch(r.intro, /kcal|Tips/);
  assert.deepEqual(x.warnings, []);
});

test('meerdere recepten in één bestand, onder een verzameltitel', () => {
  const md = `# Onze weekmenu's\n\nVoor de hele week.\n\n## Tomatensoep\nVoor 4 personen\n\n**Ingrediënten**\n- 1 kg tomaten\n- 1 ui\n\n**Bereiding**\n1. Kook alles 20 minuten.\n2. Pureer.\n\n## Appeltaart\n\nIngrediënten:\n- 4 appels\n- 300 g bloem\n\nBereiding:\nMeng alles en bak het 1 uur.\n`;
  const out = parseRecipes(md);
  assert.deepEqual(out.map(x => x.recipe.title), ['Tomatensoep', 'Appeltaart']);
  assert.equal(out[0].recipe.category, 'soup');
  assert.equal(out[0].recipe.servings, 4);
  assert.equal(out[1].recipe.category, 'baking');
  assert.deepEqual(out[1].recipe.steps, [{ text: 'Meng alles en bak het 1 uur.', min: 60, par: false }]);
});

test('zonder koppen: bestandsnaam als titel', () => {
  const out = parseRecipes('Ingrediënten:\n- 2 eieren\n- snufje zout\n\nBereiding:\n- Klop de eieren.\n- Bak 3 minuten.', 'Omelet');
  assert.equal(out.length, 1);
  assert.equal(out[0].recipe.title, 'Omelet');
  assert.equal(out[0].recipe.steps[1].min, 3);
});

test('geen recept: lege lijst', () => {
  assert.deepEqual(parseRecipes('# Boodschappenlijst voor zaterdag\n\nNiets bijzonders.'), []);
});

test('tijden, personen en soort herkennen', () => {
  assert.equal(minutesIn('Laat 1,5 uur rijzen'), 90);
  assert.equal(minutesIn('Bak 10-12 minuten'), 12);
  assert.equal(minutesIn('Snijd de ui'), 0);
  assert.equal(servingsIn('**Porties:** 8'), 8);
  assert.equal(servingsIn('Recept voor 2 personen'), 2);
  assert.equal(categoryIn('Soort: Nagerecht', 'Mousse'), 'dessert');
  assert.equal(categoryIn('', 'Griekse salade'), 'salad');
  assert.equal(categoryIn('', 'Nasi'), 'main');
  assert.equal(categoryIn('', 'Pannenkoeken'), 'breakfast');
});
