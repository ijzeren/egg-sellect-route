// Importeren uit schema.org-JSON en uit Markdown met fases, tijdregels, benodigdheden en tips (verzonnen voorbeeld).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRecipes, durationIn } from '../recipes/import.js';
import { scaleLine, plan, fmtRange, sections, clean } from '../recipes/recipe.js';

const MD = `# Gerookte kip

Kip met een kruidenrub.

## Overzicht

| | |
|---|---|
| Porties | 4 personen |
| Categorie | Hoofdgerecht |

## Benodigdheden

- Smoker
- Kernthermometer

## Ingrediënten

### Rub

- **Paprikapoeder** — 1 el
- **Zout** — naar smaak
- **Mosterd** — hoeveelheid niet vermeld *(optioneel)* _(eenheid afgeleid)_

### Overig

- **Kip** — 1,5–2 kg

## Bereiding

### Voorbereiding

1. **Inwrijven** — Wrijf de kip in met de rub.
2. **Laten intrekken** — In de koelkast, 1 tot 2 uur.
   - ⏱ Tijd: 1 u – 2 u

### Roken

3. **Smoker aan** — Verwarm de smoker.
   - 🌡 Temperatuur: 120 °C
4. **Garen** — Rook de kip tot hij gaar is, meestal 3 uur.
   - ⏱ Tijd: 3 u · 🌡 Temperatuur: 120 °C · Kerntemperatuur: 75 °C
5. **Rusten** — Laat 10 minuten rusten.
   - ⏱ Tijd: 10 min

## Tips

- **Hout:** Appelhout past goed.

## Opmerkingen

- Bron: kip.pdf.

## Trefwoorden

kip, smoker
`;

test('Markdown met fases, tijdregels, benodigdheden en tips', () => {
  const [x, ...rest] = parseRecipes(MD);
  assert.equal(rest.length, 0);
  const r = x.recipe;
  assert.equal(r.title, 'Gerookte kip');
  assert.equal(r.servings, 4);
  assert.deepEqual(r.tools, ['Smoker', 'Kernthermometer']);
  assert.deepEqual(r.ingredients, ['Rub:', '1 el Paprikapoeder', 'Zout, naar smaak', 'Mosterd (optioneel)', 'Overig:', '1,5–2 kg Kip']);
  assert.deepEqual(r.steps.map(s => [s.section || '', s.title, s.min, s.max || 0, s.temp || '', s.core || '']), [
    ['Voorbereiding', 'Inwrijven', 0, 0, '', ''],
    ['', 'Laten intrekken', 60, 120, '', ''],
    ['Roken', 'Smoker aan', 0, 0, '120 °C', ''],
    ['', 'Garen', 180, 0, '120 °C', '75 °C'],
    ['', 'Rusten', 10, 0, '', ''],
  ]);
  assert.deepEqual(r.tips, [{ label: 'Hout', text: 'Appelhout past goed.' }]);
  assert.equal(r.intro, 'Kip met een kruidenrub.');
  assert.deepEqual(x.warnings, []);
});

test('schema.org-JSON met x-details', () => {
  const json = JSON.stringify({
    '@context': 'https://schema.org', '@type': 'Recipe', name: 'Gerookte kip', description: 'Kip met rub.', recipeYield: 'Niet vermeld',
    recipeCategory: 'Hoofdgerecht', tool: ['Smoker'],
    recipeIngredient: ['1 el Paprikapoeder [Rub]', '1,5 kg Kip [Overig]'],
    'x-details': {
      ingredientgroepen: [{ groep: 'Rub', items: [{ name: 'Paprikapoeder', amount: '1 el', optional: false, note: '' }] },
        { groep: 'Overig', items: [{ name: 'Kip', amount: '1,5 kg', optional: false, note: 'eenheid afgeleid' }] }],
      stappen: [{ sectie: 'Roken', stappen: [{ titel: 'Garen', tekst: 'Rook de kip.', duur_min_minuten: 180, duur_max_minuten: 240, temperatuur: '120 °C', kerntemperatuur: '75 °C' },
        { titel: 'Saus', tekst: 'Maak ondertussen de saus.', duur_min_minuten: 10, duur_max_minuten: 10 }] }],
      tips: [{ label: 'Hout', tekst: 'Appelhout.' }], opmerkingen: ['Bron: kip.pdf.'],
    },
  });
  const [x] = parseRecipes(json);
  const r = x.recipe;
  assert.deepEqual(r.ingredients, ['Rub:', '1 el Paprikapoeder', 'Overig:', '1,5 kg Kip']);
  assert.deepEqual(r.steps, [
    { text: 'Rook de kip.', min: 180, max: 240, par: false, title: 'Garen', section: 'Roken', temp: '120 °C', core: '75 °C' },
    { text: 'Maak ondertussen de saus.', min: 10, par: true, title: 'Saus' },
  ]);
  assert.deepEqual(r.tools, ['Smoker']);
  assert.deepEqual(r.tips, [{ label: 'Hout', text: 'Appelhout.' }]);
  assert.ok(x.warnings.includes('Aantal personen niet gevonden'));
});

test('tijden lezen', () => {
  assert.deepEqual(durationIn('Tijd: 8 u'), { min: 480, max: 0 });
  assert.deepEqual(durationIn('⏱ Tijd: 45 min – 1 u 15 min'), { min: 45, max: 75 });
  assert.deepEqual(durationIn('Tijd: 12 u – 48 u'), { min: 720, max: 2880 });
  assert.deepEqual(durationIn('Tijd: min. 2 u 30 min'), { min: 150, max: 0 });
  assert.deepEqual(durationIn('Tijd: 10-12 minuten'), { min: 10, max: 12 });
});

test('bereik omrekenen, plannen over dagen, fases', () => {
  assert.equal(scaleLine('3,5–4,5 kg brisket', 2), '7–9 kg brisket');
  assert.equal(scaleLine('100–… ml BBQ-saus', 2), '100–… ml BBQ-saus', 'onvolledig bereik blijft staan');
  const p = plan([{ text: 'Pekelen', min: 1440 }, { text: 'Sous vide', min: 1320 }, { text: 'Bakken', min: 45 }], '18:00');
  assert.equal(p.startDay, -2);
  assert.equal(p.start, '19:15');
  assert.deepEqual(p.steps.map(s => [s.day, s.at]), [[-2, '19:15'], [-1, '19:15'], [0, '17:15']]);
  assert.equal(fmtRange(240, 360), '4–6 uur');
  assert.equal(fmtRange(45, 75), '45 min – 1 uur 15 min');
  assert.equal(fmtRange(15, 20), '15–20 min');
  assert.deepEqual(sections([{ text: 'a', section: 'X' }, { text: 'b' }, { text: 'c', section: 'Y' }]).map(s => [s.section, s.steps.map(t => t.n)]), [['X', [1, 2]], ['Y', [3]]]);
  const c = clean({ title: 'x', steps: [{ text: 'a', min: 5000, max: 100, temp: ' 120 °C ' }], tools: 'Smoker\n\nMes', tips: 'Hout: Appel\nGewoon een tip' });
  assert.deepEqual(c.steps[0], { text: 'a', min: 4320, par: false, temp: '120 °C' });
  assert.deepEqual(c.tools, ['Smoker', 'Mes']);
  assert.deepEqual(c.tips, [{ label: 'Hout', text: 'Appel' }, { label: '', text: 'Gewoon een tip' }]);
});
