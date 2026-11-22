// Planning met vaste trainingsdagen, bonustraining, reeks en samenvoegen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../training/program.js';

// 2026-11-23 is een maandag.
const MA = '2026-11-23', DI = '2026-11-24', WO = '2026-11-25', DO = '2026-11-26', VR = '2026-11-27', ZA = '2026-11-28';
const prog = days => { const p = P.emptyProgress(); P.setDays(p, days); return p; };

test('zonder trainingsdagen: geen planning, wel status', () => {
  const p = P.emptyProgress();
  assert.deepEqual(P.schedule(p, 30, MA), []);
  assert.equal(P.status(p, 30, MA).line, 'Kies je trainingsdagen');
});

test('lessen vallen op de trainingsdagen (ma/wo/vr)', () => {
  const p = prog([1, 3, 5]);
  const s = P.schedule(p, 30, MA);
  assert.equal(s.length, 30);
  assert.deepEqual(s.slice(0, 4), [{ les: 1, d: MA }, { les: 2, d: WO }, { les: 3, d: VR }, { les: 4, d: '2026-11-30' }]);
  assert.equal(s[29].d, '2027-01-29'); // vrijdag van week 10 bij 3 dagen per week
});

test('op een rustdag start de planning op de volgende trainingsdag', () => {
  const p = prog([1, 3, 5]);
  assert.equal(P.schedule(p, 30, DI)[0].d, WO);
  assert.equal(P.status(p, 30, DI).line, 'Les 1 op wo 25 nov');
});

test('vandaag getraind: volgende les op de volgende trainingsdag', () => {
  const p = prog([1, 3, 5]);
  P.record(p, 1, MA);
  assert.equal(P.nextLesson(p, 30), 2);
  assert.deepEqual(P.schedule(p, 30, MA)[0], { les: 2, d: WO });
  assert.match(P.status(p, 30, MA).line, /^Vandaag gedaan/);
});

test('gemiste trainingsdag schuift door zonder strafpunten', () => {
  const p = prog([1, 3, 5]);
  P.record(p, 1, MA);
  assert.deepEqual(P.schedule(p, 30, DO)[0], { les: 2, d: VR });
});

test('bonustraining op een vrije dag telt mee en loopt voor op schema', () => {
  const p = prog([1, 3, 5]);
  P.record(p, 1, MA);
  const x = P.record(p, 2, DI);
  assert.equal(x.bonus, true);
  assert.equal(P.record(p, 3, WO).bonus, false);
  assert.equal(P.bonusCount(p), 1);
  assert.deepEqual(P.schedule(p, 30, WO)[0], { les: 4, d: VR });
});

test('reeks telt trainingsdagen; bonusdagen breken niets', () => {
  const p = prog([1, 3, 5]);
  P.record(p, 1, MA); P.record(p, 2, DI); P.record(p, 3, WO);
  assert.equal(P.streak(p, DO), 2);
  assert.equal(P.streak(p, VR), 2, 'vandaag nog niet getraind telt niet als gemist');
  assert.equal(P.streak(p, ZA), 0, 'vrijdag gemist');
});

test('opnieuw doen van een les verandert de volgende les niet', () => {
  const p = prog([1, 3, 5]);
  P.record(p, 1, MA); P.record(p, 1, WO);
  assert.equal(P.nextLesson(p, 30), 2);
  assert.equal(P.doneCount(p, 30), 1);
});

test('week: trainingen deze week van het aantal trainingsdagen', () => {
  const p = prog([1, 3, 5]);
  P.record(p, 1, MA); P.record(p, 2, DI);
  assert.deepEqual(P.thisWeek(p, ZA), { done: 2, planned: 3 });
});

test('samenvoegen: log wordt verenigd, nieuwste instellingen winnen', async () => {
  const a = prog([1, 3, 5]); P.record(a, 1, MA);
  const b = JSON.parse(JSON.stringify(a));
  P.record(b, 2, WO);
  await new Promise(r => setTimeout(r, 5));
  P.setDays(a, [2, 4]); P.record(a, 2, DO);
  const m = P.merge(a, b);
  assert.equal(m.log.length, 3);
  assert.deepEqual(m.settings.days, [2, 4]);
  assert.ok(P.same(m, P.merge(b, a)), 'volgorde maakt niet uit');
});

test('resetten komt ook door op een andere telefoon', async () => {
  const a = prog([1, 3, 5]); P.record(a, 1, MA);
  const b = JSON.parse(JSON.stringify(a));
  await new Promise(r => setTimeout(r, 5));
  P.reset(a);
  assert.equal(P.merge(a, b).log.length, 0);
  await new Promise(r => setTimeout(r, 5));
  P.record(b, 1, WO);
  assert.equal(P.merge(a, b).log.length, 1, 'na de reset gedaan blijft staan');
});

test('Training opent het meest relevante programma', () => {
  const pil = days => { const p = prog(days); return { id: 'pilates30', kind: 'lessons', total: 30, data: p }; };
  const bio = days => { const p = prog(days); return { id: 'biocircuit', kind: 'circuit', total: 0, data: p }; };
  // MA = maandag. Pilates op wo, Bio-circuit op ma → vandaag Bio-circuit.
  assert.equal(P.pickProgram([pil([3]), bio([1])], 'pilates30', MA), 'biocircuit');
  // Vandaag al getraind in Bio-circuit → eerstvolgende: Pilates woensdag (Bio-circuit pas volgende maandag).
  const b = bio([1]); P.record(b.data, 1, MA);
  assert.equal(P.pickProgram([pil([3]), b], 'biocircuit', MA), 'pilates30');
  // Zelfde dag → het laatst gebruikte wint.
  assert.equal(P.pickProgram([pil([3]), bio([3])], 'biocircuit', MA), 'biocircuit');
  assert.equal(P.pickProgram([pil([3]), bio([3])], 'pilates30', MA), 'pilates30');
  // Geen trainingsdagen ingesteld → laatst gebruikte, anders de eerste.
  assert.equal(P.pickProgram([pil([]), bio([])], 'biocircuit', MA), 'biocircuit');
  assert.equal(P.pickProgram([pil([])], null, MA), 'pilates30');
  assert.equal(P.pickProgram([], 'pilates30', MA), null);
});

test('starttijd bij de trainingsdagen: bewaard, opgeschoond en weg te halen', () => {
  const a = prog([1, 3]);
  P.setDays(a, [1, 3], '07:15'); assert.equal(a.settings.time, '07:15');
  assert.equal(P.normalize(a).settings.time, '07:15', 'blijft na normaliseren');
  P.setDays(a, [2]); assert.equal(a.settings.time, '07:15', 'zonder tijd blijft de tijd');
  P.setDays(a, [2], ''); assert.equal(a.settings.time, undefined, 'leeg haalt de tijd weg');
  assert.equal(P.normalize({ settings: { days: [1], time: 'ochtend' } }).settings.time, undefined, 'ongeldige tijd valt weg');
});

