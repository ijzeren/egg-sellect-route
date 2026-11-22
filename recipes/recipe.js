// Gerechten — logica zonder scherm (ook te testen met node --test).
//
// Een recept (tabel recipes):
//   { id, team_id, user_id, author, title, intro, category, servings,
//     ingredients: ['200 g spinazie', '2 uien', …],                    één regel per ingrediënt
//     steps: [{ text, min, par, max?, title?, section?, temp?, core? }],
//                                      bereidingsschema: min = duur in minuten (waarmee gepland wordt), max = bovengrens
//                                      bij een bereik (4–6 uur), par = tegelijk met de vorige stap, title = korte kop,
//                                      section = fase (Voorbereiding, Roken …), temp = oven/smoker, core = kerntemperatuur
//     tools: ['Smoker', 'Kernthermometer'],                            benodigdheden
//     tips: [{ label, text }],                                          tips en opmerkingen
//     pairs: [{ id?, text }],                                           past goed bij: een ander gerecht (id) of een
//                                                                       vrije suggestie (alleen text, bijv. 'Friet')
//     health_score: 1-10 | null, health_notes, health_scored_at,       ingevuld door de Assistent (zie docs/recipe-scores.md)
//     deleted, created_at, updated_at }
// Sterren (tabel recipe_ratings): { recipe_id, user_id, stars 1-5 } — ieder gezinslid één keer per gerecht.

export const CATEGORIES = [
  ['main', 'Hoofdgerecht'], ['soup', 'Soep'], ['salad', 'Salade'], ['side', 'Bijgerecht'], ['sauce', 'Saus en dip'], ['starter', 'Voorgerecht'],
  ['dessert', 'Nagerecht'], ['breakfast', 'Ontbijt en lunch'], ['baking', 'Bakken'], ['snack', 'Snack'],
];
export const categoryName = id => (CATEGORIES.find(c => c[0] === id) || CATEGORIES[0])[1];

/* ---------- ingrediënten omrekenen naar aantal personen ---------- */
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
// "1,5 el olie" → { q: 1.5, rest: 'el olie' }; "½ citroen" → 0.5; "1 1/2 kopje" → 1.5; zonder getal: q = null.
// Bereik: "3,5–4,5 kg brisket" → { q: 3.5, q2: 4.5, rest: 'kg brisket' }.
export function parseIngredient(line) {
  const s = String(line || '').trim();
  const m = s.match(/^(\d+(?:[.,]\d+)?)?\s*(?:(\d+)\/(\d+)|([½¼¾⅓⅔]))?(?:\s*[–-]\s*(\d+(?:[.,]\d+)?))?(?=\s|$|[a-zA-Z])\s*(.*)$/);
  if (!m || (m[1] == null && m[2] == null && m[4] == null)) return { q: null, rest: s };
  let q = m[1] != null ? parseFloat(m[1].replace(',', '.')) : 0;
  if (m[2] != null) q += +m[2] / +m[3];
  if (m[4] != null) q += FRAC[m[4]];
  const out = { q, rest: m[6] };
  if (m[5] != null) out.q2 = parseFloat(m[5].replace(',', '.'));
  return out;
}
export function fmtQty(q) {
  if (q == null) return '';
  const whole = Math.floor(q + 1e-9), f = q - whole;
  const near = (a, b) => Math.abs(a - b) < 0.04;
  const frac = near(f, 0) ? '' : near(f, 0.5) ? '½' : near(f, 0.25) ? '¼' : near(f, 0.75) ? '¾' : near(f, 1 / 3) ? '⅓' : near(f, 2 / 3) ? '⅔' : null;
  if (frac === null) return String(Math.round(q * 10) / 10).replace('.', ',');
  if (near(f, 1)) return String(whole + 1);
  return whole ? `${whole}${frac ? ' ' + frac : ''}` : frac || '0';
}
// Grote hoeveelheden (gram, ml) afronden op hele getallen, kleine op breuken.
export function scaleLine(line, factor) {
  const { q, q2, rest } = parseIngredient(line);
  if (q == null || factor === 1) return String(line || '').trim();
  const f = v => (v >= 20 ? String(Math.round(v)) : fmtQty(v));
  return `${f(q * factor)}${q2 != null ? '–' + f(q2 * factor) : ''} ${rest}`.trim();
}

/* ---------- bereidingsschema ---------- */
// Elke stap duurt `min` minuten; een stap met par = true begint tegelijk met de vorige.
// → [{ i, text, min, from, to }] in minuten vanaf het begin, en de totale tijd.
export function timeline(steps) {
  const out = []; let prevStart = 0, end = 0;
  (steps || []).forEach((st, i) => {
    const min = Math.max(0, Math.round(+st.min || 0));
    const from = i && st.par ? prevStart : end;
    out.push({ i, text: st.text, min, from, to: from + min, par: !!(i && st.par) });
    prevStart = from; end = Math.max(end, from + min);
  });
  return { steps: out, total: end };
}
export const totalMinutes = steps => timeline(steps).total;
// Wanneer begin je met elke stap om op `eatAt` ('18:30') aan tafel te zitten? Ook over meerdere dagen:
// day = 0 op de dag van het eten, -1 de dag ervoor, enz.
export function plan(steps, eatAt) {
  const t = timeline(steps), [h, m] = String(eatAt || '18:00').split(':').map(Number);
  const startMin = h * 60 + m - t.total;
  const at = x => { const v = startMin + x, day = Math.floor(v / 1440), c = v - day * 1440; return { day, at: `${String(Math.floor(c / 60)).padStart(2, '0')}:${String(c % 60).padStart(2, '0')}` }; };
  const s0 = at(0);
  return { start: s0.at, startDay: s0.day, total: t.total, steps: t.steps.map(s => ({ ...s, ...at(s.from) })) };
}
export const dayLabel = d => (!d ? '' : d === -1 ? 'dag ervoor' : d < -1 ? `${-d} dagen eerder` : d === 1 ? 'dag erna' : `${d} dagen later`);
export function fmtMinutes(n) {
  n = Math.round(+n || 0);
  if (!n) return '';
  if (n < 60) return `${n} min`;
  if (n >= 2880 && n % 1440 === 0) return `${n / 1440} dagen`;
  return `${Math.floor(n / 60)} uur${n % 60 ? ' ' + (n % 60) + ' min' : ''}`;
}
// "4–6 uur", "20–30 min", "45 min – 1 uur 15 min"; zonder bovengrens gewoon de duur.
export function fmtRange(min, max) {
  if (!max || max <= min) return fmtMinutes(min);
  if (min % 60 === 0 && max % 60 === 0 && min >= 60) return `${min / 60}–${max / 60} uur`;
  if (max < 60) return `${min}–${max} min`;
  return `${fmtMinutes(min)} – ${fmtMinutes(max)}`;
}
// Stappen per fase (section), in volgorde: [{ section, steps: [{ …stap, n: volgnummer }] }].
export function sections(steps) {
  const out = [];
  (steps || []).forEach((s, i) => {
    // Een stap zonder section hoort bij de fase van de vorige stap.
    if (!out.length || (s.section && out[out.length - 1].section !== s.section)) out.push({ section: s.section || '', steps: [] });
    out[out.length - 1].steps.push({ ...s, n: i + 1 });
  });
  return out;
}

/* ---------- sterren en gezondheid ---------- */
export function ratingOf(ratings, recipeId) {
  const list = (ratings || []).filter(r => r.recipe_id === recipeId && r.stars >= 1);
  const avg = list.length ? list.reduce((a, r) => a + r.stars, 0) / list.length : 0;
  return { avg, count: list.length, list };
}
export const fmtStars = avg => avg ? (Math.round(avg * 10) / 10).toFixed(1).replace('.', ',') : '';
export function healthLabel(score) {
  if (score == null) return { cls: 'none', text: 'Score volgt' };
  if (score >= 8) return { cls: 'good', text: 'Heel gezond' };
  if (score >= 6) return { cls: 'good', text: 'Gezond' };
  if (score >= 4) return { cls: 'mid', text: 'Af en toe' };
  return { cls: 'low', text: 'Liever niet vaak' };
}

// Sorteren: 'top' (sterren, dan aantal), 'new', 'health', 'az'.
export function sortRecipes(list, ratings, by = 'top') {
  const r = new Map(list.map(x => [x.id, ratingOf(ratings, x.id)]));
  const cmp = {
    top: (a, b) => r.get(b.id).avg - r.get(a.id).avg || r.get(b.id).count - r.get(a.id).count || a.title.localeCompare(b.title, 'nl'),
    new: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
    health: (a, b) => (b.health_score ?? -1) - (a.health_score ?? -1) || a.title.localeCompare(b.title, 'nl'),
    az: (a, b) => a.title.localeCompare(b.title, 'nl'),
  }[by] || (() => 0);
  return list.slice().sort(cmp);
}
// Zoeken in titel, ingrediënten en wie het plaatste.
export function matches(x, q) {
  q = String(q || '').trim().toLowerCase();
  if (!q) return true;
  return [x.title, x.author, x.intro, ...(x.ingredients || []), ...(x.tools || [])].some(s => String(s || '').toLowerCase().includes(q));
}

// Wat een gezinslid mag invullen; gezondheid niet (dat doet de Assistent).
// Stappen tot 3 dagen (pekelen, sous vide).
export const MAX_STEP_MIN = 4320;
const str = (v, n) => String(v ?? '').trim().slice(0, n);
function cleanStep(s) {
  const min = Math.min(MAX_STEP_MIN, Math.max(0, Math.round(+s.min || 0)));
  const out = { text: str(s.text, 1000), min, par: !!s.par };
  const max = Math.min(MAX_STEP_MIN, Math.round(+s.max || 0));
  if (max > min) out.max = max;
  for (const [k, n] of [['title', 80], ['section', 60], ['temp', 40], ['core', 40]]) { const v = str(s[k], n); if (v) out[k] = v; }
  return out;
}
export function clean(input) {
  const lines = (v, n = 80) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(s => String(s).trim()).filter(Boolean).slice(0, n);
  const tips = (Array.isArray(input.tips) ? input.tips : String(input.tips || '').split('\n').filter(l => l.trim()).map(l => {
    const m = l.trim().match(/^([^:]{1,40}):\s+(.+)$/); return m ? { label: m[1], text: m[2] } : { label: '', text: l.trim() };
  })).map(t => ({ label: str(t && t.label, 40), text: str(t && t.text, 500) })).filter(t => t.text).slice(0, 20);
  return {
    title: str(input.title, 120),
    intro: str(input.intro, 1000),
    category: CATEGORIES.some(c => c[0] === input.category) ? input.category : 'main',
    servings: String(input.servings ?? '').trim() === '' || isNaN(+input.servings) ? 4 : Math.min(30, Math.max(1, Math.round(+input.servings))),
    ingredients: lines(input.ingredients),
    steps: (input.steps || []).map(cleanStep).filter(s => s.text).slice(0, 40).map((s, i) => (i ? s : { ...s, par: false })),
    tools: lines(input.tools, 30).map(t => t.slice(0, 120)),
    tips,
    pairs: cleanPairs(input.pairs),
  };
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function cleanPairs(v) {
  const out = [], seen = new Set();
  for (const p of Array.isArray(v) ? v : []) {
    const id = p && UUID.test(String(p.id || '')) ? String(p.id) : '', text = str(p && p.text, 60);
    const key = id || text.toLowerCase();
    if ((id || text) && !seen.has(key)) { seen.add(key); out.push(id ? { id, text } : { text }); }
  }
  return out.slice(0, 20);
}
// "Past goed bij" voor een gerecht: zijn eigen koppelingen én gerechten die naar dit gerecht verwijzen
// (bijv. de tzatziki zegt dat hij bij de brisket past → de brisket toont de tzatziki).
// → [{ id?, text }], gekoppelde gerechten eerst; verwijzingen naar verwijderde gerechten vallen weg.
export function pairsFor(x, recipes) {
  const byId = new Map((recipes || []).map(r => [r.id, r]));
  const out = [], seen = new Set();
  const add = p => { const key = p.id || p.text.toLowerCase(); if (!seen.has(key) && p.id !== x.id) { seen.add(key); out.push(p); } };
  for (const p of x.pairs || []) {
    if (p.id) { const r = byId.get(p.id); if (r) add({ id: r.id, text: r.title }); }
    else if (p.text) add({ text: p.text });
  }
  for (const r of recipes || []) if (r.id !== x.id && (r.pairs || []).some(p => p.id === x.id)) add({ id: r.id, text: r.title });
  return out.sort((a, b) => (a.id ? 0 : 1) - (b.id ? 0 : 1));
}

/* ---------- filters ---------- */
// Bereidingswijze, herkend in titel, benodigdheden en stappen.
export const METHODS = [
  ['smoker', 'Smoker', /smoker|\broken\b|gerookt|rookhout/i], ['bbq', 'BBQ', /\bbbq\b|barbecue|\bgrill/i], ['oven', 'Oven', /\boven/i],
  ['airfryer', 'Airfryer', /airfryer/i], ['sousvide', 'Sous vide', /sous[- ]?vide/i], ['pan', 'Pan of wok', /\bpan\b|koekenpan|\bwok|roerbak|braden|bakken in/i],
  ['fry', 'Frituur', /frituur|frituren/i], ['cook', 'Koken', /\bkook|\bkoken|pruttel|sudder|aan de kook/i], ['cold', 'Zonder koken', null],
];
export function methodsOf(x) {
  const text = [x.title, ...(x.tools || []), ...(x.steps || []).map(s => `${s.title || ''} ${s.text || ''} ${s.temp || ''}`)].join(' \n ');
  const found = METHODS.filter(([, , re]) => re && re.test(text)).map(([id]) => id);
  return found.length ? found : ['cold'];
}
// Keuzes voor tijd, personen, gezondheid en sterren: [id, naam, test].
export const TIME_OPTS = [['30', 'Tot 30 min', n => n > 0 && n <= 30], ['60', 'Tot 1 uur', n => n > 0 && n <= 60], ['180', 'Tot 3 uur', n => n > 0 && n <= 180], ['long', 'Langer dan 3 uur', n => n > 180]];
export const SERVING_OPTS = [['1-2', '1–2', n => n <= 2], ['3-4', '3–4', n => n >= 3 && n <= 4], ['5-8', '5–8', n => n >= 5 && n <= 8], ['9+', '9 of meer', n => n >= 9]];
export const HEALTH_OPTS = [['7', 'Gezond (7+)', s => s != null && s >= 7], ['5', '5 of hoger', s => s != null && s >= 5], ['low', 'Af en toe (tot 4)', s => s != null && s <= 4]];
export const STAR_OPTS = [['4', '★ 4 of meer', r => r.count && r.avg >= 4], ['3', '★ 3 of meer', r => r.count && r.avg >= 3], ['none', 'Nog geen sterren', r => !r.count]];
export const emptyFilter = () => ({ cats: [], methods: [], time: '', servings: '', health: '', stars: '', withIng: '', withoutIng: '' });
const words = s => String(s || '').toLowerCase().split(/[,;]+/).map(w => w.trim()).filter(Boolean);
export function filterCount(f) {
  f = { ...emptyFilter(), ...(f || {}) };
  return f.cats.length + f.methods.length + [f.time, f.servings, f.health, f.stars].filter(Boolean).length + words(f.withIng).length + words(f.withoutIng).length;
}
// Gerecht past bij alle gekozen filters. Binnen soort en bereidingswijze: één van de gekozen is genoeg.
export function passes(x, ratings, f) {
  f = { ...emptyFilter(), ...(f || {}) };
  const opt = (list, id) => (list.find(o => o[0] === id) || [])[2];
  if (f.cats.length && !f.cats.includes(x.category)) return false;
  if (f.methods.length && !methodsOf(x).some(m => f.methods.includes(m))) return false;
  if (f.time && !opt(TIME_OPTS, f.time)(totalMinutes(x.steps))) return false;
  if (f.servings && !opt(SERVING_OPTS, f.servings)(x.servings)) return false;
  if (f.health && !opt(HEALTH_OPTS, f.health)(x.health_score)) return false;
  if (f.stars && !opt(STAR_OPTS, f.stars)(ratingOf(ratings, x.id))) return false;
  const ing = (x.ingredients || []).join('\n').toLowerCase();
  if (words(f.withIng).some(w => !ing.includes(w))) return false;
  if (words(f.withoutIng).some(w => ing.includes(w))) return false;
  return true;
}
// Ingrediënten die vaak voorkomen (voor snelle keuzes): kale namen zonder hoeveelheid, meest gebruikt eerst.
export function commonIngredients(list, n = 12) {
  const count = new Map();
  for (const x of list || []) for (const line of x.ingredients || []) {
    if (/:$/.test(line)) continue;
    const name = parseIngredient(line).rest.replace(/^(g|kg|ml|l|dl|cl|el|tl|stuks?|blik|blikjes?|zak|teentjes?|takjes?|vellen?|snuf|bosje|plakjes?)\s+/i, '')
      .replace(/\(.*?\)|,.*$/g, '').trim().toLowerCase();
    if (name.length >= 2 && name.length < 25) count.set(name, (count.get(name) || 0) + 1);
  }
  return [...count].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'nl')).slice(0, n).map(([w]) => w);
}
