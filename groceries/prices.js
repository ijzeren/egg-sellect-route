// Boodschappen — prijzen rekenen (zonder scherm, getest in tests/groceries.test.mjs).
//   product = rij uit grocery_products: { product_id, title, brand, size, price, price_was, bonus, bonus_until,
//             unit ('kg' | 'l' | 'st'), unit_qty (kg, l of stuks per verpakking; null = onbekend), nutriscore, sub_category, available }
//   item    = regel op de lijst: { name, qty, unit } (eenheden zoals in plan.js)
import { nameKey, norm } from './plan.js';

export { nameKey };

// Komt de boodschap in de productnaam voor? "rundergehakt" past bij "AH Rundergehakt", niet bij "AH Gemengd gehakt";
// "banaan" past bij "AH Bananen tros"; "tomatenblokjes" bij "Heinz Tomaten blokjes".
const keyWords = s => norm(s).split(/[^a-z0-9]+/).filter(w => w.length >= 3).map(nameKey).filter(Boolean);
export function matchesName(title, name) {
  const words = norm(name).split(/[^a-z0-9]+/).filter(w => w.length >= 3); if (!words.length) return true;
  const t = keyWords(title), joined = t.join(''), raw = norm(title).replace(/[^a-z0-9]/g, '');
  // korte sleutels ("ui" van uien, "ei" van eieren) als heel woord, of het hele woord in de titel
  // ("scharreleieren" bevat "eieren"; "bosui" bevat geen "uien")
  return words.every(word => {
    const w = nameKey(word); if (!w) return true;
    if (w.length < 4) return t.includes(w) || (word.length >= 4 && raw.includes(word));
    return t.some(x => x.includes(w)) || joined.includes(w) || raw.includes(w) || raw.includes(word);
  });
}
const round2 = n => Math.round(n * 100) / 100;

// Hoeveel van het item in kg, l of stuks; null als het niet te vergelijken is (blik, pak, el, ...).
const ITEM_BASE = { g: ['kg', 0.001], kg: ['kg', 1], ml: ['l', 0.001], cl: ['l', 0.01], dl: ['l', 0.1], l: ['l', 1], stuk: ['st', 1], '': ['st', 1] };
// Eenheden waarbij je per verpakking koopt: 2 blikken = 2 keer het product.
const PACKS = new Set(['blik', 'pak', 'zak', 'fles', 'pot', 'doos', 'bakje', 'krop', 'bos']);

// Hoeveel verpakkingen je moet kopen. Zonder hoeveelheid: 1.
export function packsFor(item, product) {
  const q = item && item.qty != null && item.qty !== '' ? +item.qty : null;
  if (!q || q <= 0 || !product) return 1;
  const unit = item.unit || '';
  if (PACKS.has(unit)) return Math.max(1, Math.ceil(q - 1e-9));
  const b = ITEM_BASE[unit];
  if (!b) return 1; // eetlepels, snufjes: één verpakking is genoeg
  const need = q * b[1];
  if (b[0] === product.unit && product.unit_qty > 0) return Math.max(1, Math.ceil(need / product.unit_qty - 1e-9));
  // "3 komkommers" en een product per stuk zonder bekende inhoud ("per stuk"): elk stuk is een verpakking
  if (b[0] === 'st' && product.unit === 'st' && product.unit_qty == null && /\bstuk\b/i.test(product.size || '')) return Math.max(1, Math.ceil(q - 1e-9));
  return 1;
}

// Bonus-acties waarvoor je meer moet kopen. Andere vormen ("VOOR 3.49", "25% korting") zitten al in de prijs.
//   "1 + 1 gratis", "2 + 3 GRATIS"  → koop er n + m, betaal er n
//   "2e halve prijs"                → per 2: 1,5 keer de prijs
//   "2 voor 5.00", "3 VOOR 4,99"    → per n: de actieprijs
export function parseDeal(text) {
  const s = String(text || '').toLowerCase().replace(',', '.');
  let m = s.match(/^(\d+)\s*\+\s*(\d+)\s*gratis/);
  if (m) return { kind: 'free', n: +m[1] + +m[2], pay: +m[1] };
  if (/^2e\s+halve\s+prijs/.test(s)) return { kind: 'free', n: 2, pay: 1.5 };
  m = s.match(/^(\d+)\s*voor\s*€?\s*(\d+(?:\.\d+)?)/);
  if (m && +m[1] > 1) return { kind: 'set', n: +m[1], price: +m[2] };
  return null;
}

// Wat je betaalt voor `packs` verpakkingen, en wat het zonder bonus had gekost.
export function cost(product, packs = 1) {
  if (!product || product.price == null) return null;
  const regular = round2((product.price_was ?? product.price) * packs);
  const d = parseDeal(product.bonus);
  let total = product.price * packs;
  if (d && d.kind === 'free') { const sets = Math.floor(packs / d.n); total = (sets * d.pay + (packs - sets * d.n)) * product.price; }
  if (d && d.kind === 'set') { const sets = Math.floor(packs / d.n); total = sets * d.price + (packs - sets * d.n) * product.price; }
  return { total: round2(total), regular: Math.max(regular, round2(total)), deal: d, dealMissed: !!d && packs < d.n };
}

// Prijs per kilo, liter of stuk (met de prijs van nu); null als de inhoud onbekend is.
export const unitPrice = p => p && p.price != null && p.unit_qty > 0 ? p.price / p.unit_qty : null;
export function fmtEuro(n) { return n == null ? '' : '€ ' + n.toFixed(2).replace('.', ','); }
export function fmtUnitPrice(p) {
  const u = unitPrice(p); if (u == null) return '';
  return `${fmtEuro(u)} per ${p.unit === 'st' ? 'stuk' : p.unit === 'l' ? 'liter' : 'kilo'}`;
}

const NUTRI = { A: 1, B: 2, C: 3, D: 4, E: 5 };
const usable = (p, base) => p && p.product_id !== base.product_id && p.available !== false && p.price != null
  && p.sub_category && p.sub_category === base.sub_category && p.unit === base.unit;

// Goedkoper en gezonder alternatief binnen dezelfde AH-subcategorie en dezelfde soort eenheid, met de naam van de
// boodschap in de productnaam (item = { name, qty, unit }).
//   goedkoper: minstens 10% minder. Met een hoeveelheid ("500 g") telt wat je echt betaalt (een pak van 1 kg is dan
//              niet goedkoper dan 500 g); zonder hoeveelheid de prijs per kilo/liter/stuk. Niet bij "alleen dit merk".
//              Nooit met een slechtere Nutri-Score.
//   gezonder:  betere Nutri-Score; van de beste de goedkoopste per eenheid. Is dat hetzelfde product als goedkoper,
//              dan staat het één keer: cheaper.healthier = true.
export function alternatives(base, pool, { brandOnly = false, item = null } = {}) {
  const out = { cheaper: null, healthier: null };
  if (!base) return out;
  const bn = NUTRI[base.nutriscore] || null, name = item && item.name;
  const cands = (pool || []).filter(p => usable(p, base) && (!name || matchesName(p.title, name)));
  const b = item && item.qty != null && item.qty !== '' && ITEM_BASE[item.unit || ''];
  const byCost = !!(b && b[0] === base.unit && base.unit_qty > 0);
  // alleen met bekende inhoud: anders is "1 bosje" niet te vergelijken met 7 uien
  const priceOf = p => !(p.unit_qty > 0) ? null : byCost ? (cost(p, packsFor(item, p)) || {}).total ?? null : unitPrice(p);
  const bp = priceOf(base);
  if (!brandOnly && bp != null) {
    const c = cands.map(p => ({ p, v: priceOf(p) })).filter(x => x.v != null && x.v <= bp * 0.9 && !(bn && NUTRI[x.p.nutriscore] > bn))
      .sort((x, y) => x.v - y.v || (unitPrice(x.p) ?? 1e9) - (unitPrice(y.p) ?? 1e9))[0];
    if (c) out.cheaper = { product: c.p, saving: Math.round((1 - c.v / bp) * 100), by: byCost ? 'cost' : 'unit' };
  }
  if (bn && bn > 1) {
    const h = cands.filter(p => NUTRI[p.nutriscore] && NUTRI[p.nutriscore] < bn && (!brandOnly || p.brand === base.brand))
      .sort((a, b) => NUTRI[a.nutriscore] - NUTRI[b.nutriscore] || (priceOf(a) ?? 1e9) - (priceOf(b) ?? 1e9))[0];
    if (h && out.cheaper && h.product_id === out.cheaper.product.product_id) out.cheaper.healthier = true;
    else if (h) out.healthier = { product: h };
  }
  return out;
}
// "33% minder per liter" of "33% goedkoper"
export function savingText(c) {
  if (!c) return '';
  return c.by === 'cost' ? `${c.saving}% goedkoper` : `${c.saving}% minder per ${c.product.unit === 'st' ? 'stuk' : c.product.unit === 'l' ? 'liter' : 'kilo'}`;
}

// Gekozen product voor een item: choices = rijen uit grocery_choices, products = Map(product_id → product).
export function productFor(item, choices, products, store = 'ah') {
  const k = nameKey(item.name);
  const c = (choices || []).find(x => x.store === store && x.name_key === k);
  return c ? { choice: c, product: products.get(String(c.product_id)) || null } : { choice: null, product: null };
}

// Totaal van de lijst: wat je betaalt, wat de bonus scheelt, en hoeveel items (nog) geen prijs hebben.
export function totals(items, choices, products) {
  let total = 0, regular = 0, priced = 0, unpriced = 0;
  for (const it of items || []) {
    const { product } = productFor(it, choices, products);
    const c = product && product.available !== false ? cost(product, packsFor(it, product)) : null;
    if (!c) { unpriced++; continue; }
    total += c.total; regular += c.regular; priced++;
  }
  return { total: round2(total), saved: round2(regular - total), priced, unpriced };
}
