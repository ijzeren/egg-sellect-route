// Financiën: bedragen, regels, overzicht per maand, vaste lasten, zoeken. Alleen nepgegevens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../finance/money.js';

const cats = [
  { id: 'c-food', name: 'Boodschappen', grp: 'household' }, { id: 'c-pay', name: 'Salaris', grp: 'income' },
  { id: 'c-energy', name: 'Energie en water', grp: 'fixed' }, { id: 'c-old', name: 'Weg', grp: 'other', deleted: true },
];
const tx = (id, booked_on, amount, counterparty, extra = {}) => ({ id, account_id: 'a1', ext_id: id, booked_on, amount, counterparty, description: '', category_id: null, category_by: '', excluded: false, ...extra });

test('bedragen tonen', () => {
  assert.equal(M.fmt(123456), '€ 1.234,56');
  assert.equal(M.fmt(-1250), '−€ 12,50');
  assert.equal(M.fmt(1250, { sign: true }), '+€ 12,50');
  assert.equal(M.fmt(5), '€ 0,05');
  assert.equal(M.fmt(123456789, { whole: true }), '€ 1.234.568');
  assert.equal(M.cents(0.1 + 0.2), 30);
  assert.equal(M.addMonths('2026-01', -1), '2025-12');
  assert.equal(M.addMonths('2026-11', 3), '2027-02');
  assert.equal(M.monthName('2026-03'), 'maart 2026');
});

test('regels: tekst, richting, specifiekste eerst, zelf gekozen blijft', () => {
  const rules = [
    { id: 'r1', field: 'counterparty', pattern: 'albert', direction: '', category_id: 'c-food' },
    { id: 'r2', field: 'counterparty', pattern: 'Albert Heijn Online', direction: 'out', category_id: 'c-energy' },
    { id: 'r3', field: 'description', pattern: 'salaris', direction: 'in', category_id: 'c-pay' },
  ];
  assert.equal(M.categorize(rules, tx('1', '2026-01-02', -10, 'ALBERT HEIJN 1234')), 'c-food');
  assert.equal(M.categorize(rules, tx('2', '2026-01-02', -10, 'Albert  Heijn online')), 'c-energy', 'langste tekst wint, spaties en hoofdletters maken niet uit');
  assert.equal(M.categorize(rules, tx('3', '2026-01-02', 2500, 'Werkgever', { description: 'Salaris januari' })), 'c-pay');
  assert.equal(M.categorize(rules, tx('4', '2026-01-02', -2500, 'Werkgever', { description: 'Salaris terug' })), null, 'richting "bij" telt niet voor afschrijvingen');
  const txs = [tx('1', '2026-01-02', -10, 'Albert Heijn'), tx('5', '2026-01-02', -10, 'Albert Heijn', { category_id: 'c-pay', category_by: 'manual' }), tx('6', '2026-01-02', -10, 'Jumbo', { category_id: 'c-food', category_by: 'rule' })];
  assert.deepEqual(M.ruleChanges(rules, txs), [{ id: '1', category_id: 'c-food' }, { id: '6', category_id: null }]);
});

test('voorstel voor een regel uit de tegenpartij', () => {
  assert.equal(M.suggestPattern('Albert Heijn 1234 UTRECHT'), 'Albert Heijn');
  assert.equal(M.suggestPattern('NS GROEP IZ NS REIZIGERS'), 'NS GROEP IZ NS REIZIGERS');
  assert.equal(M.suggestPattern('Eneco Services B.V.'), 'Eneco Services');
  assert.equal(M.suggestPattern('1234 Shop'), 'Shop');
  assert.equal(M.suggestPattern('CCV*BAKKERIJ DE ZON'), 'CCV BAKKERIJ DE ZON');
});

test('overzicht per maand: bij, af, per soort, niet ingedeeld, telt niet mee, verwijderde soort', () => {
  const txs = [
    tx('1', '2026-02-01', 2500, 'Werkgever', { category_id: 'c-pay' }),
    tx('2', '2026-02-03', -45.1, 'AH', { category_id: 'c-food' }),
    tx('3', '2026-02-04', -20.2, 'Jumbo', { category_id: 'c-food' }),
    tx('4', '2026-02-05', -9.99, 'Onbekend'),
    tx('5', '2026-02-06', -500, 'Spaarrekening', { excluded: true }),
    tx('6', '2026-02-07', -1, 'Oud', { category_id: 'c-old' }),
    tx('7', '2026-01-31', -100, 'AH', { category_id: 'c-food' }),
  ];
  const s = M.summary(txs, cats, '2026-02');
  assert.equal(s.inC, 250000); assert.equal(s.outC, -7629); assert.equal(s.netC, 242371);
  assert.deepEqual(s.cats.map(x => [x.id, x.c, x.n]), [['c-pay', 250000, 1], ['c-food', -6530, 2]]);
  assert.equal(s.open, 2); assert.equal(s.openC, -1099); assert.equal(s.excluded, 1);
  assert.deepEqual(M.byGroup(s).map(g => [g.g, g.c]), [['income', 250000], ['household', -6530]]);
  const av = M.averages(txs, cats, '2026-02');
  assert.equal(av.months, 1); assert.equal(av.avg.get('c-food'), -10000);
});

test('vaste lasten: elke maand ongeveer hetzelfde bedrag', () => {
  const txs = [];
  for (const [m, amt] of [['2026-06', -82.5], ['2026-07', -82.5], ['2026-08', -85], ['2026-09', -82.5], ['2026-10', -82.5]]) txs.push(tx('e' + m, `${m}-24`, amt, 'Eneco Services B.V.', { category_id: 'c-energy' }));
  for (const m of ['2026-08', '2026-09', '2026-10']) txs.push(tx('n' + m, `${m}-01`, -12.99, 'Netflix International'));
  for (let d = 1; d <= 20; d++) txs.push(tx('ah' + d, `2026-10-${String(d).padStart(2, '0')}`, -30, 'Albert Heijn 1234'));
  txs.push(tx('x', '2026-09-03', -400, 'Eenmalig'), tx('y', '2026-08-03', -400, 'Eenmalig'));
  const r = M.recurring(txs, '2026-11-10');
  assert.deepEqual(r.map(x => x.name), ['Eneco Services', 'Netflix International']);
  const e = r[0];
  assert.equal(e.c, -8250); assert.equal(e.day, 24); assert.equal(e.last, '2026-10-24'); assert.equal(e.next, '2026-11-24'); assert.equal(e.category_id, 'c-energy');
  assert.equal(r[1].next, '2026-11-01');
});

test('zoeken en filteren', () => {
  const txs = [tx('1', '2026-02-01', -10, 'Albert Heijn', { category_id: 'c-food' }), tx('2', '2026-02-02', -5, 'Bakker', { description: 'Brood' }), tx('3', '2026-03-01', -500, 'Spaar', { excluded: true })];
  assert.deepEqual(M.filter(txs, cats, { m: '2026-02' }).map(t => t.id), ['2', '1'], 'nieuwste eerst');
  assert.deepEqual(M.filter(txs, cats, { cat: 'open' }).map(t => t.id), ['2']);
  assert.deepEqual(M.filter(txs, cats, { cat: 'excluded' }).map(t => t.id), ['3']);
  assert.deepEqual(M.filter(txs, cats, { cat: 'c-food' }).map(t => t.id), ['1']);
  assert.deepEqual(M.filter(txs, cats, { q: 'brood' }).map(t => t.id), ['2']);
  assert.deepEqual(M.filter(txs, cats, { q: 'albért' }).map(t => t.id), ['1'], 'accenten maken niet uit');
});
