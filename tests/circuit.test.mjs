// Bio-circuit: altijd 30 minuten, status op vaste dagen, gewichten per toestel en samenvoegen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../training/program.js';
import { planFor, stationsOf, DEFAULT_STATIONS, SESSION_SECONDS } from '../training/sports/biocircuit/index.js';

const MA = '2026-11-23', DI = '2026-11-24', WO = '2026-11-25', DO = '2026-11-26';
const prog = days => { const p = P.emptyProgress(); P.setDays(p, days); return p; };

test('elk circuit duurt precies 30 minuten, bij elk aantal toestellen', () => {
  for (let n = 1; n <= 20; n++) {
    const st = Array.from({ length: n }, (_, i) => ({ id: 's' + i, n: 'Toestel ' + i }));
    const plan = planFor(st);
    assert.equal(plan.reduce((a, x) => a + x.s, 0), SESSION_SECONDS, `${n} toestellen`);
    assert.ok(plan.every(x => x.s > 0), `${n} toestellen: geen lege stap`);
    assert.equal(plan[plan.length - 1].ph, 0, 'eindigt met werken, niet met wisselen');
  }
});

test('standaard: 10 toestellen, 2 rondes, 60 s werken en 30 s wisselen', () => {
  const plan = planFor(stationsOf(P.emptyProgress()));
  assert.equal(plan.filter(x => x.ph === 0).length, 20);
  assert.equal(plan[0].s, 60); assert.equal(plan[1].s, 30);
  assert.equal(stationsOf(P.emptyProgress()).length, DEFAULT_STATIONS.length);
});

test('eigen toestellen blijven bewaard, ook na trainingsdagen wijzigen', () => {
  const p = prog([1, 4]);
  p.settings.stations = [{ id: 'leg-press', n: 'Leg press' }, { id: 'glute', n: 'Glute' }];
  P.setDays(p, [2]);
  const n = P.normalize(JSON.parse(JSON.stringify(p)));
  assert.deepEqual(n.settings.stations.map(x => x.id), ['leg-press', 'glute']);
  assert.deepEqual(n.settings.days, [2]);
});

test('status: vandaag trainen, gedaan, volgende dag', () => {
  const p = prog([1, 4]);
  assert.equal(P.circuitStatus(p, MA).line, 'Vandaag trainen');
  assert.equal(P.circuitStatus(p, DI).line, 'Volgende training do 26 nov');
  P.record(p, P.nextSessionNo(p), MA);
  assert.equal(P.circuitStatus(p, MA).line, 'Vandaag gedaan · volgende do 26 nov');
  assert.equal(P.record(p, P.nextSessionNo(p), WO).bonus, true);
  assert.equal(P.sessionCount(p), 2);
  assert.equal(P.nextSessionNo(p), 3);
  assert.equal(P.circuitStatus(prog([]), MA).line, 'Kies je trainingsdagen');
});

test('laatste gewicht per toestel', () => {
  const p = prog([1, 4]);
  P.record(p, 1, MA).w = { 'leg-press': 40, 'chest-press': 20 };
  P.record(p, 2, DO).w = { 'leg-press': 45 };
  assert.deepEqual(P.lastWeights(p), { 'leg-press': { w: 45, d: DO }, 'chest-press': { w: 20, d: MA } });
});

test('samenvoegen: later ingevulde gewichten winnen van de oude versie', async () => {
  const a = prog([1, 4]); const x = P.record(a, 1, MA);
  const server = JSON.parse(JSON.stringify(a));
  await new Promise(r => setTimeout(r, 5));
  x.w = { 'leg-press': 50 }; x.u = new Date().toISOString();
  assert.deepEqual(P.merge(a, server).log[0].w, { 'leg-press': 50 });
  assert.deepEqual(P.merge(server, a).log[0].w, { 'leg-press': 50 });
});
