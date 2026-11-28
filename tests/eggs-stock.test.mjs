// Egg-sellent voorraad (stockAt in eggs/index.html): elke verkoop gaat er meteen af; een telling geldt vóór of na de ronde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../eggs/index.html', import.meta.url), 'utf8');
const grab = name => { const i = html.indexOf(`function ${name}(`); assert.ok(i > 0, name); let d = 0, j = html.indexOf('{', i);
  for (; j < html.length; j++) { if (html[j] === '{') d++; else if (html[j] === '}' && --d === 0) break; } return html.slice(i, j + 1); };
const adjLine = html.match(/const isAdjust = [^\n]+/)[0];
function make(stock, visits){
  const src = `const sum = (a, f) => a.reduce((s, x) => s + f(x), 0); const DEC = v => v.status !== 'nothome';
    const db = { stock: ${JSON.stringify(stock)}, visits: ${JSON.stringify(visits)} }; const stockEvents = () => db.stock;
    ${adjLine} ${grab('salesByDate')} ${grab('stockAt')} return stockAt;`;
  return new Function(src)();
}
const v = (date, eggs) => ({ date, eggs, status: 'sold' });
// productie 18–26 nov 2026
const STOCK = [
  { id: 'd1', date: '2026-11-18', kind: 'delivery', ordered: 690, delivered: 690, broken: 0 },
  { id: 'c1', date: '2026-11-22', kind: 'count', counted: 0 },
  { id: 'd2', date: '2026-11-25', kind: 'delivery', ordered: 780, delivered: 780, broken: 1 },
  { id: 'c2', date: '2026-11-25', kind: 'count', counted: 779 },
];
const SALES = [v('2026-11-18', 324), v('2026-11-19', 330), v('2026-11-20', 6), v('2026-11-25', 334), v('2026-11-26', 274)];

test('telling na de ronde (oud gedrag): verkoop van die dag wordt "meer geteld"', () => {
  const r = make(STOCK, SALES)('2026-11-26');
  assert.equal(r.stock, 505); assert.equal(r.found, 334);
});

test('telling vóór de ronde: de verkoop van die dag gaat er nog af', () => {
  const st = STOCK.map(e => e.id === 'c2' ? { ...e, moment: 'start' } : e);
  const r = make(st, SALES)('2026-11-26');
  assert.equal(r.stock, 171); assert.equal(r.found, 0); assert.equal(r.diffs.c2.diff, 0);
  const d25 = r.days.find(d => d.date === '2026-11-25');
  assert.deepEqual([d25.begin, d25.inn, d25.sold, d25.end], [0, 779, 334, 445]);
});

test('elke verkoop gaat meteen af, ook op de leverdag zonder telling', () => {
  const r = make(STOCK.filter(e => e.id !== 'c2'), SALES)('2026-11-25');
  assert.equal(r.stock, 445);
});

test('correcties: eraf en erbij, op hun datum', () => {
  const st = [...STOCK.map(e => e.id === 'c2' ? { ...e, moment: 'start' } : e),
    { id: 'a1', date: '2026-11-26', kind: 'adjust', qty: -6, note: 'Eigen gebruik' },
    { id: 'a2', date: '2026-11-26', kind: 'adjust', qty: 2 },
    { id: 'a3', date: '2026-11-26', kind: 'adjust', qty: null }];
  const r = make(st, SALES)('2026-11-26');
  assert.equal(r.stock, 167); assert.equal(r.adjOut, 6); assert.equal(r.adjIn, 2);
  assert.equal(make(st, SALES)('2026-11-25').stock, 445, 'correctie telt pas vanaf haar datum');
});

test('een levering achteraf wijzigen rekent alles opnieuw', () => {
  const st = STOCK.filter(e => e.kind === 'delivery').map(e => e.id === 'd2' ? { ...e, broken: 13 } : e);
  assert.equal(make(st, SALES)('2026-11-26').stock, 690 - 660 + 767 - 334 - 274);
});
