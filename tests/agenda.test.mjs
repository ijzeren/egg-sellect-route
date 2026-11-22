// Agenda: wat is er op welke dag, even/oneven weken, uitval, huiswerk en rooster plakken.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as A from '../agenda/plan.js';

// 2026-11-23 is een maandag (week 48).
const MA = '2026-11-23', WO = '2026-11-25', ZA = '2026-11-28', MA2 = '2026-11-30';
const voetbal = { id: 'v', kind: 'sport', title: 'Voetbal', person_ids: ['daan'], start: '18:00', days: [3], skip: [] };
const wedstrijd = { id: 'w', kind: 'match', title: 'Uit', person_ids: ['daan'], meet: '09:15', start: '10:00', date: ZA, days: [] };
const wis = { id: 'l1', kind: 'lesson', title: 'Wiskunde', person_ids: ['lynn'], start: '08:30', days: [1], from: '2026-08-01', until: '2027-07-31' };
const eng = { id: 'l2', kind: 'lesson', title: 'Engels', person_ids: ['lynn'], start: '09:20', days: [1, 4] };

test('weeknummers (ISO)', () => {
  assert.equal(A.isoWeek(MA), 48);
  assert.equal(A.isoWeek('2027-01-01'), 53);
  assert.equal(A.isoWeek('2026-01-01'), 1);
});

test('wekelijks, één keer, per persoon en op tijd (verzamelen telt)', () => {
  const items = [voetbal, wedstrijd, wis, eng];
  assert.deepEqual(A.dayItems(items, WO).map(x => x.id), ['v']);
  assert.deepEqual(A.dayItems(items, ZA).map(x => x.id), ['w']);
  assert.deepEqual(A.dayItems(items, MA).map(x => x.id), ['l1', 'l2']);
  assert.deepEqual(A.dayItems(items, MA, 'daan'), []);
  assert.equal(A.occursOn(wis, '2027-08-02'), false, 'na het schooljaar');
});

test('gaat één keer niet door', () => {
  const it = { ...voetbal, skip: [WO] };
  assert.equal(A.occursOn(it, WO), false);
  assert.equal(A.occursOn(it, '2026-12-02'), true);
});

test('even en oneven weken', () => {
  const even = { ...eng, weeks: 'even' };
  assert.equal(A.occursOn(even, MA), true);   // week 48
  assert.equal(A.occursOn(even, MA2), false); // week 49
  assert.equal(A.occursOn({ ...eng, weeks: 'odd' }, MA2), true);
});

test('volgende les van een vak (voor de inleverdatum)', () => {
  const items = [wis, eng];
  assert.equal(A.nextLesson(items, 'lynn', 'engels', MA), '2026-11-26');
  assert.equal(A.nextLesson(items, 'lynn', 'Wiskunde', MA), MA2);
  assert.equal(A.nextLesson(items, 'daan', 'Engels', MA), null);
  assert.deepEqual(A.subjects(items, 'lynn'), ['Engels', 'Wiskunde']);
});

test('huiswerk: te laat eerst, vandaag/morgen', () => {
  const tasks = [
    { id: 1, person_id: 'lynn', text: 'a', due: '2026-11-27', done: false },
    { id: 2, person_id: 'lynn', text: 'b', due: '2026-11-20', done: false },
    { id: 3, person_id: 'lynn', text: 'c', due: '2026-11-24', done: false },
    { id: 4, person_id: 'daan', text: 'd', due: '2026-11-24', done: true },
  ];
  assert.deepEqual(A.openTasks(tasks).map(t => t.id), [2, 3, 1]);
  assert.deepEqual(A.dueSoon(tasks, 'lynn', MA).map(t => t.id), [2, 3]);
  assert.equal(A.dueLabel('2026-11-20', MA), 'te laat');
  assert.equal(A.dueLabel(MA, MA), 'vandaag');
  assert.equal(A.dueLabel('2026-11-24', MA), 'morgen');
});

test('rooster plakken', () => {
  const r = A.parseTimetable('8:30-9:20 Wiskunde, 1.12\n9.20 - 10.10 Engels\nPauze\n\n10:30 Gym, zaal 2, achter\n25:00-26:00 Fout');
  assert.deepEqual(r.lessons, [
    { start: '08:30', end: '09:20', title: 'Wiskunde', place: '1.12' },
    { start: '09:20', end: '10:10', title: 'Engels', place: '' },
    { start: '10:30', end: '', title: 'Gym', place: 'zaal 2, achter' },
  ]);
  assert.deepEqual(r.bad, ['Pauze', '25:00-26:00 Fout']);
});

test('afspraak opschonen en controleren', () => {
  const c = A.cleanItem({ kind: 'x', title: ' Tennis ', person_ids: ['daan', 'daan'], start: '16:00', end: '15:00', days: [2, '2', 9] });
  assert.equal(c.kind, 'other');
  assert.deepEqual(c.person_ids, ['daan']);
  assert.deepEqual(c.days, [2]);
  assert.equal(A.validItem(c), 'De eindtijd ligt voor de begintijd.');
  assert.equal(A.validItem(A.cleanItem({ title: 'X', person_ids: ['a'] })), 'Kies een datum of de dagen waarop het elke week is.');
  const once = A.cleanItem({ title: 'Tandarts', person_ids: ['a'], date: ZA, days: [1], skip: [MA] });
  assert.deepEqual([once.date, once.days, once.skip], [ZA, [], []]);
  assert.deepEqual(A.schoolYear('2026-11-22'), { from: '2026-08-01', until: '2027-07-31' });
  assert.deepEqual(A.schoolYear('2027-03-01'), { from: '2026-08-01', until: '2027-07-31' });
});

test('elke week, maar met een andere tijd per dag', async () => {
  const A = await import('../agenda/plan.js');
  const c = A.cleanItem({ kind: 'sport', title: 'Zwemmen', person_ids: ['p1'], days: [1, 3], start: '16:00', end: '17:00', perDay: true,
    dayTimes: { 1: { start: '16:00', end: '17:00' }, 3: { start: '18:30', end: '19:15' }, 5: { start: '09:00' } } });
  assert.deepEqual(c.dayTimes, { 1: { start: '16:00', end: '17:00' }, 3: { start: '18:30', end: '19:15' } }, 'alleen dagen van de afspraak');
  assert.equal(A.validItem(c), '');
  const ma = A.dayItems([{ ...c, id: 'x' }], '2026-11-23'), wo = A.dayItems([{ ...c, id: 'x' }], '2026-11-25');
  assert.equal(ma[0].start, '16:00'); assert.equal(wo[0].start, '18:30'); assert.equal(wo[0].end, '19:15');
  assert.deepEqual(A.cleanItem({ ...c, perDay: false }).dayTimes, {}, 'zelfde tijd: geen tijden per dag');
  assert.deepEqual(A.cleanItem({ ...c, date: '2026-11-23', perDay: true }).dayTimes, {}, 'één keer: geen tijden per dag');
  const bad = A.cleanItem({ ...c, perDay: true, dayTimes: { 3: { start: '19:00', end: '18:00' } } });
  assert.match(A.validItem(bad), /woensdag/);
  assert.equal(A.timesOn({ days: [1], start: '08:00', end: '', dayTimes: {} }, '2026-11-23').start, '08:00', 'zonder tijd per dag: algemene tijd');
});
