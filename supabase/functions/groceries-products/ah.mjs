// Albert Heijn (zonder inloggen): antwoorden van de AH-app-API omzetten naar rijen voor grocery_products.
// Puur (geen netwerk), zodat tests/ah.test.mjs het met node kan testen. De aanroepen zelf staan in index.ts.
//
// Wat we van de API weten (getest 23 nov 2026):
//   - currentPrice is null als er geen bonus is: de prijs is dan priceBeforeBonus.
//   - isVirtualBundle = online meerpak ("3-pack", korting "5% volume voordeel", bonus tot 2999-12-31): niet in de winkel,
//     en het zou elke vergelijking "winnen". Die laten we weg.
//   - unitPriceDescription: "prijs per kg €16.60" of, met bonus, "normale prijs per kg €14.97" (de gewone prijs).
//     We rekenen de prijs per kilo of liter zelf uit de verpakking (salesUnitSize) en de prijs van nu.
//   - salesUnitSize: "1,5 l", "150 g", "4 x 90 g", "2 stuks", "Tros", "per stuk", soms leeg.
//   - Geen streepjescode (EAN) in de zoekresultaten.

export const STORE = 'ah';
const round2 = n => Math.round(n * 100) / 100;
const num = s => parseFloat(String(s).replace(',', '.'));

// Verpakking → { unit: 'kg' | 'l' | 'st', qty } (qty in kg, l of stuks). Onbekend ("Tros") → { unit: 'st', qty: null }.
export function parseSize(text) {
  const s = String(text || '').toLowerCase().replace(/^ca\.?\s*/, '').replace(/^per\s+/, '').trim();
  const W = { g: ['kg', 0.001], gr: ['kg', 0.001], gram: ['kg', 0.001], kg: ['kg', 1], kilo: ['kg', 1], ml: ['l', 0.001], cl: ['l', 0.01], dl: ['l', 0.1], l: ['l', 1], liter: ['l', 1] };
  let m = s.match(/^(\d+)\s*x\s*(\d+(?:[.,]\d+)?)\s*(g|gr|gram|kg|kilo|ml|cl|dl|l|liter)\b/);
  if (m) { const [u, f] = W[m[3]]; return { unit: u, qty: round3(+m[1] * num(m[2]) * f) }; }
  m = s.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|gram|kg|kilo|ml|cl|dl|l|liter)\b/);
  if (m) { const [u, f] = W[m[2]]; return { unit: u, qty: round3(num(m[1]) * f) }; }
  m = s.match(/^(\d+)\s*(stuks?|st|rollen|rol|eieren|zakjes|tabletten|capsules|pads|plakken)\b/);
  if (m) return { unit: 'st', qty: +m[1] };
  if (/^(stuk|1 stuk)$/.test(s)) return { unit: 'st', qty: 1 };
  return { unit: 'st', qty: null };
}
const round3 = n => Math.round(n * 1000) / 1000;

// "prijs per kg €16.60" → { unit: 'kg', price: 16.6 } (alleen als we de verpakking niet konden lezen)
export function parseUnitPrice(text) {
  const m = String(text || '').match(/per\s+(kg|kilo|liter|l|stuk)\s*€\s*(\d+(?:[.,]\d+)?)/i);
  if (!m) return null;
  const u = m[1].toLowerCase();
  return { unit: u === 'liter' || u === 'l' ? 'l' : u === 'stuk' ? 'st' : 'kg', price: num(m[2]) };
}

const NUTRI = /^[A-E]$/;
const FAR = '2900-01-01'; // "bonus" tot 2999: geen echte weekbonus

// Eén product uit de zoekresultaten → rij voor grocery_products (of null als het niet bruikbaar is).
export function normalize(p, fetchedAt = new Date().toISOString()) {
  if (!p || p.webshopId == null || !p.title) return null;
  const was = typeof p.priceBeforeBonus === 'number' ? p.priceBeforeBonus : null;
  const now = typeof p.currentPrice === 'number' ? p.currentPrice : null;
  const price = now ?? was;
  const until = p.bonusEndDate && p.bonusEndDate < FAR ? p.bonusEndDate : null;
  const weekBonus = !!p.isBonus && !p.isVirtualBundle && (until || now != null);
  const bonus = weekBonus ? String(p.bonusMechanism || '').trim().slice(0, 60) : '';
  let { unit, qty } = parseSize(p.salesUnitSize);
  if (qty == null && price) {
    // Verpakking niet te lezen: terugrekenen uit de prijs per kilo of liter (gewone prijs, dus met de gewone prijs).
    const up = parseUnitPrice(p.unitPriceDescription);
    if (up && up.unit !== 'st' && up.price > 0) { unit = up.unit; qty = round3((was ?? price) / up.price); }
  }
  const img = (p.images || []).find(i => i && i.width === 200) || (p.images || [])[0];
  return {
    store: STORE,
    product_id: String(p.webshopId),
    title: String(p.title).slice(0, 160),
    brand: String(p.brand || '').slice(0, 80),
    size: String(p.salesUnitSize || '').slice(0, 40),
    price: price == null ? null : round2(price),
    price_was: weekBonus && now != null && was != null && was > now ? round2(was) : null,
    bonus,
    bonus_until: weekBonus ? until : null,
    unit,
    unit_qty: qty,
    nutriscore: NUTRI.test(String(p.nutriscore || '')) ? p.nutriscore : null,
    category: String(p.mainCategory || '').slice(0, 80),
    sub_category: String(p.subCategory || '').slice(0, 80),
    image: img && /^https:\/\/static\.ah\.nl\//.test(img.url) ? img.url : '',
    available: p.isOrderable !== false && (p.orderAvailabilityStatus == null || p.orderAvailabilityStatus === 'IN_ASSORTMENT'),
    fetched_at: fetchedAt,
  };
}

// Zoekresultaten → rijen, zonder online meerpakken en dubbelen.
export function normalizeList(products, fetchedAt) {
  const out = [], seen = new Set();
  for (const p of products || []) {
    if (!p || p.isVirtualBundle) continue;
    const r = normalize(p, fetchedAt);
    if (r && !seen.has(r.product_id)) { seen.add(r.product_id); out.push(r); }
  }
  return out;
}

// Zoekterm schoonmaken: kort, zonder rare tekens.
export function cleanQuery(q) {
  return String(q || '').replace(/[^\p{L}\p{N}\s%&'+-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}
