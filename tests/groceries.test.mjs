// Boodschappen: regels lezen, ingrediënten optellen, afdelingen, vaste boodschappen en ritme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as G from '../groceries/plan.js';

test('regel lezen: hoeveelheid, eenheid, naam', () => {
  assert.deepEqual(G.parseLine('2 uien'), { qty: 2, unit: '', name: 'uien' });
  assert.deepEqual(G.parseLine('500 g rundergehakt'), { qty: 500, unit: 'g', name: 'rundergehakt' });
  assert.deepEqual(G.parseLine('500g rundergehakt'), { qty: 500, unit: 'g', name: 'rundergehakt' });
  assert.deepEqual(G.parseLine('1 blik tomatenblokjes (400 g)'), { qty: 1, unit: 'blik', name: 'tomatenblokjes' });
  assert.deepEqual(G.parseLine('2 rode uien, gesnipperd'), { qty: 2, unit: '', name: 'rode uien' });
  assert.deepEqual(G.parseLine('2 tenen knoflook'), { qty: 2, unit: 'teen', name: 'knoflook' });
  assert.deepEqual(G.parseLine('1½ el olijfolie'), { qty: 1.5, unit: 'el', name: 'olijfolie' });
  assert.deepEqual(G.parseLine('3-4 tomaten'), { qty: 4, unit: '', name: 'tomaten' });
  assert.deepEqual(G.parseLine('melk'), { qty: null, unit: '', name: 'melk' });
  assert.deepEqual(G.parseLine('olie'), { qty: null, unit: '', name: 'olie' }, '"olie" is geen eenheid');
  assert.equal(G.parseLine('Voor de saus:'), null, 'tussenkop');
  assert.equal(G.parseLine('  '), null);
  assert.equal(G.parseLine('500 g'), null, 'zonder naam');
});

test('zout, peper en water worden overgeslagen', () => {
  for (const s of ['zout', 'peper', 'zout en peper', 'Zout en versgemalen zwarte peper', 'peper en zout', 'water', 'lauw water', 'zout naar smaak']) assert.ok(G.isBasic(s), s);
  for (const s of ['rode peper', 'paprika', 'bruiswater met citroen', 'kokoswater']) assert.ok(!G.isBasic(s), s);
});

test('namen: meervoud en enkelvoud zijn hetzelfde', () => {
  for (const [a, b] of [['ui', 'uien'], ['tomaat', 'tomaten'], ['citroen', 'citroenen'], ['paprika', "paprika's"], ['wortel', 'wortels'], ['ei', 'eieren'], ['aardappel', 'aardappelen'], ['banaan', 'bananen'], ['Kaas', 'kaas']])
    assert.ok(G.sameName(a, b), `${a} = ${b}`);
  for (const [a, b] of [['ui', 'rode ui'], ['kaas', 'pindakaas'], ['melk', 'kokosmelk'], ['peer', 'paprika']])
    assert.ok(!G.sameName(a, b), `${a} ≠ ${b}`);
});

test('afdelingen: samenstellingen gaan voor', () => {
  const cases = {
    'uien': 'produce', 'rode ui': 'produce', 'tomaten': 'produce', 'tomatenblokjes': 'cans', 'tomatenpuree': 'cans', 'bloemkool': 'produce',
    'bloem': 'pantry', 'slagroom': 'dairy', 'ijsbergsla': 'produce', 'ijs': 'frozen', 'pindakaas': 'breakfast', 'geraspte kaas': 'cheese',
    'kokosmelk': 'cans', 'melk': 'dairy', 'eieren': 'dairy', 'kipfilet': 'meat', 'rundergehakt': 'meat', 'kippenbouillon': 'cans',
    'champignons': 'produce', 'chocolade': 'snacks', 'cola': 'drinks', 'appelsap': 'drinks', 'appels': 'produce', 'aardappelen': 'produce',
    'wc-papier': 'household', 'tandpasta': 'care', 'spaghetti': 'pantry', 'pastasaus': 'cans', 'olijfolie': 'cans', 'stokbrood': 'bread',
    'maïs': 'cans', 'maizena': 'pantry', 'doperwten': 'frozen', 'vissticks': 'frozen', 'zalm': 'meat', 'achterham': 'cheese', 'koffiemelk': 'dairy',
    'koffie': 'drinks', 'xyz': 'other',
  };
  for (const [n, s] of Object.entries(cases)) assert.equal(G.sectionFor(n), s, n);
  assert.equal(G.sectionFor('uien', { [G.nameKey('ui')]: 'other' }), 'other', 'eerdere keuze van het gezin gaat voor');
});

test('gerechten optellen: zelfde ingrediënt, eenheden en personen', () => {
  const a = { id: 'a', servings: 4, ingredients: ['2 uien', '500 g rundergehakt', '1 el olie', 'Voor de saus:', '1 blik tomatenblokjes (400 g)', 'zout en peper'] };
  const b = { id: 'b', servings: 2, ingredients: ['1 ui', '1 kg rundergehakt', '100 ml olie', '1/2 rode paprika'] };
  const out = G.combine([{ recipe: a, servings: 4 }, { recipe: b, servings: 2 }]);
  const get = n => out.filter(x => G.sameName(x.name, n));
  assert.deepEqual(get('ui').map(x => [x.qty, x.unit]), [[3, '']], '2 uien + 1 ui');
  assert.equal(get('ui')[0].name, 'uien', 'naam van de grootste hoeveelheid');
  assert.deepEqual(get('rundergehakt').map(x => [x.qty, x.unit]), [[1.5, 'kg']], '500 g + 1 kg');
  assert.deepEqual(get('olie').map(x => [x.qty, x.unit]).sort(), [[1, 'el'], [100, 'ml']], 'el en ml niet optellen');
  assert.deepEqual(get('tomatenblokjes').map(x => [x.qty, x.unit]), [[1, 'blik']]);
  assert.deepEqual(get('rode paprika').map(x => x.qty), [1], 'halve paprika → 1 kopen');
  assert.deepEqual(get('ui')[0].recipe_ids, ['a', 'b']);
  assert.ok(get('zout en peper')[0].basic);
  assert.ok(!out.some(x => /saus/.test(x.name)), 'tussenkop niet op de lijst');
  assert.equal(get('rundergehakt')[0].section, 'meat');
});

test('gerechten optellen: omrekenen naar aantal personen', () => {
  const r = { id: 'r', servings: 4, ingredients: ['400 g spaghetti', '3 tenen knoflook', '2 el boter', '1 ui'] };
  const out = G.combine([{ recipe: r, servings: 6 }]);
  const q = n => out.find(x => x.name === n);
  assert.deepEqual([q('spaghetti').qty, q('spaghetti').unit], [600, 'g']);
  assert.deepEqual([q('knoflook').qty, q('knoflook').unit], [5, 'teen'], '4,5 tenen → 5');
  assert.deepEqual([q('boter').qty, q('boter').unit], [3, 'el']);
  assert.equal(q('ui').qty, 2, '1,5 ui → 2');
});

test('op de lijst: optellen bij wat er al staat', () => {
  const open = [{ id: 'x', name: 'uien', qty: 1, unit: '', recipe_ids: [] }, { id: 'y', name: 'melk', qty: null, unit: '' }, { id: 'z', name: 'gehakt', qty: 300, unit: 'g', recipe_ids: ['old'] }];
  const { updates, inserts } = G.mergeIntoList(open, [
    { name: 'ui', qty: 2, unit: '', recipe_ids: ['a'] }, { name: 'melk', qty: 1, unit: 'l' }, { name: 'gehakt', qty: 0.8, unit: 'kg', recipe_ids: ['a'] }, { name: 'prei', qty: 1, unit: '', section: 'produce' },
  ]);
  const u = id => updates.find(x => x.id === id);
  assert.deepEqual([u('x').qty, u('x').unit, u('x').recipe_ids], [3, '', ['a']]);
  assert.deepEqual([u('y').qty, u('y').unit], [1, 'l'], 'zonder hoeveelheid → nieuwe hoeveelheid');
  assert.deepEqual([u('z').qty, u('z').unit, u('z').recipe_ids], [1.1, 'kg', ['old', 'a']]);
  assert.deepEqual(inserts, [{ name: 'prei', qty: 1, unit: '', section: 'produce', recipe_ids: [] }]);
});

test('hoeveelheid tonen', () => {
  assert.equal(G.fmtAmount(3, ''), '3');
  assert.equal(G.fmtAmount(1.5, 'kg'), '1 ½ kg');
  assert.equal(G.fmtAmount(2, 'blik'), '2 blikken');
  assert.equal(G.fmtAmount(1, 'blik'), '1 blik');
  assert.equal(G.fmtAmount(null, 'g'), '');
});

test('vaste boodschappen: wanneer aan de beurt', () => {
  const now = '2026-11-28';
  assert.ok(G.isDue({ every_days: 7, last_bought: null }, now), 'nooit gekocht → meteen');
  assert.ok(!G.isDue({ every_days: null, last_bought: null }, now), 'altijd in huis → nooit vanzelf');
  assert.ok(G.isDue({ every_days: 7, last_bought: '2026-11-23' }, now), 'vorige week zondag gekocht, zaterdag weer aan de beurt');
  assert.ok(!G.isDue({ every_days: 7, last_bought: '2026-11-25' }, now));
  assert.equal(G.dueDate({ every_days: 14, last_bought: '2026-11-01' }), '2026-11-12');
  assert.equal(G.dueDate({ every_days: 1, last_bought: '2026-11-27' }), '2026-11-28');
  assert.ok(!G.isDue({ every_days: 7, last_bought: null, snooze_until: '2026-11-30' }, now), 'overgeslagen');
  assert.equal(G.snoozeDate(7, now), '2026-12-02');
  assert.equal(G.snoozeDate(1, now), '2026-11-29');
});

test('ritme: voorstel alleen bij een duidelijk ander koopgedrag', () => {
  assert.equal(G.suggestRhythm(7, ['2026-11-01', '2026-11-05', '2026-11-08']), null, 'te weinig keer gekocht');
  assert.equal(G.suggestRhythm(7, ['2026-10-01', '2026-10-05', '2026-10-09', '2026-10-12', '2026-10-16']), 4, 'om de 3-4 dagen');
  assert.equal(G.suggestRhythm(7, ['2026-10-01', '2026-10-08', '2026-10-14', '2026-10-22']), null, 'klopt ongeveer');
  assert.equal(G.suggestRhythm(7, ['2026-09-01', '2026-09-15', '2026-09-29', '2026-10-13']), 14);
  assert.equal(G.rhythmLabel(7), 'elke week');
  assert.equal(G.rhythmLabel(14), 'om de 2 weken');
  assert.equal(G.rhythmLabel(21), 'elke 3 weken');
  assert.equal(G.rhythmLabel(3), 'elke 3 dagen');
  assert.equal(G.rhythmLabel(null), 'Altijd in huis');
});

test('lijst per afdeling in de volgorde van de winkel', () => {
  const g = G.bySection([{ name: 'melk', section: 'dairy' }, { name: 'appels', section: 'produce' }, { name: 'bananen', section: 'produce' }, { name: '?', section: 'nonsense' }]);
  assert.deepEqual(g.map(x => x.section[0]), ['produce', 'dairy', 'other']);
  assert.deepEqual(g[0].items.map(x => x.name), ['appels', 'bananen']);
});

test('weekmenu: week begint op maandag', () => {
  assert.equal(G.weekOf('2026-11-22'), '2026-11-16'); // zondag
  assert.equal(G.weekOf('2026-11-23'), '2026-11-23'); // maandag
});

test('hoeveelheid uit een invoerveld', () => {
  assert.deepEqual(G.parseAmount('2'), { qty: 2, unit: '' });
  assert.deepEqual(G.parseAmount('500 g'), { qty: 500, unit: 'g' });
  assert.deepEqual(G.parseAmount('1,5 liter'), { qty: 1.5, unit: 'l' });
  assert.deepEqual(G.parseAmount(''), { qty: null, unit: '' });
  assert.equal(G.parseAmount('veel'), null);
  assert.equal(G.parseAmount('0'), null);
});
