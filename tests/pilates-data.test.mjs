// Controle op de Pilates-inhoud (uit de overdracht): elke les is precies 30 minuten en alle oefeningen bestaan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { E, WU, CD, DAYS } from '../training/sports/pilates/data.js';
import { planFor, LESSON_SECONDS } from '../training/sports/pilates/index.js';

const sum = a => a.reduce((s, x) => s + x[1], 0);

test('30 lessen', () => assert.equal(DAYS.length, 30));

test('warming-up en cooldown zijn elk precies 300 s', () => {
  for (const [k, set] of Object.entries(WU)) assert.equal(sum(set), 300, `WU ${k}`);
  for (const [k, set] of Object.entries(CD)) assert.equal(sum(set), 300, `CD ${k}`);
});

test('hoofdtraining is per les precies 1200 s', () => {
  DAYS.forEach((d, i) => assert.equal(sum(d.m), 1200, `les ${i + 1}`));
});

test('elke les telt op tot precies 1800 s', () => {
  for (let n = 1; n <= DAYS.length; n++) assert.equal(planFor(n).reduce((s, x) => s + x.s, 0), LESSON_SECONDS, `les ${n}`);
});

test('alle oefening-id\'s bestaan', () => {
  const all = [...Object.values(WU), ...Object.values(CD), ...DAYS.map(d => d.m)].flat();
  for (const [id] of all) assert.ok(E[id], `onbekende oefening: ${id}`);
});

test('rustige lessen vallen op 7, 14, 21 en 28', () => {
  assert.deepEqual(DAYS.map((d, i) => d.rest ? i + 1 : 0).filter(Boolean), [7, 14, 21, 28]);
});

// v3.18: elke oefening heeft uitleg voor beginners en een figuurtje.
test('elke oefening heeft uitgebreide uitleg en een figuurtje', async () => {
  const { GUIDE } = await import('../training/sports/pilates/guide.js');
  const { FIG } = await import('../training/sports/pilates/figures.js');
  const { figureSVG } = await import('../training/sports/pilates/rig.js');
  for (const id of Object.keys(E)) {
    const g = GUIDE[id];
    assert.ok(g, `geen uitleg: ${id}`);
    for (const k of ['start', 'feel', 'avoid', 'easier', 'en']) assert.ok(g[k] && g[k].length > 3, `${id}: ${k} ontbreekt`);
    assert.ok(Array.isArray(g.steps) && g.steps.length >= 2, `${id}: te weinig stappen`);
    assert.ok(FIG[id] && FIG[id].k.length >= 1, `geen figuur: ${id}`);
    const svg = figureSVG(FIG[id], { id });
    assert.doesNotMatch(svg, /NaN|undefined/, `${id}: figuur klopt niet`);
  }
  for (const id of [...Object.keys(GUIDE), ...Object.keys(FIG)]) assert.ok(E[id], `uitleg of figuur voor onbekende oefening: ${id}`);
});
