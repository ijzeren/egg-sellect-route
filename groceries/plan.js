// Boodschappen — logica zonder scherm (ook te testen met node --test).
//
// Lijst (grocery_items):     { id, name, qty: getal | null, unit: '' | 'g' | 'kg' | 'el' | …, section, note,
//                              source: 'manual' | 'staple' | 'recipe', staple_id, recipe_ids: [..], checked_at }
// Vaste boodschappen (grocery_staples):
//                            { id, name, qty, unit, section, every_days: 1-365 | null, last_bought: 'jjjj-mm-dd' | null,
//                              snooze_until } — every_days null = "altijd in huis": nooit vanzelf op de lijst en
//                              overgeslagen als het in een gerecht staat. last_bought houdt de database bij (trigger).
// Weekmenu (grocery_menu):   { id, week: maandag 'jjjj-mm-dd', recipe_id, servings, listed_at }
//
// Wanneer een vaste boodschap aan de beurt is, staat hier (dueDate) én in supabase/schema.sql (grocery_fill): houd die gelijk.
import { parseIngredient, fmtQty } from '../recipes/recipe.js';
import { addDays, weekStart, today, fmtShort, pd } from '../training/program.js';

export { addDays, weekStart, today, fmtShort, pd };

/* ---------- afdelingen (volgorde van een ronde door de winkel) ---------- */
export const SECTIONS = [
  ['produce', 'Groente en fruit', '🥦'], ['bread', 'Brood', '🥖'], ['meat', 'Vlees, vis en vega', '🥩'],
  ['cheese', 'Kaas en vleeswaren', '🧀'], ['dairy', 'Zuivel en eieren', '🥛'], ['pantry', 'Pasta, rijst en bakken', '🍝'],
  ['cans', 'Conserven, sauzen en kruiden', '🥫'], ['breakfast', 'Ontbijt en beleg', '🥣'], ['snacks', 'Koek, snoep en chips', '🍪'],
  ['drinks', 'Dranken', '🧃'], ['frozen', 'Diepvries', '🧊'], ['household', 'Huishouden', '🧽'], ['care', 'Verzorging', '🧴'],
  ['other', 'Overig', '🛒'],
];
export const sectionOf = id => SECTIONS.find(s => s[0] === id) || SECTIONS[SECTIONS.length - 1];

// Eerste regel die past, wint. Uitzonderingen en samenstellingen staan daarom vóór de algemene woorden
// (tomatenblokjes → conserven, niet groente; pindakaas → beleg, niet kaas; slagroom → zuivel, niet sla).
const RULES = [
  ['dairy', /koffiemelk|koffieroom/],
  ['cans', /appelmoes|tomatenblokjes|tomatenpuree|gepelde tomaten|passata|paprikapoeder|kokosmelk|bouillon|\bfond\b|currypasta|\bblik/],
  ['household', /wc-?papier|toiletpapier|keukenpapier|keukenrol|afwas|vaatwas|wasmiddel|wasverzachter|schoonmaak|allesreiniger|vuilniszak|afvalzak|aluminiumfolie|bakpapier|huishoudfolie|vershoudfolie|diepvrieszak|spons|batterij|kaars|theelicht|servet|tissue|zakdoek|ontkalker|wc-?blok|bleek/],
  ['care', /tandpasta|tandenborstel|flosdraad|shampoo|conditioner|douche|zeep|deo|scheer|maandverband|tampon|inlegkruis|luier|billendoek|zonnebrand|bodylotion|dagcreme|nachtcreme|watten|pleister|paracetamol|ibuprofen|lippenbalsem|haargel/],
  ['frozen', /diepvries|\bijs(je|jes)?\b|ijsblok|pizza|friet|patat|kroket|bitterbal|frikandel|vissticks|doperwt|edamame/],
  ['breakfast', /ontbijt|muesli|cruesli|granola|havermout|cornflakes|pindakaas|\bjam\b|hagelslag|chocopasta|chocoladepasta|nutella|honing|ontbijtkoek|appelstroop|smeerkaas|notenpasta|vruchtenhagel|muisjes/],
  ['snacks', /koek|chips|snoep|chocola|\bnoten\b|notenmix|cashew|walnot|amandel|pinda|popcorn|\bdrop\b|biscuit|wafel|toastjes|crackers|zoutjes|borrel/],
  ['cans', /tomatensaus|saus|ketchup|mayo|mosterd|sambal|ketjap|pesto|\bolie|olijf|augurk|kappertje|azijn|balsamico|kruiden|kerrie|curry|komijn|kaneel|oregano|laurier|nootmuskaat|chilivlok|kurkuma|knoflookpoeder|uienpoeder|kikkererwt|(kidney|bruine |witte |zwarte |borlotti)bonen|linzen|\bma[iï]s\b|tonijn|ansjovis|zongedroogde/],
  ['drinks', /\bspa\b|bruiswater|mineraalwater|^water$|frisdrank|\bcola\b|\bsap\b|sap$|\bjus\b|limonade|ranja|siroop|\bthee\b|koffie|\bbier\b|\bwijn\b|prosecco|tonic|ice ?tea|smoothie|chocomel|fristi|kombucha/],
  ['pantry', /pasta|spaghetti|macaroni|penne|fusilli|tagliatelle|lasagne|noedel|\bmie\b|rijst|risotto|couscous|bulgur|quinoa|\bmeel\b|bloem$|paneermeel|maizena|suiker|bakpoeder|\bgist\b|vanille|cacao|tortilla|taco|wrap|nori|rijstpapier/],
  ['cheese', /boterhamworst|leverworst|filet americain|pate|achterham|beenham|rauwe ham|serrano|prosciutto|\bham\b|salami|chorizo|rookvlees|kipfilet beleg|kaas|parmezaan|parmigiano|mozzarella|burrata|feta|brie|camembert|cheddar|gorgonzola|gruyere|halloumi|mascarpone|ricotta/],
  ['meat', /vlees|\bkip|kalkoen|gehakt|worst|\bspek|lardon|bacon|pancetta|biefstuk|steak|varkens|karbonade|schnitzel|hamburger|burger|shoarma|saucijs|\blam\b|lams|ribs|brisket|\bvis\b|zalm|kabeljauw|garnaal|garnalen|scampi|mossel|pangasius|tilapia|makreel|haring|forel|tofu|tempeh|\bvega/],
  ['dairy', /melk|yoghurt|kwark|\bvla\b|room\b|crème|creme fraiche|boter|margarine|\beieren\b|\bei\b|\beitjes?\b|skyr|kefir/],
  ['bread', /brood|bolletje|stokbrood|baguette|croissant|\bpita\b|\bnaan\b|beschuit|krentenbol|ciabatta|focaccia|bagel|pistolet|\bbol(len)?\b/],
  ['produce', /groente|fruit|\bsla\b|ijsbergsla|veldsla|rucola|spinazie|andijvie|boerenkool|\b(rode |witte |zilver)?ui(en|tje|tjes)?\b|(bos|lente-?)ui|sjalot|knoflook|tomaat|tomaten|tomaatjes|paprika|komkommer|courgette|aubergine|wortel|\bpeen\b|winterpeen|prei|broccoli|bloemkool|spruit|sperzie|boontjes|tuinbonen|champignon|paddenstoel|avocado|citroen|limoen|sinaasappel|mandarijn|appel|\bpeer\b|peren|banaan|bananen|druif|druiven|aardbei|framboos|frambozen|bessen|mango|ananas|kiwi|meloen|gember|peterselie|koriander|basilicum|bieslook|dille|munt|tijm|rozemarijn|radijs|selderij|venkel|pompoen|aardappel|krieltje|biet|maiskolf|tauge|paksoi|kool|witlof|asperge|rabarber|pruim|perzik|nectarine|kers|granaatappel|vijg|salade|sugarsnap|peultje|(rode |groene )?pepers?$|chilipeper|jalapeno/],
];

export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// Afdeling bij een naam: wat het gezin eerder koos (memory: sleutel → afdeling), anders de woordenlijst.
export function sectionFor(name, memory) {
  const k = nameKey(name);
  if (memory && memory[k]) return memory[k];
  const n = norm(name);
  for (const [sec, re] of RULES) if (re.test(n)) return sec;
  return 'other';
}

/* ---------- eenheden ---------- */
// Canonieke eenheid → schrijfwijzen. '' = stuks zonder woord ("2 uien").
const UNIT_WORDS = {
  g: ['g', 'gr', 'gram'], kg: ['kg', 'kilo', 'kilogram'], ml: ['ml', 'milliliter'], cl: ['cl'], dl: ['dl', 'deciliter'], l: ['l', 'liter', 'liters'],
  el: ['el', 'eetlepel', 'eetlepels'], tl: ['tl', 'theelepel', 'theelepels'], stuk: ['stuk', 'stuks', 'st'],
  teen: ['teen', 'tenen', 'teentje', 'teentjes'], blik: ['blik', 'blikken', 'blikje', 'blikjes'], pak: ['pak', 'pakken', 'pakje', 'pakjes'],
  zak: ['zak', 'zakken', 'zakje', 'zakjes'], bos: ['bos', 'bossen', 'bosje', 'bosjes'], plak: ['plak', 'plakken', 'plakje', 'plakjes'],
  takje: ['takje', 'takjes'], snuf: ['snuf', 'snufje', 'snufjes', 'mespunt', 'mespuntje'], scheut: ['scheut', 'scheutje', 'scheutjes'],
  fles: ['fles', 'flessen', 'flesje', 'flesjes'], pot: ['pot', 'potten', 'potje', 'potjes'], krop: ['krop', 'kroppen'],
  kopje: ['kop', 'kopje', 'kopjes'], doos: ['doos', 'dozen', 'doosje', 'doosjes'], bakje: ['bak', 'bakje', 'bakjes'],
};
const UNIT_ALIAS = Object.fromEntries(Object.entries(UNIT_WORDS).flatMap(([u, ws]) => ws.map(w => [w, u])));
const UNIT_LABEL = {
  g: ['g', 'g'], kg: ['kg', 'kg'], ml: ['ml', 'ml'], l: ['l', 'l'], el: ['el', 'el'], tl: ['tl', 'tl'], stuk: ['stuk', 'stuks'],
  teen: ['teen', 'tenen'], blik: ['blik', 'blikken'], pak: ['pak', 'pakken'], zak: ['zak', 'zakken'], bos: ['bos', 'bossen'],
  plak: ['plak', 'plakken'], takje: ['takje', 'takjes'], snuf: ['snufje', 'snufjes'], scheut: ['scheutje', 'scheutjes'],
  fles: ['fles', 'flessen'], pot: ['pot', 'potten'], krop: ['krop', 'kroppen'], kopje: ['kopje', 'kopjes'], doos: ['doos', 'dozen'], bakje: ['bakje', 'bakjes'],
};
export const UNITS = Object.keys(UNIT_LABEL);
// Rekenen in één basiseenheid: gewicht in g, volume in ml, stuks zonder eenheid.
const BASE = { g: ['g', 1], kg: ['g', 1000], ml: ['ml', 1], cl: ['ml', 10], dl: ['ml', 100], l: ['ml', 1000], stuk: ['', 1] };
const toBase = (q, unit) => { const [u, m] = BASE[unit] || [unit || '', 1]; return [q == null ? null : q * m, u]; };
// Wat je per stuk koopt, rond je naar boven af (1,5 ui → 2 uien). Lepels en snufjes niet.
const WHOLE = new Set(['', 'teen', 'blik', 'pak', 'zak', 'bos', 'plak', 'fles', 'pot', 'krop', 'doos', 'bakje', 'takje']);

// Uit de basiseenheid naar wat je op de lijst zet: 1500 g → 1,5 kg; 1,25 ui → 2.
export function fromBase(q, bu) {
  if (q == null) return { qty: null, unit: bu === '' ? '' : bu };
  if (bu === 'g') return q >= 1000 ? { qty: Math.round(q / 10) / 100, unit: 'kg' } : { qty: Math.round(q), unit: 'g' };
  if (bu === 'ml') return q >= 1000 ? { qty: Math.round(q / 10) / 100, unit: 'l' } : { qty: Math.round(q), unit: 'ml' };
  if (WHOLE.has(bu)) return { qty: Math.max(1, Math.ceil(q - 1e-9)), unit: bu };
  return { qty: Math.round(q * 4) / 4 || 0.25, unit: bu };
}

// "3 uien", "1,5 kg", "2 blikken", "½ el"; zonder hoeveelheid ''.
export function fmtAmount(qty, unit) {
  if (qty == null || qty === '') return '';
  const n = fmtQty(+qty);
  if (!unit) return n;
  const l = UNIT_LABEL[unit] || [unit, unit];
  return `${n} ${+qty > 1 ? l[1] : l[0]}`;
}
export const unitLabel = (unit, qty = 2) => unit ? (UNIT_LABEL[unit] || [unit, unit])[+qty > 1 ? 1 : 0] : 'stuks';

/* ---------- een regel lezen ---------- */
// Zout, peper en water koop je niet voor één gerecht: die slaat de app over.
const BASIC = /^(zout|grof zout|zeezout|(versgemalen |zwarte |witte )*peper|zout en (versgemalen |zwarte )*peper|peper en zout|(lauw|koud|warm|heet|kokend)?e? ?water|ijsblokjes)$/;
export const isBasic = name => BASIC.test(norm(name).replace(/\b(naar smaak|naar wens|optioneel)\b/g, '').replace(/[()]/g, '').trim());

// "1 blik tomatenblokjes (400 g)" → { qty: 1, unit: 'blik', name: 'tomatenblokjes' }
// "2 rode uien, gesnipperd" → { qty: 2, unit: '', name: 'rode uien' }; "Voor de saus:" → null (tussenkop).
// Bereik ("3-4 tomaten"): voor boodschappen telt de bovengrens.
export function parseLine(line) {
  let s = String(line || '').replace(/\s+/g, ' ').trim().replace(/^[-•*·]\s*/, '');
  if (!s || /:$/.test(s)) return null;
  const { q, q2, rest } = parseIngredient(s);
  let words = rest.split(' '), unit = '';
  const first = norm(words[0]).replace(/\.$/, '');
  if (UNIT_ALIAS[first] && q != null) { unit = UNIT_ALIAS[first]; words = words.slice(1); }
  let name = words.join(' ').replace(/\([^)]*\)/g, ' ').split(',')[0].replace(/\s+/g, ' ').trim();
  name = name.replace(/^(van de|van|de|het)\s+/i, '').replace(/\s+(naar smaak|naar wens)$/i, '').trim();
  if (!name) return null;
  return { qty: q == null ? null : q2 != null ? Math.max(q, q2) : q, unit, name };
}

/* ---------- namen vergelijken ---------- */
// "uien" = "ui", "tomaten" = "tomaat", "citroenen" = "citroen", "paprika's" = "paprika". Alleen het laatste woord
// telt mee in meervoud/enkelvoud; "rode ui" en "ui" blijven verschillend.
const IRREGULAR = { eieren: 'ei', eitjes: 'ei', eitje: 'ei' };
const collapse = w => w.replace(/([aeou])\1(?=[^aeiou]*$)/, '$1');
function variants(name) {
  const words = norm(name).replace(/'s\b/g, '').replace(/[^a-z0-9 -]/g, '').split(' ').filter(Boolean);
  const last = words.pop() || '', pre = words.length ? words.join(' ') + ' ' : '';
  const forms = new Set([last]);
  if (IRREGULAR[last]) forms.add(IRREGULAR[last]);
  if (last.length >= 4 && last.endsWith('en')) forms.add(last.slice(0, -2));
  if (last.length >= 4 && /[^aeiou]s$/.test(last)) forms.add(last.slice(0, -1));
  return new Set([...forms].map(f => pre + collapse(f)));
}
export function sameName(a, b) {
  const va = variants(a);
  for (const v of variants(b)) if (va.has(v)) return true;
  return false;
}
// Vaste sleutel voor het onthouden van een afdeling: de kortste vorm.
export const nameKey = name => [...variants(name)].sort((a, b) => a.length - b.length || a.localeCompare(b))[0] || '';

/* ---------- gerechten → boodschappen ---------- */
// sources: [{ recipe: { id, servings, ingredients: [..] }, servings }]
// → [{ name, qty, unit, recipe_ids, lines, basic, section }] opgeteld over alle gerechten.
export function combine(sources, memory) {
  const out = [];
  for (const { recipe, servings } of sources || []) {
    if (!recipe) continue;
    const factor = (+servings || recipe.servings || 1) / (recipe.servings || 1);
    for (const line of recipe.ingredients || []) {
      const p = parseLine(line); if (!p) continue;
      const [q, bu] = toBase(p.qty == null ? null : p.qty * factor, p.unit);
      // zelfde ingrediënt met dezelfde eenheid optellen; zonder hoeveelheid samenvoegen met wat er al staat
      let e = out.find(x => sameName(x.name, p.name) && (x.bu === bu || x.q == null || q == null));
      if (!e) { e = { name: p.name, q: null, bu, best: -1, recipe_ids: [], lines: [] }; out.push(e); }
      if (q != null) { if (e.q == null) e.bu = bu; e.q = (e.q || 0) + q; }
      if ((p.qty || 0) > e.best) { e.best = p.qty || 0; e.name = p.name; }
      if (recipe.id && !e.recipe_ids.includes(recipe.id)) e.recipe_ids.push(recipe.id);
      e.lines.push(String(line).trim());
    }
  }
  return out.map(e => ({ name: e.name, ...fromBase(e.q, e.bu), recipe_ids: e.recipe_ids, lines: e.lines, basic: isBasic(e.name), section: sectionFor(e.name, memory) }));
}

// Wat nieuw op de lijst moet en welke regels erbij optellen. open = regels die nog niet zijn afgevinkt.
// → { updates: [{ id, qty, unit, recipe_ids }], inserts: [{ name, qty, unit, section, recipe_ids }] }
export function mergeIntoList(open, entries) {
  const updates = [], inserts = [], pending = new Map();
  for (const e of entries || []) {
    const [q, bu] = toBase(e.qty, e.unit);
    const hit = (open || []).find(it => { const [iq, ibu] = toBase(it.qty, it.unit); return sameName(it.name, e.name) && (ibu === bu || iq == null || q == null); });
    if (!hit) { inserts.push({ name: e.name, qty: e.qty, unit: e.unit || '', section: e.section, recipe_ids: e.recipe_ids || [] }); continue; }
    const cur = pending.get(hit.id) || { id: hit.id, qty: hit.qty, unit: hit.unit || '', recipe_ids: [...(hit.recipe_ids || [])] };
    const [cq, cbu] = toBase(cur.qty, cur.unit);
    if (q != null) Object.assign(cur, fromBase((cq == null ? 0 : cq) + q, cq == null ? bu : cbu));
    for (const r of e.recipe_ids || []) if (!cur.recipe_ids.includes(r)) cur.recipe_ids.push(r);
    pending.set(hit.id, cur);
  }
  for (const u of pending.values()) updates.push(u);
  return { updates, inserts };
}

/* ---------- vaste boodschappen en ritme ---------- */
export const RHYTHMS = [1, 2, 3, 4, 5, 7, 10, 14, 21, 28, 42, 56];
export function rhythmLabel(n) {
  if (!n) return 'Altijd in huis';
  if (n === 1) return 'elke dag';
  if (n === 7) return 'elke week';
  if (n % 7 === 0) return n === 14 ? 'om de 2 weken' : `elke ${n / 7} weken`;
  return `elke ${n} dagen`;
}
// Iets eerder op de lijst dan precies na `every` dagen: wie zaterdag boodschappen doet en vorige week zondag
// melk kocht, heeft die zaterdag weer nodig. Elke week → 2 dagen eerder; om de 2 weken → 3 dagen eerder.
export const margin = every => Math.min(3, Math.round(every / 4));
// Vanaf wanneer staat de vaste boodschap (weer) op de lijst? null = nooit vanzelf (altijd in huis).
export function dueDate(st) {
  if (!st || !st.every_days) return null;
  let d = st.last_bought ? addDays(st.last_bought, st.every_days - margin(st.every_days)) : null;
  if (st.snooze_until && (!d || st.snooze_until > d)) d = st.snooze_until;
  return d;
}
export const isDue = (st, now = today()) => !!(st && st.every_days) && (dueDate(st) == null || dueDate(st) <= now);
// "Nog genoeg in huis": een paar dagen later opnieuw (half het ritme, minstens morgen).
export const snoozeDate = (every, now = today()) => addDays(now, Math.max(1, Math.ceil((every || 2) / 2)));

// Koopt het gezin iets duidelijk vaker of minder vaak dan het ritme? Dan een voorstel (niet stilletjes aanpassen).
// dates: koopdatums ('jjjj-mm-dd'). Minstens 3 tussenpozen nodig; voorstel = mediaan, afgerond op een gangbaar ritme.
export function suggestRhythm(every, dates) {
  const ds = [...new Set(dates || [])].sort();
  if (!every || ds.length < 4) return null;
  const gaps = [];
  for (let i = 1; i < ds.length; i++) gaps.push(Math.round((pd(ds[i]) - pd(ds[i - 1])) / 864e5));
  const recent = gaps.slice(-6).sort((a, b) => a - b), mid = recent.length >> 1;
  const median = recent.length % 2 ? recent[mid] : (recent[mid - 1] + recent[mid]) / 2;
  const near = RHYTHMS.reduce((a, b) => Math.abs(b - median) < Math.abs(a - median) ? b : a);
  if (near === every || Math.abs(median - every) < Math.max(2, every * 0.3)) return null;
  return near;
}

/* ---------- weekmenu ---------- */
export const weekOf = d => weekStart(d || today());
export const toList = (menu, week) => (menu || []).filter(m => m.week === week && !m.deleted);

/* ---------- lijst ---------- */
// Open regels per afdeling, in de volgorde van de winkel; binnen een afdeling op naam.
export function bySection(items) {
  const groups = new Map();
  for (const it of items || []) { const s = sectionOf(it.section)[0]; if (!groups.has(s)) groups.set(s, []); groups.get(s).push(it); }
  return SECTIONS.filter(s => groups.has(s[0])).map(s => ({ section: s, items: groups.get(s[0]).sort((a, b) => a.name.localeCompare(b.name, 'nl')) }));
}
// Afdeling die het gezin eerder koos per naam (nieuwste wint): uit regels van de afgelopen maanden.
export function sectionMemory(history) {
  const m = {};
  for (const it of [...(history || [])].sort((a, b) => String(a.updated_at || '').localeCompare(String(b.updated_at || '')))) if (it.section) m[nameKey(it.name)] = it.section;
  return m;
}

// Hoeveelheid uit een invoerveld: "2" → { qty: 2, unit: '' }, "500 g" → { qty: 500, unit: 'g' }, "" → { qty: null, unit: '' }.
// Niet te lezen ("veel") → null.
export function parseAmount(s) {
  const t = String(s || '').trim();
  if (!t) return { qty: null, unit: '' };
  const p = parseLine(`${t} x`);
  return p && p.name === 'x' && p.qty != null && p.qty > 0 ? { qty: p.qty, unit: p.unit } : null;
}
