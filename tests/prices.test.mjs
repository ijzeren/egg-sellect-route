// Boodschappen: prijzen, verpakkingen, bonus, goedkoper en gezonder (groceries/prices.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../groceries/prices.js';

const p = (id, o) => ({ product_id: id, title: id, brand: 'AH', size: '', price: 1, price_was: null, bonus: '', unit: 'kg', unit_qty: 1, nutriscore: 'B', sub_category: 'Halfvolle melk', available: true, ...o });

test('verpakkingen: hoeveel moet je kopen', () => {
  const gehakt = p('gehakt', { unit: 'kg', unit_qty: 0.5 });
  assert.equal(P.packsFor({ qty: 750, unit: 'g' }, gehakt), 2);
  assert.equal(P.packsFor({ qty: 500, unit: 'g' }, gehakt), 1);
  assert.equal(P.packsFor({ qty: 1, unit: 'kg' }, gehakt), 2);
  assert.equal(P.packsFor({ qty: null, unit: '' }, gehakt), 1, 'zonder hoeveelheid één');
  const melk = p('melk', { unit: 'l', unit_qty: 1.5 });
  assert.equal(P.packsFor({ qty: 2, unit: 'l' }, melk), 2);
  assert.equal(P.packsFor({ qty: 3, unit: 'blik' }, p('tomaat', { unit: 'kg', unit_qty: 0.4 })), 3, 'per blik');
  assert.equal(P.packsFor({ qty: 2, unit: 'el' }, melk), 1, 'lepels: één verpakking');
  assert.equal(P.packsFor({ qty: 12, unit: '' }, p('eieren', { unit: 'st', unit_qty: 10 })), 2);
  assert.equal(P.packsFor({ qty: 3, unit: '' }, p('komkommer', { unit: 'st', unit_qty: null, size: 'per stuk' })), 3);
  assert.equal(P.packsFor({ qty: 6, unit: '' }, p('bananen', { unit: 'st', unit_qty: null, size: 'Tros' })), 1, 'een tros, niet zes');
  assert.equal(P.packsFor({ qty: 3, unit: '' }, p('uien', { unit: 'kg', unit_qty: 1 })), 1, 'stuks tegenover kilo: één zak');
});

test('bonusacties lezen', () => {
  assert.deepEqual(P.parseDeal('1 + 1 gratis'), { kind: 'free', n: 2, pay: 1 });
  assert.deepEqual(P.parseDeal('2 + 3 GRATIS'), { kind: 'free', n: 5, pay: 2 });
  assert.deepEqual(P.parseDeal('2e halve prijs'), { kind: 'free', n: 2, pay: 1.5 });
  assert.deepEqual(P.parseDeal('2 voor 5,00'), { kind: 'set', n: 2, price: 5 });
  assert.equal(P.parseDeal('VOOR 3.49'), null, 'zit al in de prijs');
  assert.equal(P.parseDeal('25% korting'), null);
  assert.equal(P.parseDeal(''), null);
});

test('kosten met en zonder bonus', () => {
  assert.deepEqual(P.cost(p('a', { price: 3.49, price_was: 4.49, bonus: 'VOOR 3.49' }), 2), { total: 6.98, regular: 8.98, deal: null, dealMissed: false });
  const free = p('b', { price: 2, bonus: '1 + 1 gratis' });
  assert.equal(P.cost(free, 2).total, 2);
  assert.equal(P.cost(free, 3).total, 4);
  assert.equal(P.cost(free, 1).dealMissed, true, 'met één haal je de actie niet');
  assert.equal(P.cost(free, 2).regular, 4);
  assert.equal(P.cost(p('c', { price: 3, bonus: '2 voor 5.00' }), 3).total, 8);
  assert.equal(P.cost(p('d', { price: null }), 1), null);
});

test('prijs per kilo of liter', () => {
  assert.equal(P.fmtUnitPrice(p('m', { price: 1.79, unit: 'l', unit_qty: 1.5 })), '€ 1,19 per liter');
  assert.equal(P.fmtUnitPrice(p('m', { unit_qty: null })), '');
  assert.equal(P.fmtEuro(12.5), '€ 12,50');
});

test('goedkoper en gezonder alternatief', () => {
  const base = p('ah15', { price: 1.79, unit: 'l', unit_qty: 1.5, nutriscore: 'B' });
  const pool = [
    base,
    p('ah1', { price: 1.29, unit: 'l', unit_qty: 1 }),                      // duurder per liter
    p('half', { price: 0.79, unit: 'l', unit_qty: 0.5 }),                   // duurder per liter
    p('cheap', { price: 2.4, unit: 'l', unit_qty: 3, brand: 'Huismerk' }), // € 0,80 per liter
    p('other', { price: 0.5, unit: 'l', unit_qty: 1, sub_category: 'Houdbare melk' }),
    p('gone', { price: 0.1, unit: 'l', unit_qty: 1, available: false }),
    p('kg', { price: 0.1, unit: 'kg', unit_qty: 1 }),
  ];
  const a = P.alternatives(base, pool);
  assert.equal(a.cheaper.product.product_id, 'cheap');
  assert.equal(a.cheaper.saving, 33);
  assert.equal(a.healthier, null, 'B en niets beters');
  assert.equal(P.alternatives(base, pool, { brandOnly: true }).cheaper, null, 'alleen dit merk');
  // niet "goedkoper" met een slechtere Nutri-Score
  assert.equal(P.alternatives(base, [p('worse', { price: 0.5, unit: 'l', unit_qty: 1, nutriscore: 'D' })]).cheaper, null);
  // gezonder: de beste score, dan de goedkoopste
  const brood = p('wit', { price: 1.5, nutriscore: 'C', sub_category: 'Brood' });
  const h = P.alternatives(brood, [p('volkoren', { price: 2, nutriscore: 'A', sub_category: 'Brood' }), p('bruin', { price: 1, nutriscore: 'B', sub_category: 'Brood' }), p('volkoren2', { price: 1.8, nutriscore: 'A', sub_category: 'Brood' })]);
  assert.equal(h.healthier.product.product_id, 'volkoren2');
  assert.equal(h.cheaper.product.product_id, 'bruin', 'goedkoper en ook gezonder mag');
});

test('alternatief moet dezelfde boodschap zijn', () => {
  assert.equal(P.matchesName('AH Rundergehakt', 'rundergehakt'), true);
  assert.equal(P.matchesName('AH Gemengd gehakt', 'rundergehakt'), false);
  assert.equal(P.matchesName('AH Bananen tros', 'banaan'), true);
  assert.equal(P.matchesName('Heinz Tomaten blokjes naturel', 'tomatenblokjes'), true);
  assert.equal(P.matchesName('AH Houdbare halfvolle melk', 'halfvolle melk'), true);
  assert.equal(P.matchesName('AH Volle melk', 'halfvolle melk'), false);
  assert.equal(P.matchesName('AH Gele uien', 'uien'), true);
  assert.equal(P.matchesName('AH Bosui per bosje', 'uien'), false, 'bosui is geen ui');
  assert.equal(P.matchesName('AH Scharreleieren', 'eieren'), true);
  assert.equal(P.matchesName('AH Vrije-uitloopeieren', 'eieren'), true);
  assert.equal(P.matchesName('AH Eiwitshake', 'eieren'), false);
  // inhoud onbekend ("per bosje"): niet te vergelijken
  const uien = p('uien', { title: 'AH Gele uien', price: 0.89, unit: 'st', unit_qty: 3, sub_category: 'Uien' });
  assert.equal(P.alternatives(uien, [p('bos', { title: 'AH Rode uien', price: 0.5, unit: 'st', unit_qty: null, size: 'per bosje', sub_category: 'Uien' })], { item: { name: 'uien', qty: 7, unit: '' } }).cheaper, null);
  const bio = p('bio', { title: 'AH Biologisch Rundergehakt', price: 8.99, unit_qty: 0.5, nutriscore: 'C', sub_category: 'Rundergehakt' });
  const pool = [p('gemengd', { title: 'AH Gemengd gehakt', price: 7.95, unit_qty: 2, nutriscore: 'C', sub_category: 'Rundergehakt' }),
    p('kilo', { title: 'AH Rundergehakt', price: 10.45, unit_qty: 1, nutriscore: 'C', sub_category: 'Rundergehakt' })];
  assert.equal(P.alternatives(bio, pool).cheaper.product.product_id, 'gemengd', 'zonder naam: alleen de subcategorie');
  assert.equal(P.alternatives(bio, pool, { item: { name: 'rundergehakt' } }).cheaper.product.product_id, 'kilo');
});

test('met een hoeveelheid telt wat je echt betaalt', () => {
  const bio = p('bio', { title: 'AH Biologisch Rundergehakt', price: 8.99, unit_qty: 0.5, nutriscore: 'D', sub_category: 'Rundergehakt' });
  const pool = [p('kilo', { title: 'AH Rundergehakt', price: 10.45, unit_qty: 1, nutriscore: 'C', sub_category: 'Rundergehakt' }),
    p('half', { title: 'AH Rundergehakt', price: 5.31, unit_qty: 0.5, nutriscore: 'C', sub_category: 'Rundergehakt' })];
  const a = P.alternatives(bio, pool, { item: { name: 'rundergehakt', qty: 500, unit: 'g' } });
  assert.equal(a.cheaper.product.product_id, 'half', '1 kg kost meer dan 500 g');
  assert.equal(a.cheaper.by, 'cost');
  assert.equal(a.cheaper.saving, 41);
  assert.equal(a.cheaper.healthier, true, 'ook gezonder: één tip');
  assert.equal(a.healthier, null);
  assert.equal(P.savingText(a.cheaper), '41% goedkoper');
  // 1 kg nodig: dan is het pak van 1 kg het goedkoopst
  assert.equal(P.alternatives(bio, pool, { item: { name: 'rundergehakt', qty: 1, unit: 'kg' } }).cheaper.product.product_id, 'kilo');
});

test('totaal van de lijst en wat de bonus scheelt', () => {
  const products = new Map([['1', p('1', { price: 3.49, price_was: 4.49, unit: 'kg', unit_qty: 0.3 })], ['2', p('2', { price: 1.79, unit: 'l', unit_qty: 1.5 })]]);
  const choices = [{ store: 'ah', name_key: P.nameKey('kipfilet'), product_id: '1' }, { store: 'ah', name_key: P.nameKey('halfvolle melk'), product_id: 2 }];
  const items = [{ name: 'kipfilet', qty: 600, unit: 'g' }, { name: 'halfvolle melk', qty: null, unit: '' }, { name: 'brood', qty: 1, unit: '' }];
  assert.deepEqual(P.totals(items, choices, products), { total: 8.77, saved: 2, priced: 2, unpriced: 1 });
  // meervoud en enkelvoud zijn dezelfde keuze
  assert.equal(P.productFor({ name: 'Kipfilets' }, choices, products).product.product_id, '1');
});
