// Financiën — rekenwerk zonder scherm (testbaar in node): bedragen, regels, overzicht per maand, vaste lasten.
// Bedragen intern in centen (gehele getallen), zodat optellen precies klopt.

export const GROUPS = [
  ['income', 'Inkomen'], ['fixed', 'Vaste lasten'], ['household', 'Huishouden'], ['transport', 'Vervoer'],
  ['leisure', 'Vrije tijd'], ['savings', 'Sparen'], ['other', 'Overig'],
];
export const groupName = g => (GROUPS.find(x => x[0] === g) || [g, g])[1];
export const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const MSH = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const cents = x => Math.round(Number(x) * 100);
// 123456 → "€ 1.234,56"; met sign: "+€ 12,50" / "−€ 12,50". Zonder centen (whole) bij grote totalen.
export function fmt(c, { sign = false, whole = false } = {}) {
  const neg = c < 0, abs = Math.abs(c);
  const eur = Math.floor(abs / 100), ct = abs % 100;
  const e = String(whole ? Math.round(abs / 100) : eur).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = '€ ' + e + (whole ? '' : ',' + String(ct).padStart(2, '0'));
  return (neg ? '−' : sign && c > 0 ? '+' : '') + body;
}

export const month = d => String(d).slice(0, 7); // "2026-11-24" → "2026-11"
export function addMonths(m, n) { let [y, mm] = m.split('-').map(Number); mm += n; y += Math.floor((mm - 1) / 12); mm = ((mm - 1) % 12 + 12) % 12 + 1; return `${y}-${String(mm).padStart(2, '0')}`; }
export const monthName = m => { const [y, mm] = m.split('-').map(Number); return `${MONTHS[mm - 1]} ${y}`; };
export const shortDate = d => { const [y, m, dd] = d.split('-').map(Number); return `${dd} ${MSH[m - 1]}${y !== new Date().getFullYear() ? ' ' + y : ''}`; };

/* ---------- regels ---------- */
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
export function ruleMatches(rule, tx) {
  const p = norm(rule.pattern); if (p.length < 2) return false;
  const c = cents(tx.amount);
  if (rule.direction === 'in' && c <= 0) return false;
  if (rule.direction === 'out' && c >= 0) return false;
  return norm(rule.field === 'description' ? tx.description : tx.counterparty).includes(p);
}
// Specifiekste regel eerst (langste tekst), dan richting boven "alles", dan de oudste.
export const sortRules = rules => [...rules].sort((a, b) => norm(b.pattern).length - norm(a.pattern).length || (b.direction ? 1 : 0) - (a.direction ? 1 : 0) || String(a.id).localeCompare(String(b.id)));
export function categorize(rules, tx) { const r = sortRules(rules).find(x => ruleMatches(x, tx)); return r ? r.category_id : null; }
// Welke transacties krijgen door de regels een andere soort? Zelf gekozen soorten blijven staan.
export function ruleChanges(rules, txs) {
  const sorted = sortRules(rules), out = [];
  for (const t of txs) {
    if (t.category_by === 'manual') continue;
    const r = sorted.find(x => ruleMatches(x, t)), cat = r ? r.category_id : null;
    if (cat !== (t.category_id || null)) out.push({ id: t.id, category_id: cat });
  }
  return out;
}
// Voorstel voor een regel uit een tegenpartij: "Albert Heijn 1234 AMSTERDAM" → "Albert Heijn".
export function suggestPattern(s) {
  const words = String(s || '').replace(/[*#]/g, ' ').trim().split(/\s+/), keep = [];
  for (const w of words) { if (/\d/.test(w) && keep.length) break; if (/\d/.test(w)) continue; keep.push(w); if (keep.join(' ').length >= 30) break; }
  return keep.join(' ').replace(/\s*(b\.?v\.?|n\.?v\.?)$/i, '').slice(0, 40) || String(s || '').slice(0, 40);
}

/* ---------- overzicht ---------- */
// txs: transacties (met category_id, excluded), cats: soorten. Alleen maand m.
// → { inC, outC, netC, cats: [{ id, cat, c, n }], open: n (niet ingedeeld), openC, excluded: n }
export function summary(txs, cats, m) {
  const live = new Map(cats.filter(c => !c.deleted).map(c => [c.id, c]));
  const by = new Map(); let inC = 0, outC = 0, open = 0, openC = 0, excluded = 0;
  for (const t of txs) {
    if (month(t.booked_on) !== m) continue;
    if (t.excluded) { excluded++; continue; }
    const c = cents(t.amount);
    if (c >= 0) inC += c; else outC += c;
    const cat = live.get(t.category_id);
    if (!cat) { open++; openC += c; continue; }
    const x = by.get(cat.id) || { id: cat.id, cat, c: 0, n: 0 }; x.c += c; x.n++; by.set(cat.id, x);
  }
  const list = [...by.values()].sort((a, b) => Math.abs(b.c) - Math.abs(a.c));
  return { inC, outC, netC: inC + outC, cats: list, open, openC, excluded };
}
// Gemiddelde per soort over de n maanden vóór m (alleen maanden waarin er al transacties waren).
export function averages(txs, cats, m, n = 3) {
  const months = new Set(txs.map(t => month(t.booked_on)));
  const prev = Array.from({ length: n }, (_, i) => addMonths(m, -1 - i)).filter(x => months.has(x));
  const tot = new Map();
  for (const pm of prev) for (const x of summary(txs, cats, pm).cats) tot.set(x.id, (tot.get(x.id) || 0) + x.c);
  return { months: prev.length, avg: new Map([...tot].map(([k, v]) => [k, Math.round(v / prev.length)])) };
}
// Per groep (Inkomen, Vaste lasten, …): de soorten met hun totaal, groepen in vaste volgorde.
export function byGroup(sum) {
  return GROUPS.map(([g, name]) => { const items = sum.cats.filter(x => x.cat.grp === g); return { g, name, items, c: items.reduce((s, x) => s + x.c, 0) }; }).filter(x => x.items.length);
}

/* ---------- vaste lasten ---------- */
// Terugkerende afschrijvingen: dezelfde tegenpartij in minstens 3 verschillende maanden van de laatste 6,
// met ongeveer hetzelfde bedrag (binnen 15% of € 5 van de mediaan). → [{ name, c (mediaan), day, last, next, category_id, n }]
export function recurring(txs, today) {
  const from = addMonths(month(today), -5), groups = new Map();
  for (const t of txs) {
    const c = cents(t.amount);
    if (t.excluded || c >= 0 || month(t.booked_on) < from || !t.counterparty) continue;
    const k = norm(suggestPattern(t.counterparty)); if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push({ ...t, c });
  }
  const out = [];
  for (const list of groups.values()) {
    const sorted = list.map(t => t.c).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
    const close = list.filter(t => Math.abs(t.c - med) <= Math.max(Math.abs(med) * 0.15, 500));
    const months = new Set(close.map(t => month(t.booked_on)));
    if (months.size < 3 || close.length > months.size * 2) continue; // vaker dan twee keer per maand = geen vaste last
    close.sort((a, b) => a.booked_on.localeCompare(b.booked_on));
    const last = close[close.length - 1], days = close.map(t => +t.booked_on.slice(8)).sort((a, b) => a - b), day = days[Math.floor(days.length / 2)];
    const nm = addMonths(month(last.booked_on), 1), dim = new Date(+nm.slice(0, 4), +nm.slice(5), 0).getDate();
    const cat = [...close].reverse().find(t => t.category_id);
    out.push({ name: suggestPattern(last.counterparty), c: med, day, last: last.booked_on, next: `${nm}-${String(Math.min(day, dim)).padStart(2, '0')}`, category_id: cat ? cat.category_id : null, n: close.length });
  }
  return out.sort((a, b) => a.c - b.c);
}

/* ---------- zoeken en filteren ---------- */
// f = { m (maand of ''), cat (id, 'open', 'excluded' of ''), q, acc (rekening-id of '') }
export function filter(txs, cats, f) {
  const live = new Set(cats.filter(c => !c.deleted).map(c => c.id)), q = norm(f.q);
  return txs.filter(t => (!f.m || month(t.booked_on) === f.m) && (!f.acc || t.account_id === f.acc)
    && (!f.cat || (f.cat === 'open' ? !t.excluded && !live.has(t.category_id) : f.cat === 'excluded' ? t.excluded : !t.excluded && t.category_id === f.cat))
    && (!q || norm(`${t.counterparty} ${t.description}`).includes(q) || fmt(cents(t.amount)).includes(f.q.trim())))
    .sort((a, b) => b.booked_on.localeCompare(a.booked_on) || String(b.ext_id).localeCompare(String(a.ext_id)));
}
