// Gerechten filteren: soort, bereidingswijze, tijd, personen, gezondheid, sterren en ingrediënten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../recipes/recipe.js';

const list = [
  { id: 'a', title: 'Brisket', category: 'main', servings: 12, health_score: 3, tools: ['Smoker'], ingredients: ['4 kg brisket', 'zout'], steps: [{ text: 'Rook 8 uur', min: 480 }] },
  { id: 'b', title: 'Zalm', category: 'main', servings: 4, health_score: 7, tools: [], ingredients: ['600 g zalm', '1 el honing'], steps: [{ text: 'Gaar op de BBQ', min: 60 }] },
  { id: 'c', title: 'Tomatensoep', category: 'soup', servings: 4, health_score: null, tools: [], ingredients: ['1 kg tomaten', '1 ui'], steps: [{ text: 'Kook 20 minuten', min: 20 }] },
  { id: 'd', title: 'Salade', category: 'salad', servings: 2, health_score: 9, tools: [], ingredients: ['sla', '1 ui'], steps: [{ text: 'Snijd alles', min: 10 }] },
];
const ratings = [{ recipe_id: 'b', user_id: '1', stars: 5 }, { recipe_id: 'a', user_id: '1', stars: 3 }];
const ids = f => list.filter(x => R.passes(x, ratings, f)).map(x => x.id);

test('bereidingswijze herkennen', () => {
  assert.deepEqual(R.methodsOf(list[0]), ['smoker']);
  assert.deepEqual(R.methodsOf(list[1]), ['bbq']);
  assert.deepEqual(R.methodsOf(list[2]), ['cook']);
  assert.deepEqual(R.methodsOf(list[3]), ['cold']);
});

test('filters combineren', () => {
  assert.deepEqual(ids({}), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids({ cats: ['soup', 'salad'] }), ['c', 'd']);
  assert.deepEqual(ids({ methods: ['smoker', 'bbq'] }), ['a', 'b']);
  assert.deepEqual(ids({ time: '30' }), ['c', 'd']);
  assert.deepEqual(ids({ time: 'long' }), ['a']);
  assert.deepEqual(ids({ servings: '3-4' }), ['b', 'c']);
  assert.deepEqual(ids({ servings: '9+' }), ['a']);
  assert.deepEqual(ids({ health: '7' }), ['b', 'd']);
  assert.deepEqual(ids({ health: 'low' }), ['a']);
  assert.deepEqual(ids({ stars: '4' }), ['b']);
  assert.deepEqual(ids({ stars: 'none' }), ['c', 'd']);
  assert.deepEqual(ids({ withIng: 'ui' }), ['c', 'd']);
  assert.deepEqual(ids({ withIng: 'ui, tomaten' }), ['c']);
  assert.deepEqual(ids({ withoutIng: 'ui' }), ['a', 'b']);
  assert.deepEqual(ids({ cats: ['main'], health: '7' }), ['b']);
  assert.equal(R.filterCount({ cats: ['main'], health: '7', withIng: 'ui, tomaten' }), 4);
});

test('veelgebruikte ingrediënten', () => {
  assert.deepEqual(R.commonIngredients(list), ['ui']);
});
