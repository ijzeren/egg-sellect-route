// Gerechten — logica zonder scherm (ook te testen met node --test).
//
// Een recept (tabel recipes):
//   { id, team_id, user_id, author, title, intro, category, servings,
//     ingredients: ['200 g spinazie', '2 uien', …],                    één regel per ingrediënt
//     steps: [{ text, min, par }],                                      bereidingsschema: min = duur in minuten,
//                                                                       par = tegelijk met de vorige stap
//     health_score: 1-10 | null, health_notes, health_scored_at,       ingevuld door de Assistent (zie docs/recipe-scores.md)
//     deleted, created_at, updated_at }
// Sterren (tabel recipe_ratings): { recipe_id, user_id, stars 1-5 } — ieder gezinslid één keer per gerecht.

export const CATEGORIES = [
  ['main', 'Hoofdgerecht'], ['soup', 'Soep'], ['salad', 'Salade'], ['side', 'Bijgerecht'], ['starter', 'Voorgerecht'],
  ['dessert', 'Nagerecht'], ['breakfast', 'Ontbijt en lunch'], ['baking', 'Bakken'], ['snack', 'Snack'],
];
export const categoryName = id => (CATEGORIES.find(c => c[0] === id) || CATEGORIES[0])[1];

/* ---------- ingrediënten omrekenen naar aantal personen ---------- */
const FRAC = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
// "1,5 el olie" → { q: 1.5, rest: 'el olie' }; "½ citroen" → 0.5; "1 1/2 kopje" → 1.5; zonder getal: q = null.
export function parseIngredient(line) {
  const s = String(line || '').trim();
  const m = s.match(/^(\d+(?:[.,]\d+)?)?\s*(?:(\d+)\/(\d+)|([½¼¾⅓⅔]))?(?=\s|$|[a-zA-Z])\s*(.*)$/);
  if (!m || (m[1] == null && m[2] == null && m[4] == null)) return { q: null, rest: s };
  let q = m[1] != null ? parseFloat(m[1].replace(',', '.')) : 0;
  if (m[2] != null) q += +m[2] / +m[3];
  if (m[4] != null) q += FRAC[m[4]];
  return { q, rest: m[5] };
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
  const { q, rest } = parseIngredient(line);
  if (q == null || factor === 1) return String(line || '').trim();
  const v = q * factor;
  return `${v >= 20 ? String(Math.round(v)) : fmtQty(v)} ${rest}`.trim();
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
// Wanneer begin je met elke stap om op `eatAt` ('18:30') aan tafel te zitten?
export function plan(steps, eatAt) {
  const t = timeline(steps), [h, m] = String(eatAt || '18:00').split(':').map(Number);
  const startMin = h * 60 + m - t.total;
  const clock = x => { const v = ((startMin + x) % 1440 + 1440) % 1440; return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
  return { start: clock(0), total: t.total, steps: t.steps.map(s => ({ ...s, at: clock(s.from) })) };
}
export const fmtMinutes = n => !n ? '' : n < 60 ? `${n} min` : `${Math.floor(n / 60)} uur${n % 60 ? ' ' + (n % 60) + ' min' : ''}`;

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
  return [x.title, x.author, x.intro, ...(x.ingredients || [])].some(s => String(s || '').toLowerCase().includes(q));
}

// Wat een gezinslid mag invullen; gezondheid niet (dat doet de Assistent).
export function clean(input) {
  const lines = v => (Array.isArray(v) ? v : String(v || '').split('\n')).map(s => String(s).trim()).filter(Boolean).slice(0, 80);
  return {
    title: String(input.title || '').trim().slice(0, 120),
    intro: String(input.intro || '').trim().slice(0, 1000),
    category: CATEGORIES.some(c => c[0] === input.category) ? input.category : 'main',
    servings: String(input.servings ?? '').trim() === '' || isNaN(+input.servings) ? 4 : Math.min(30, Math.max(1, Math.round(+input.servings))),
    ingredients: lines(input.ingredients),
    steps: (input.steps || []).map(s => ({ text: String(s.text || '').trim().slice(0, 1000), min: Math.min(1440, Math.max(0, Math.round(+s.min || 0))), par: !!s.par }))
      .filter(s => s.text).slice(0, 40).map((s, i) => (i ? s : { ...s, par: false })),
  };
}
