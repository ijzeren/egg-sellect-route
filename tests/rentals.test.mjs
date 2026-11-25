// Verhuur: toeristenbelasting volgens de voorbeelden van de CCVK en de aangifte per maand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../rentals/tax.js';

const house = (extra = {}) => ({ id: 'h1', stars: null, tax: {}, ...extra });
const bk = (x = {}) => ({ id: x.id || 'b' + Math.random(), house_id: 'h1', source: 'direct', status: 'booked', tax_by: 'host', guests: 4, adults: 3, arrival: '2026-07-01', departure: '2026-07-08', ...x });

test('nachten', () => {
  assert.equal(R.nights({ arrival: '2026-03-28', departure: '2026-04-02' }), 5); // over zomertijd heen
  assert.equal(R.nights({ arrival: '2026-12-30', departure: '2027-01-02' }), 3);
});

test('CCVK voorbeeld 1: 700 € voor 7 nachten, 3 volwassenen + 1 kind → 28,98', () => {
  const t = R.touristTax(bk(), { accommodation: 700 }, house({ tax: { 2026: { cap: 3 } } }));
  assert.equal(t.rate, 1.38);
  assert.equal(t.amount, 28.98);
});

test('CCVK voorbeeld 2: plafond 3 € → 3,30 per volwassene, 2 volwassenen + 2 kinderen, 1 nacht → 6,60', () => {
  const b = bk({ guests: 4, adults: 2, arrival: '2026-07-01', departure: '2026-07-02' });
  assert.equal(R.touristTax(b, { accommodation: 300 }, house({ tax: { 2026: { cap: 3 } } })).amount, 6.6);
  // met het plafond van de tarievenaffiche (4,60): 3,75 + 0,38
  assert.equal(R.touristTax(b, { accommodation: 300 }, house()).rate, 4.13);
});

test('geclassificeerd: vast tarief per volwassene, prijs telt niet', () => {
  const b = bk({ guests: 3, adults: 2 });
  assert.equal(R.touristTax(b, {}, house({ stars: 3 })).amount, 24.64);
});

test('prijs per nacht: uit de huur of uit de afgesproken nachtprijs', () => {
  assert.equal(R.nightPrice(bk(), { accommodation: 700 }), 100);
  assert.equal(R.nightPrice(bk(), { night_price: '95,50' }), 95.5);
  assert.equal(R.nightPrice(bk(), {}), null);
});

test('geen taxe bij eigen gebruik of zonder prijs', () => {
  assert.equal(R.touristTax(bk({ source: 'own', tax_by: 'none' }), { accommodation: 700 }, house()), null);
  assert.equal(R.touristTax(bk(), {}, house()), null);
});

test('aangifte: alleen verhuur die in de maand begint, platforms apart van te betalen', () => {
  const list = [
    bk({ id: 'a', source: 'booking', tax_by: 'platform', arrival: '2026-07-10', departure: '2026-07-12' }),
    bk({ id: 'b', arrival: '2026-07-01', departure: '2026-07-08' }),
    bk({ id: 'c', source: 'own', tax_by: 'none', arrival: '2026-07-15', departure: '2026-07-20' }),
    bk({ id: 'd', status: 'cancelled', arrival: '2026-07-20', departure: '2026-07-22' }),
    bk({ id: 'e', status: 'option', arrival: '2026-07-22', departure: '2026-07-24' }),
    bk({ id: 'f', arrival: '2026-07-30', departure: '2026-08-03' }),
    bk({ id: 'g', arrival: '2026-06-28', departure: '2026-07-02' }),
  ];
  const amounts = { a: { accommodation: 500, tourist_tax: 20 }, b: { accommodation: 700 }, f: { accommodation: 400 } };
  const d = R.declaration(list, amounts, house({ tax: { 2026: { cap: 3 } } }), '2026-07');
  assert.deepEqual(d.rows.map(r => r.booking.id), ['b', 'a', 'f']);
  assert.equal(d.rows[1].byPlatform, true);
  assert.equal(d.rows[2].endsLater, true);
  assert.equal(d.rows[0].endsLater, false);
  assert.equal(d.toPay, R.round2(28.98 + d.rows[2].tax));
  assert.match(d.rows[1].issues.join(), /wijkt af/);
});

test('geïmporteerde boeking: volwassenen nakijken tot het is aangepast', () => {
  const imp = { id: 'i', import_key: 'xlsx:1', guests: 4, adults: 4, notes: 'Volwassenen onbekend bij import: gelijk aan personen.' };
  assert.match(R.declaration([bk(imp)], { i: { accommodation: 400 } }, house(), '2026-07').rows[0].issues.join(), /volwassenen nakijken/);
  assert.equal(R.declaration([bk({ ...imp, adults: 3 })], { i: { accommodation: 400 } }, house(), '2026-07').rows[0].issues.length, 0);
});

test('verblijf tot de 1e van de volgende maand loopt niet door', () => {
  const d = R.declaration([bk({ id: 'x', arrival: '2026-07-28', departure: '2026-08-01' })], { x: { accommodation: 400 } }, house(), '2026-07');
  assert.equal(d.rows[0].endsLater, false);
});

test('welke aangifte is aan de beurt', () => {
  assert.deepEqual(R.declarationDue('2026-12-03', []), { month: '2026-11', deadline: '2026-12-05', late: false, open: true });
  assert.deepEqual(R.declarationDue('2026-11-25', ['2026-10']), { month: '2026-11', deadline: '2026-12-05', late: false, open: true });
  assert.deepEqual(R.declarationDue('2026-11-25', []), { month: '2026-10', deadline: '2026-11-05', late: true, open: true });
  assert.equal(R.declarationDue('2027-01-02', ['2026-12']).open, false);
  assert.equal(R.declarationDue('2027-01-02', []).month, '2026-12');
});

test('CSV met puntkomma en komma', () => {
  const d = R.declaration([bk({ id: 'b' })], { b: { accommodation: 700 } }, house({ tax: { 2026: { cap: 3 } } }), '2026-07');
  const csv = R.declarationCsv(d).split('\n');
  assert.equal(csv[0].split(';').length, 10);
  assert.equal(csv[1], 'Direct;2026-07-01;2026-07-08;7;4;3;1;100,00;28,98;zelf');
});

test('directe boeking: totaal voor de gast', () => {
  const t = R.directTotal(bk(), { night_price: 100, cleaning: 120, linen: '89,26' }, house({ tax: { 2026: { cap: 3 } } }));
  assert.deepEqual([t.rent, t.cleaning, t.linen, t.tax, t.total], [700, 120, 89.26, 28.98, 938.24]);
});

test('overlap met een ander verblijf, niet met een geannuleerd', () => {
  const a = bk({ id: 'a', arrival: '2026-07-01', departure: '2026-07-05' });
  const list = [a, bk({ id: 'b', arrival: '2026-07-05', departure: '2026-07-07' }), bk({ id: 'c', arrival: '2026-07-04', departure: '2026-07-06' }), bk({ id: 'd', status: 'cancelled', arrival: '2026-07-02', departure: '2026-07-03' })];
  assert.deepEqual(R.overlaps(a, list).map(x => x.id), ['c']);
});
