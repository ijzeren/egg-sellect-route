// Agenda: afspraken uit Egg-sellent (ronde, leveringen) en Training, afgeleid zonder ze op te slaan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { externalItems, dayItems, WALK_END } from '../agenda/plan.js';

const people = [{ id: 'p-lynn', user_id: 'u-lynn', name: 'Lynn' }, { id: 'p-marien', user_id: 'u-marien', name: 'Marien' }, { id: 'p-kind', user_id: null, name: 'Kind' }];
const programs = [{ id: 'pilates30', name: 'Pilates 30', minutes: 30 }];

test('eierronde op de loopdagen, met starttijd tot 21:00, in de agenda van de lopers', () => {
  const ext = externalItems({ eggs: true, walkDays: [3, 4], walkStart: { 3: '15:30' }, walkers: ['u-lynn'], people });
  const wo = dayItems(ext, '2026-11-25', 'p-lynn'), do_ = dayItems(ext, '2026-11-26', 'p-lynn');
  assert.equal(wo.length, 1); assert.equal(wo[0].title, 'Eierronde'); assert.equal(wo[0].start, '15:30'); assert.equal(wo[0].end, WALK_END);
  assert.equal(do_[0].start, '', 'zonder starttijd geen tijd'); assert.equal(do_[0].end, '');
  assert.equal(dayItems(ext, '2026-11-25', 'p-marien').length, 0, 'niet bij wie niet loopt');
  assert.equal(dayItems(ext, '2026-11-27', 'p-lynn').length, 0, 'vrijdag geen loopdag');
});

test('afwezige dag: de ronde gaat niet door', () => {
  const ext = externalItems({ eggs: true, walkDays: [3], walkStart: { 3: '15:30' }, walkers: ['u-lynn'], absences: ['2026-11-25'], people });
  assert.equal(dayItems(ext, '2026-11-25', 'p-lynn').length, 0);
  assert.equal(dayItems(ext, '2026-12-02', 'p-lynn').length, 1);
});

test('leveringen op de leverdatum, besteld of geleverd (min kapot); verwijderde niet', () => {
  const ext = externalItems({ eggs: true, walkers: ['u-lynn'], people, deliveries: [
    { id: 'a', kind: 'delivery', date: '2026-11-25', ordered: 780, delivered: null },
    { id: 'b', kind: 'delivery', date: '2026-11-18', ordered: 690, delivered: 690, broken: 6 },
    { id: 'c', kind: 'delivery', date: '2026-11-25', ordered: 780, deleted: true },
    { id: 'd', kind: 'count', date: '2026-11-25', counted: 10 },
    { id: 'e', kind: 'delivery', date: '2026-11-25', ordered: 0, delivered: null },
  ] });
  assert.deepEqual(dayItems(ext, '2026-11-25', 'p-lynn').map(x => x.title), ['Levering eieren · 780 besteld']);
  assert.deepEqual(dayItems(ext, '2026-11-18', 'p-lynn').map(x => x.title), ['Levering eieren · 684 geleverd']);
});

test('zonder toegang tot Egg-sellent: geen ronde en geen leveringen', () => {
  const ext = externalItems({ eggs: false, walkDays: [3], walkStart: { 3: '15:30' }, walkers: ['u-lynn'], people, deliveries: [{ id: 'a', kind: 'delivery', date: '2026-11-25', ordered: 1 }] });
  assert.equal(ext.length, 0);
});

test('trainingen op de trainingsdagen, in de agenda van de deelnemers, met eindtijd uit de duur', () => {
  const tracks = [
    { id: 't1', program: 'pilates30', participants: ['u-lynn', 'u-marien'], data: { settings: { days: [1, 3], time: '07:15' } } },
    { id: 't2', program: 'pilates30', participants: ['u-marien'], data: { settings: { days: [] } } },
    { id: 't3', program: 'onbekend', participants: ['u-lynn'], deleted: true, data: { settings: { days: [2] } } },
  ];
  const ext = externalItems({ tracks, programs, people });
  const ma = dayItems(ext, '2026-11-23', 'p-marien');
  assert.equal(ma.length, 1); assert.equal(ma[0].title, 'Pilates 30'); assert.equal(ma[0].start, '07:15'); assert.equal(ma[0].end, '07:45');
  assert.equal(dayItems(ext, '2026-11-23', 'p-kind').length, 0);
  assert.equal(dayItems(ext, '2026-11-24', 'p-lynn').length, 0, 'verwijderd programma niet');
  assert.ok(ext.every(x => x.ext && x.ext.href), 'elke afspraak verwijst naar de app');
});

test('training: starttijd per dag', () => {
  const tracks = [{ id: 't1', program: 'pilates30', participants: ['u-lynn'], data: { settings: { days: [1, 3, 5], times: { 1: '07:15', 3: '19:30' } } } }];
  const ext = externalItems({ tracks, programs, people });
  assert.equal(dayItems(ext, '2026-11-23', 'p-lynn')[0].start, '07:15', 'maandag');
  assert.equal(dayItems(ext, '2026-11-25', 'p-lynn')[0].start, '19:30', 'woensdag');
  assert.equal(dayItems(ext, '2026-11-25', 'p-lynn')[0].end, '20:00');
  assert.equal(dayItems(ext, '2026-11-27', 'p-lynn')[0].start, '', 'vrijdag zonder tijd');
});
