// Gerechten: omrekenen van ingrediënten, bereidingsschema, sterren en invoer opschonen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../recipes/recipe.js';

test('hoeveelheden herkennen', () => {
  assert.deepEqual(R.parseIngredient('200 g spinazie'), { q: 200, rest: 'g spinazie' });
  assert.deepEqual(R.parseIngredient('1,5 el olie'), { q: 1.5, rest: 'el olie' });
  assert.deepEqual(R.parseIngredient('½ citroen'), { q: 0.5, rest: 'citroen' });
  assert.deepEqual(R.parseIngredient('1 1/2 kopje melk'), { q: 1.5, rest: 'kopje melk' });
  assert.equal(R.parseIngredient('zout en peper').q, null);
});

test('omrekenen naar meer of minder personen', () => {
  assert.equal(R.scaleLine('200 g spinazie', 1.5), '300 g spinazie');
  assert.equal(R.scaleLine('2 uien', 0.5), '1 uien');
  assert.equal(R.scaleLine('1 el olie', 0.5), '½ el olie');
  assert.equal(R.scaleLine('3 eieren', 2), '6 eieren');
  assert.equal(R.scaleLine('zout en peper', 2), 'zout en peper');
  assert.equal(R.scaleLine('500 g gehakt', 1), '500 g gehakt');
});

test('bereidingsschema: stappen na elkaar en tegelijk', () => {
  const steps = [{ text: 'Rijst koken', min: 20 }, { text: 'Saus maken', min: 15, par: true }, { text: 'Opdienen', min: 5 }];
  assert.equal(R.totalMinutes(steps), 25);
  const p = R.plan(steps, '18:30');
  assert.equal(p.start, '18:05');
  assert.deepEqual(p.steps.map(s => s.at), ['18:05', '18:05', '18:25']);
  assert.equal(R.plan([{ text: 'Lang garen', min: 90 }], '00:30').start, '23:00', 'over middernacht');
  assert.equal(R.fmtMinutes(75), '1 uur 15 min');
});

test('sterren: gemiddelde per gerecht en sorteren', () => {
  const ratings = [{ recipe_id: 'a', user_id: '1', stars: 5 }, { recipe_id: 'a', user_id: '2', stars: 4 }, { recipe_id: 'b', user_id: '1', stars: 3 }];
  assert.equal(R.ratingOf(ratings, 'a').avg, 4.5);
  assert.equal(R.fmtStars(4.5), '4,5');
  const list = [{ id: 'b', title: 'B', health_score: 8 }, { id: 'a', title: 'A', health_score: null }, { id: 'c', title: 'C', health_score: 5 }];
  assert.deepEqual(R.sortRecipes(list, ratings, 'top').map(x => x.id), ['a', 'b', 'c']);
  assert.deepEqual(R.sortRecipes(list, ratings, 'health').map(x => x.id), ['b', 'c', 'a']);
});

test('invoer opschonen: lege regels weg, geen gezondheidsscore van buiten', () => {
  const c = R.clean({ title: '  Soep ', servings: '0', ingredients: '1 ui\n\n 2 wortels ', steps: [{ text: 'Snijden', min: '5', par: true }, { text: '' }, { text: 'Koken', min: 'x' }], health_score: 10, category: 'onzin' });
  assert.equal(c.title, 'Soep');
  assert.equal(c.servings, 1);
  assert.deepEqual(c.ingredients, ['1 ui', '2 wortels']);
  assert.deepEqual(c.steps, [{ text: 'Snijden', min: 5, par: false }, { text: 'Koken', min: 0, par: false }]);
  assert.equal(c.category, 'main');
  assert.ok(!('health_score' in c));
});
