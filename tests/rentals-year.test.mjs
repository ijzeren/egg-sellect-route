// Verhuur: kosten, begroting en jaaroverzicht. Alleen verzonnen bedragen (de repository is openbaar).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from '../rentals/year.js';

const house = { id: 'h1', stars: null, tax: {}, settings: { cleaning: 100, linen: 50, costs: { commission_percent: 15, commission_vat: 21, other_costs: 30, payout_percent: 75 } } };
const bk = (x = {}) => ({ id: x.id || 'b' + Math.random(), house_id: 'h1', source: 'booking', status: 'booked', tax_by: 'platform', guests: 4, adults: 4, arrival: '2026-07-01', departure: '2026-07-05', ...x });
const cat = (id, kind, x = {}) => ({ id, house_id: 'h1', name: id, kind, from_booking: null, own_share: true, sort: 0, deleted: false, ...x });

test('commissie: (uitbetaling − schoonmaak − bedlinnen) × percentage plus btw', () => {
  assert.equal(Y.commissionFor(Y.costRules(house), 1000, 100, 50), 154.28);
  assert.equal(Y.commissionFor(Y.costRules({ settings: {} }), 1000, 100, 50), 0);
  assert.equal(Y.commissionFor(Y.costRules({ settings: { costs: { commission_percent: 10, commission_vat: 0 } } }), 500, 0, 0), 50);
});

test('platformboeking: uitbetaling is de opbrengst, kosten uit het huis als ze ontbreken', () => {
  const m = Y.bookingMoney(bk(), { payout: 1000 }, house);
  assert.deepEqual([m.revenue, m.cleaning, m.linen, m.commission, m.other_costs, m.costs, m.net, m.estimated], [1000, 100, 50, 154.28, 30, 334.28, 665.72, false]);
});

test('bedragen bij de boeking gaan voor; zonder uitbetaling een schatting', () => {
  const m = Y.bookingMoney(bk(), { payout: 1000, cleaning: 80, linen: 0, commission: 150, other_costs: 0 }, house);
  assert.deepEqual([m.costs, m.net], [230, 770]);
  const e = Y.bookingMoney(bk(), { accommodation: 1000 }, house);
  assert.deepEqual([e.revenue, e.estimated], [750, true]);
  assert.equal(Y.bookingMoney(bk(), {}, house).revenue, null);
});

test('platform int de taxe niet zelf: die gaat van de uitbetaling af', () => {
  assert.equal(Y.bookingMoney(bk({ tax_by: 'host' }), { payout: 1000, tourist_tax: 20 }, house).revenue, 980);
});

test('directe boeking: huur + schoonmaak + bedlinnen, zonder toeristenbelasting', () => {
  const m = Y.bookingMoney(bk({ source: 'direct', tax_by: 'host' }), { night_price: 200, cleaning: 100, linen: 50, tourist_tax: 30 }, house);
  assert.equal(m.revenue, 950);
});

test('eigen gebruik: geen opbrengst en geen commissie, wel kosten en bijdrage', () => {
  const m = Y.bookingMoney(bk({ source: 'own', tax_by: 'none' }), { accommodation: 60 }, house);
  assert.deepEqual([m.revenue, m.contribution, m.commission, m.other_costs, m.costs], [0, 60, 0, 0, 150]);
});

test('jaaroverzicht: resultaat, eigen gebruik naar rato, dekking en investeringen apart', () => {
  const categories = [
    cat('energie', 'usage'), cat('ib', 'tax', { own_share: false }), cat('reno', 'investment', { own_share: false }),
    cat('schoon', 'booking', { from_booking: 'cleaning' }), cat('weg', 'usage', { deleted: true }),
  ];
  const bookings = [
    bk({ id: 'r1', arrival: '2026-03-01', departure: '2026-03-07' }),                  // 6 nachten verhuurd
    bk({ id: 'r2', source: 'airbnb', arrival: '2026-08-01', departure: '2026-08-03', country: 'Duitsland' }), // 2 nachten
    bk({ id: 'o1', source: 'own', tax_by: 'none', arrival: '2026-05-01', departure: '2026-05-03' }), // 2 nachten eigen
    bk({ id: 'x1', status: 'expected', arrival: '2026-12-20', departure: '2026-12-24' }),
    bk({ id: 'c1', status: 'cancelled', arrival: '2026-06-01', departure: '2026-06-05' }),
    bk({ id: 'p1', arrival: '2025-12-30', departure: '2026-01-02' }),                  // vorig jaar
  ];
  const amounts = {
    r1: { payout: 1000, cleaning: 100, linen: 50, commission: 100, other_costs: 50 },  // kosten 300
    r2: { payout: 500, cleaning: 100, linen: 0, commission: 50, other_costs: 0 },      // kosten 150
    o1: { cleaning: 100, linen: 0, accommodation: 20 },
    x1: { payout: 800, cleaning: 100, linen: 0, commission: 0, other_costs: 0 },
  };
  const costs = [
    { house_id: 'h1', category_id: 'energie', date: '2026-02-01', amount: 1000, deleted: false },
    { house_id: 'h1', category_id: 'ib', date: '2026-04-01', amount: 400, deleted: false },
    { house_id: 'h1', category_id: 'reno', date: '2026-04-01', amount: 5000, deleted: false },
    { house_id: 'h1', category_id: 'energie', date: '2025-12-01', amount: 999, deleted: false },
    { house_id: 'h1', category_id: 'energie', date: '2026-02-01', amount: 999, deleted: true },
  ];
  const budgets = [{ house_id: 'h1', year: 2026, category_id: 'energie', amount: 1200 }, { house_id: 'h1', year: 2026, category_id: 'ib', amount: 800 }];
  const o = Y.yearOverview({ house, year: 2026, bookings, amounts, categories, costs, budgets });
  assert.deepEqual(o.nights, { rented: 8, own: 2, expected: 4, days: 365, empty: 355 });
  assert.deepEqual([o.revenue, o.bookingCosts, o.net], [1500, 450, 1050]);
  assert.deepEqual(o.operating, { budget: 2000, actual: 1400 });
  // eigen gebruik: 2 van 10 nachten × alleen energie (inkomstenbelasting telt niet mee) = 200
  assert.deepEqual(o.ownUse, { nights: 2, direct: 100, share: 200, contribution: 20, total: 280, ratio: 0.2 });
  assert.equal(o.result, 1050 - (1400 - 200));
  assert.deepEqual(o.investments, { budget: 0, actual: 5000 });
  assert.deepEqual(o.unbooked, { count: 0, budget: 0 });
  const o2 = Y.yearOverview({ house, year: 2026, bookings, amounts, categories, costs: [], budgets });
  assert.deepEqual(o2.unbooked, { count: 2, budget: 2000 });
  assert.deepEqual(o.expected, { revenue: 800, costs: 100, net: 700 });
  assert.deepEqual(o.coverage, { budget: 2000, net: 1750, pct: 88, toCover: 250 });
  assert.equal(o.rows.find(r => r.id === 'schoon').actual, 300); // r1 + r2 + eigen gebruik
  assert.equal(o.rows.find(r => r.id === 'schoon').expected, 100);
  assert.equal(o.rows.some(r => r.id === 'weg'), false);
  assert.deepEqual(o.channels.map(c => [c.key, c.count, c.nights]), [['airbnb', 1, 2], ['booking', 1, 6]]);
});

test('begroting overnemen: alleen wat dat jaar nog niet heeft', () => {
  const b = [{ house_id: 'h1', year: 2025, category_id: 'a', amount: 10 }, { house_id: 'h1', year: 2025, category_id: 'b', amount: 20 },
    { house_id: 'h1', year: 2026, category_id: 'b', amount: 25 }, { house_id: 'h1', year: 2025, category_id: 'c', amount: 0 }];
  assert.deepEqual(Y.copyBudget(b, 'h1', 2025, 2026), [{ house_id: 'h1', year: 2026, category_id: 'a', amount: 10 }]);
});

test('standaard kostensoorten: per boeking gekoppeld aan de bedragen, investeringen apart', () => {
  const fb = Y.DEFAULT_CATEGORIES.filter(c => c.kind === 'booking').map(c => c.from_booking).sort();
  assert.deepEqual(fb, ['cleaning', 'commission', 'linen', 'other_costs']);
  assert.ok(Y.DEFAULT_CATEGORIES.every(c => (c.kind === 'booking') === !!c.from_booking));
  assert.ok(Y.DEFAULT_CATEGORIES.some(c => c.kind === 'investment'));
});
