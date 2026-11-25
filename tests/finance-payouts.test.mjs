// Financiën → Verhuur: uitbetalingen van Booking.com en Airbnb herkennen, voorstellen en verdelen. Alleen nepgegevens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../finance/payouts.js';

const tx = (id, booked_on, amount, counterparty, description = '') => ({ id, booked_on, amount, counterparty, description });
const bk = (id, source, arrival, departure, extra = {}) => ({ id, source, arrival, departure, status: 'booked', deleted: false, external_id: '', ...extra });

test('platform herkennen: alleen bijschrijvingen', () => {
  assert.equal(P.platformOf(tx('1', '2026-07-13', 812.4, 'Airbnb Payments Luxembourg S.A.')), 'airbnb');
  assert.equal(P.platformOf(tx('2', '2026-08-03', 1500, 'Booking.com B.V.')), 'booking');
  assert.equal(P.platformOf(tx('3', '2026-08-03', 1500, 'Stichting X', 'Payout BOOKING COM 123')), 'booking');
  assert.equal(P.platformOf(tx('4', '2026-08-03', -15, 'Airbnb')), '', 'een afschrijving is geen uitbetaling');
  assert.equal(P.platformOf(tx('5', '2026-08-03', 50, 'Bakker')), '');
});

const bookings = [
  bk('a1', 'airbnb', '2026-07-12', '2026-07-19'),
  bk('a2', 'airbnb', '2026-07-20', '2026-07-24', { external_id: 'HMABC12345' }),
  bk('b1', 'booking', '2026-07-01', '2026-07-05'),
  bk('b2', 'booking', '2026-07-06', '2026-07-10'),
  bk('b3', 'booking', '2026-07-24', '2026-07-31'),
  bk('o1', 'own', '2026-07-01', '2026-07-03'),
  bk('c1', 'booking', '2026-07-11', '2026-07-12', { status: 'cancelled' }),
  bk('old', 'booking', '2025-07-01', '2025-07-05'),
];
const amounts = { a1: { payout: 812.4 }, a2: { payout: 400 }, b1: { payout: 500 }, b2: { payout: 650.5 }, b3: { payout: 900 } };

test('kandidaten: zelfde platform eerst, geen eigen gebruik, geannuleerd of oud', () => {
  const c = P.candidates(tx('t', '2026-07-13', 812.4, 'Airbnb'), bookings, amounts, []);
  assert.deepEqual(c.map(x => x.booking.id), ['a1', 'a2', 'b2', 'b1', 'b3']);
  assert.ok(P.candidates(tx('t', '2026-07-13', 812.4, 'Airbnb'), bookings, amounts, [], true).some(x => x.booking.id === 'old'), 'met "alle" ook buiten de periode');
});

test('voorstel: boekingsnummer, dan precies bedrag, dan som van boekingen', () => {
  const s = (t, payouts = []) => P.suggest(t, P.candidates(t, bookings, amounts, payouts));
  assert.deepEqual(s(tx('t1', '2026-07-21', 380, 'Airbnb', 'Reservation hm-abc12345')), { ids: ['a2'], by: 'ref' });
  assert.deepEqual(s(tx('t2', '2026-07-13', 812.4, 'Airbnb')), { ids: ['a1'], by: 'amount' });
  assert.deepEqual(s(tx('t3', '2026-08-03', 1150.5, 'Booking.com B.V.')), { ids: ['b2', 'b1'], by: 'sum' });
  assert.equal(s(tx('t4', '2026-08-03', 999, 'Booking.com B.V.')), null, 'geen passende combinatie');
  // al (deels) uitbetaald: alleen het open bedrag telt
  assert.deepEqual(s(tx('t5', '2026-08-03', 650.5, 'Booking.com B.V.'), [{ booking_id: 'b1', transaction_id: 'x', amount: 500 }]), { ids: ['b2'], by: 'amount' });
});

test('bedrag verdelen over boekingen: precies, naar verhouding, onbekend gelijk', () => {
  assert.deepEqual(P.allocate(115050, [50000, 65050]), [50000, 65050]);
  assert.deepEqual(P.allocate(100000, [50000, 50000, 50000]), [33334, 33333, 33333]);
  assert.deepEqual(P.allocate(100000, [30000, null, null]), [30000, 35000, 35000]);
  assert.deepEqual(P.allocate(10000, [30000, null]), [5000, 5000], 'te weinig over: gelijk verdelen');
  assert.deepEqual(P.allocate(81240, [null]), [81240]);
  const r = P.allocate(99999, [12345, 67890, 11111]);
  assert.equal(r.reduce((s, x) => s + x, 0), 99999);
});

test('nog niet uitbetaald: alleen platform, op tijd te laat, niet ouder dan een jaar', () => {
  const list = P.unpaid(bookings, [{ booking_id: 'a1', amount: 812.4 }], '2026-08-12');
  assert.deepEqual(list.map(b => b.id), ['b1', 'a2'], 'b2 nog niet laat (35 dagen na vertrek), b3 ook niet, old te oud');
  assert.equal(P.lateFrom(bookings[0]), '2026-07-17');
  assert.equal(P.expectedOn(bookings[2]), '2026-07-05');
});
