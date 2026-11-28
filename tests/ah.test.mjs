// Albert Heijn: antwoorden van de app-API omzetten (supabase/functions/groceries-products/ah.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, parseUnitPrice, normalize, normalizeList, cleanQuery } from '../supabase/functions/groceries-products/ah.mjs';

test('verpakking lezen', () => {
  assert.deepEqual(parseSize('1,5 l'), { unit: 'l', qty: 1.5 });
  assert.deepEqual(parseSize('150 g'), { unit: 'kg', qty: 0.15 });
  assert.deepEqual(parseSize('4 x 90 g'), { unit: 'kg', qty: 0.36 });
  assert.deepEqual(parseSize('425 ml'), { unit: 'l', qty: 0.425 });
  assert.deepEqual(parseSize('33 cl'), { unit: 'l', qty: 0.33 });
  assert.deepEqual(parseSize('ca. 500 g'), { unit: 'kg', qty: 0.5 });
  assert.deepEqual(parseSize('1000 g'), { unit: 'kg', qty: 1 });
  assert.deepEqual(parseSize('6 stuks'), { unit: 'st', qty: 6 });
  assert.deepEqual(parseSize('per stuk'), { unit: 'st', qty: 1 });
  assert.deepEqual(parseSize('Tros'), { unit: 'st', qty: null });
  assert.deepEqual(parseSize(null), { unit: 'st', qty: null });
});

test('prijs per kilo uit de beschrijving', () => {
  assert.deepEqual(parseUnitPrice('prijs per kg €16.60'), { unit: 'kg', price: 16.6 });
  assert.deepEqual(parseUnitPrice('normale prijs per liter €17.98'), { unit: 'l', price: 17.98 });
  assert.equal(parseUnitPrice(null), null);
});

const melk = { webshopId: 33693, title: 'AH Halfvolle melk', brand: 'AH', salesUnitSize: '1,5 l', currentPrice: null, priceBeforeBonus: 1.79,
  unitPriceDescription: 'prijs per liter €1.19', nutriscore: 'B', isBonus: false, mainCategory: 'Zuivel, eieren', subCategory: 'Halfvolle melk',
  images: [{ width: 800, url: 'https://static.ah.nl/a800' }, { width: 200, url: 'https://static.ah.nl/a200' }], isOrderable: true, orderAvailabilityStatus: 'IN_ASSORTMENT' };

test('product zonder bonus: prijs = priceBeforeBonus', () => {
  const r = normalize(melk, '2026-11-23T10:00:00Z');
  assert.equal(r.product_id, '33693');
  assert.equal(r.price, 1.79);
  assert.equal(r.price_was, null);
  assert.equal(r.bonus, '');
  assert.equal(r.unit, 'l');
  assert.equal(r.unit_qty, 1.5);
  assert.equal(r.nutriscore, 'B');
  assert.equal(r.image, 'https://static.ah.nl/a200');
  assert.equal(r.available, true);
});

test('weekbonus: prijs van nu en de gewone prijs', () => {
  const r = normalize({ ...melk, webshopId: 533083, salesUnitSize: '300 g', currentPrice: 3.49, priceBeforeBonus: 4.49, isBonus: true,
    bonusMechanism: 'VOOR 3.49', bonusStartDate: '2026-11-23', bonusEndDate: '2026-11-29', unitPriceDescription: 'normale prijs per kg €14.97' });
  assert.equal(r.price, 3.49);
  assert.equal(r.price_was, 4.49);
  assert.equal(r.bonus, 'VOOR 3.49');
  assert.equal(r.bonus_until, '2026-11-29');
  // actie waarbij je meer moet kopen: geen prijs van nu, wel de actie
  const d = normalize({ ...melk, currentPrice: null, priceBeforeBonus: 7.19, isBonus: true, bonusMechanism: '2 + 3 GRATIS', bonusEndDate: '2026-11-29' });
  assert.equal(d.price, 7.19);
  assert.equal(d.price_was, null);
  assert.equal(d.bonus, '2 + 3 GRATIS');
});

test('online meerpak en "bonus tot 2999" tellen niet', () => {
  const bundle = { ...melk, webshopId: 582865, title: 'Arla Biologisch halfvolle melk 3-pack', isVirtualBundle: true, isBonus: true, currentPrice: 5.1, priceBeforeBonus: 5.37, bonusEndDate: '2999-12-31' };
  assert.deepEqual(normalizeList([bundle, melk, melk]).map(r => r.product_id), ['33693']);
  const forever = normalize({ ...melk, isBonus: true, bonusMechanism: '5% volume voordeel', bonusEndDate: '2999-12-31' });
  assert.equal(forever.bonus, '');
  assert.equal(forever.bonus_until, null);
});

test('inhoud onbekend: terugrekenen uit de prijs per kilo', () => {
  const r = normalize({ ...melk, salesUnitSize: 'Bak', priceBeforeBonus: 2.49, unitPriceDescription: 'prijs per kg €4.98' });
  assert.equal(r.unit, 'kg');
  assert.equal(r.unit_qty, 0.5);
  const tros = normalize({ ...melk, salesUnitSize: 'Tros', unitPriceDescription: null });
  assert.equal(tros.unit, 'st');
  assert.equal(tros.unit_qty, null);
});

test('niet te bestellen, vreemde afbeelding en zoekterm', () => {
  assert.equal(normalize({ ...melk, isOrderable: false }).available, false);
  assert.equal(normalize({ ...melk, images: [{ width: 200, url: 'https://evil.example/x' }] }).image, '');
  assert.equal(normalize({ title: 'x' }), null);
  assert.equal(cleanQuery('  wc-papier <script>  '), 'wc-papier script');
  assert.equal(cleanQuery('a'.repeat(100)).length, 60);
});
