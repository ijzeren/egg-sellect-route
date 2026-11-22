// Gerechten — recepten importeren uit schema.org-JSON, Markdown (bijv. uitvoer van Claude) of HTML (een opgeslagen pagina).
// Zonder scherm, dus te testen met node --test (alleen htmlToMarkdown heeft een DOM nodig: DOMParser in de browser).
//
// Herkent per recept:
//   titel          een kop (# Lasagne) die geen sectienaam is; meerdere recepten per bestand kan
//   personen       "Personen: 4", "voor 4 personen", "4 porties", ook in een tabel (| Porties | 4 personen |)
//   soort          "Soort/Categorie: soep", anders geraden uit de titel (soep, salade, taart …)
//   ingrediënten   lijst onder "Ingrediënten" / "Boodschappen"; tussenkoppen ("### Rub") worden groepen;
//                  "**Zout** — ½ tl" wordt "½ tl Zout" (hoeveelheid vooraan, zodat de app kan omrekenen)
//   benodigdheden  "Benodigdheden" naast een ingrediëntenlijst = gereedschap (zonder ingrediëntenlijst = ingrediënten)
//   stappen        lijst of alinea's onder "Bereiding" / "Werkwijze" / …; tussenkoppen = fases;
//                  "1. **Titel** — tekst"; regels "⏱ Tijd: 4 u – 6 u · 🌡 Temperatuur: 120 °C · Kerntemperatuur: 85 °C"
//                  onder een stap; anders minuten uit de tekst; "Ondertussen …" = tegelijk met de vorige stap
//   tips           "Tips" en "Opmerkingen" ("**Label:** tekst"); bronverwijzingen en trefwoorden vallen weg
//   intro          tekst vóór de secties
// schema.org-JSON (@type Recipe): name, description, recipeYield, recipeCategory, recipeIngredient, recipeInstructions,
// tool; met "x-details" (ingrediëntgroepen, stappen met duur/temperaturen, tips) als die er is.
import { clean, CATEGORIES } from './recipe.js';

const SECTION = [
  ['ingredients', /^(ingredi[eë]nten|boodschappen(lijst)?|wat heb je nodig|ingredients)\b/i],
  ['equipment', /^(benodigdheden|materiaal|gereedschap|keukengerei|equipment|tools)\b/i],
  ['steps', /^(bereiding(swijze)?|werkwijze|instructies|stappen|zo maak je het|aan de slag|method|instructions|directions|preparation)\b/i],
  ['notes', /^(tips?|opmerkingen|notities|variaties?|serveertips?|bewaren|goed om te weten|let op|notes)\b/i],
  ['meta', /^(overzicht|in het kort|samenvatting)\b/i],
  ['skip', /^(voedingswaarde|voedingswaarden|nutrition|bron|source|trefwoorden|keywords|tags)\b/i],
];
const plain = s => String(s || '').replace(/\*\*|__|`/g, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/[:：]\s*$/, '').trim();
const unmark = s => String(s || '').replace(/\*\*|__/g, '').replace(/(^|\s)[*_]\(([^)]*)\)[*_]/g, '$1($2)').replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$)/g, '$1$2').trim();
const sectionOf = text => {
  const t = plain(text);
  for (const [k, re] of SECTION) if (re.test(t)) return k;
  if (/\bbereiding(swijze)?\b|\bwerkwijze\b/i.test(t)) return 'steps';   // "Dry Rub — Bereiding", "Bereidingswijze — Oven"
  return null;
};
// Fase uit een kop als "Dry Rub — Bereiding" of "Bereidingswijze — Oven" → "Dry Rub" / "Oven"; "Bereiding" zelf → ''.
const phaseOf = text => plain(text).replace(/\s*[—–-]?\s*\b(bereiding(swijze)?|werkwijze)\b\s*[—–-]?\s*/i, ' ').trim();
const LIST = /^\s*(?:[-*+•–]|\d+[.)]|\[[ xX]\])\s+/;
const stripList = s => s.replace(LIST, '').replace(/^\[[ xX]\]\s*/, '').trim();
const META_LINE = /^(⏱|🌡|🔥|kern|tijd\s*:|temperatuur\s*:)/i;

// Markdown → regels met type: { h: niveau, text } | { li, text, ordered, indent } | { p: text }
function tokens(md) {
  const out = [];
  for (const raw of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { out.push({ blank: true }); continue; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push({ blank: true }); continue; }       // --- scheidingslijn
    if (/^\s*>/.test(line)) { out.push({ p: line.replace(/^\s*>\s?/, '').trim(), quote: true }); continue; } // citaat = gewone tekst
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { out.push({ h: h[1].length, text: h[2].trim() }); continue; }
    // Tabelregel "| Porties | 4 personen |" → "Porties: 4 personen"; scheidingsregels weg.
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      if (cells.every(c => /^:?-*:?$/.test(c))) continue;
      if (cells.length >= 2 && cells[0]) out.push({ p: `${cells[0]}: ${cells.slice(1).join(' ')}`, table: true });
      continue;
    }
    // Een vette regel als kop: "**Ingrediënten**" of "**Bereiding:**"
    const b = line.trim().match(/^(?:\*\*|__)(.+?)(?:\*\*|__):?$/);
    if (b) { out.push({ h: 7, text: b[1].trim() }); continue; }
    if (LIST.test(line)) { out.push({ li: true, text: stripList(line), ordered: /^\s*\d+[.)]/.test(line), indent: line.match(/^\s*/)[0].length }); continue; }
    // Kale regel "Ingrediënten:" telt ook als kop.
    if (/[:：]\s*$/.test(line) && sectionOf(line) && line.length < 40) { out.push({ h: 7, text: line.trim() }); continue; }
    out.push({ p: line.trim() });
  }
  return out;
}

/* ---------- tijden, personen, soort ---------- */
const MIN = /(\d+(?:[.,]\d+)?)\s*(?:[-–tot]+\s*(\d+)\s*)?(minuten|minuut|min\.?|uur|uren|hours?|minutes?)\b/i;
export function minutesIn(text) {
  const m = String(text || '').match(MIN);
  if (!m) return 0;
  const n = parseFloat((m[2] || m[1]).replace(',', '.'));
  return Math.round(/^(uur|uren|hour)/i.test(m[3]) ? n * 60 : n);
}
// "8 u", "2 u 30 min", "45 min – 1 u 15 min", "12 u – 48 u", "min. 2 u 30 min" → { min, max } in minuten.
function oneDuration(s) {
  let t = 0, any = false;
  for (const m of String(s).matchAll(/(\d+(?:[.,]\d+)?)\s*(dagen|dag|d\b|uur|uren|u\b|h\b|minuten|minuut|min)/gi)) {
    const n = parseFloat(m[1].replace(',', '.')), u = m[2].toLowerCase();
    t += /^(dag|d)/.test(u) ? n * 1440 : /^(u|h)/.test(u) ? n * 60 : n; any = true;
  }
  return any ? Math.round(t) : null;
}
export function durationIn(text) {
  const s = String(text || '').replace(/^.*?tijd\s*:\s*/i, '');
  // "10-12 minuten": bereik in één eenheid
  const r = s.match(/^\D*?(\d+)\s*[–-]\s*(\d+)\s*(minuten|min|uur|u)\b/i);
  if (r) { const f = /^u/i.test(r[3]) ? 60 : 1; return { min: +r[1] * f, max: +r[2] * f }; }
  const parts = s.split(/\s+[–-]\s+|\s+tot\s+/);
  const a = oneDuration(parts[0]), b = parts[1] != null ? oneDuration(parts[1]) : null;
  if (a == null) return null;
  return b != null && b > a ? { min: a, max: b } : { min: a, max: 0 };
}
// Metaregel onder een stap → { min, max, temp, core }
function stepMeta(text) {
  const out = {};
  for (const part of String(text).split(/\s+·\s+|;\s*/)) {
    const p = part.replace(/^[⏱🌡🔥️\s]+/u, '').trim();
    if (/^kern/i.test(p)) out.core = p.replace(/^kern\w*\s*[:：]?\s*/i, '').trim();
    else if (/^temp/i.test(p)) out.temp = p.replace(/^temp\w*\s*[:：]?\s*/i, '').trim();
    else if (/^tijd/i.test(p)) { const d = durationIn(p); if (d) Object.assign(out, d); }
  }
  return out;
}
const PAR = /^(ondertussen|intussen|tegelijk(ertijd)?|terwijl|meanwhile)\b|\b(ondertussen|intussen|tegelijkertijd)\b/i;

export function servingsIn(text) {
  const s = String(text || '').replace(/\*\*|__/g, '');
  const m = s.match(/(?:personen|porties?|aantal personen|serves|servings)\s*[:：]?\s*(\d{1,2})/i)
    || s.match(/(?:voor|for)\s+(\d{1,2})\s*(?:personen|persoon|pers\.?|porties?|people)?\b/i)
    || s.match(/\b(\d{1,2})\s*(?:personen|persoon|pers\.|porties?)\b/i);
  return m ? +m[1] : 0;
}
const CAT_WORDS = [
  ['soup', /soep|bouillon/i], ['salad', /salade/i], ['dessert', /toetje|dessert|nagerecht|mousse|pudding|tiramisu|ijs\b/i],
  ['breakfast', /ontbijt|lunch|pannenkoek|poffertje|wentelteef|granola|smoothie|tosti/i], ['baking', /taart|cake|koek|brood|muffin|brownie|bakken/i],
  ['snack', /snack|borrel|dip\b|hapje/i], ['starter', /voorgerecht/i], ['side', /bijgerecht/i], ['main', /hoofdgerecht/i],
];
// Saus of dip: in de categorie overal ("Bijgerecht · Dipsaus"), in de titel alleen vooraan ("Pepersaus — Steak au Poivre",
// niet "Pasta met tomatensaus").
const SAUCE = /saus|\bdip\b|dipsaus|tzatziki|aioli|mayonaise|salsa|pesto|chutney|dressing|\bjus\b/i;
const SAUCE_TITLE = /^(\S*saus|saus|dip|tzatziki|aioli|mayonaise|salsa|pesto|chutney|dressing|jus)\b/i;
export function categoryIn(text, title) {
  const m = String(text || '').replace(/\*\*|__/g, '').match(/(?:soort|categorie|gang|type)\s*[:：]\s*([^\n]+)/i);
  if (m && SAUCE.test(m[1])) return 'sauce';
  if (SAUCE_TITLE.test(String(title || '').trim())) return 'sauce';
  if (m) {
    const v = m[1].trim().toLowerCase();
    const c = CATEGORIES.find(([, name]) => name.toLowerCase() === v || v.startsWith(name.toLowerCase().split(' ')[0]));
    if (c) return c[0];
    for (const [id, re] of CAT_WORDS) if (re.test(v)) return id;
  }
  for (const [id, re] of CAT_WORDS) if (re.test(title || '')) return id;
  return 'main';
}

/* ---------- ingrediënt- en tipregels ---------- */
// "**Zout** — ½ tl *(optioneel)* _(om in te smeren)_" → "½ tl Zout (optioneel, om in te smeren)".
// Meta-opmerkingen over de bron ("eenheid afgeleid") vallen weg.
function ingredientLine(text) {
  const t = String(text || '').trim();
  const m = t.match(/^\*\*(.+?)\*\*\s*[—–:-]+\s*(.+)$/);
  if (!m) return unmark(t);
  const notes = [];
  let amount = m[2].replace(/[*_]\(([^)]*)\)[*_]/g, (_, n) => { notes.push(n); return ''; }).replace(/\s+/g, ' ').trim();
  return joinIngredient(m[1], amount, notes);
}
function joinIngredient(name, amount, notes = []) {
  const keep = notes.map(n => n.trim()).filter(n => n && !/afgeleid|bron|niet vermeld/i.test(n));
  amount = String(amount || '').trim().replace(/^(±|~|ca\.?|circa|ongeveer)\s*/i, '');   // "± 80 g" → "80 g"
  const head = /^\d|^[½¼¾⅓⅔]/.test(amount) ? `${amount} ${name}` : amount && !/niet vermeld/i.test(amount) ? `${name}, ${amount}` : name;
  return unmark(head) + (keep.length ? ` (${keep.join(', ')})` : '');
}
function tipOf(text) {
  const m = String(text || '').match(/^\*\*(.+?)\*\*\s*[:：]?\s*(.+)$/) || String(text || '').match(/^\*\*(.+?):\*\*\s*(.+)$/);
  return m ? { label: plain(m[1]), text: unmark(m[2]) } : { label: '', text: unmark(text) };
}
const isSourceNote = t => /^bron\s*:|^source\s*:/i.test(plain(t));

/* ---------- Markdown → recept ---------- */
function toRecipe(title, toks) {
  let sec = 'intro', phase = '';
  const ing = [], equip = [], steps = [], intro = [], meta = [], tips = [];
  let para = null, last = null;
  for (const t of toks) {
    if (t.h) {
      const k = sectionOf(t.text);
      if (k) { sec = k; phase = k === 'steps' ? phaseOf(t.text) : ''; }
      else if (sec === 'ingredients') ing.push(plain(t.text) + ':');          // tussenkop, bijv. "Rub" of "Voor de saus"
      else if (sec === 'steps') phase = plain(t.text);                       // fase, bijv. "Garen op de smoker"
      para = null; continue;
    }
    if (t.blank) { para = null; continue; }
    const text = t.text || t.p || '';
    // Tabel in de ingrediënten ("| Paprikapoeder | 1 el |") → "1 el Paprikapoeder"; kopregel overslaan.
    if (t.table && sec === 'ingredients') {
      const [name, ...amt] = text.split(/:\s+/);
      if (!/^(ingredi[eë]nt|naam|product)/i.test(name)) ing.push(joinIngredient(unmark(name), unmark(amt.join(': '))));
      continue;
    }
    if (sec === 'meta' || t.table) { meta.push(unmark(text)); continue; }
    if (sec === 'ingredients') { if (t.li || t.p) ing.push(ingredientLine(text)); }
    else if (sec === 'equipment') { if (t.li || t.p) equip.push(unmark(text)); }
    else if (sec === 'steps') {
      if (t.li && last && t.indent > 0 && META_LINE.test(text.replace(/^[^\p{L}⏱🌡]+/u, ''))) { Object.assign(last, stepMeta(text)); continue; }
      let s = text.replace(/^(stap\s*\d+\s*[:.)-]?\s*)/i, '').trim();
      let stitle = '';
      const tm = s.match(/^\*\*(.+?)\*\*\s*[—–:-]+\s*(.+)$/);
      if (tm) { stitle = plain(tm[1]); s = tm[2]; }
      s = unmark(s);
      if (!s) continue;
      if (t.li || !para) {
        last = { text: s }; if (stitle) last.title = stitle;
        if (phase && !steps.some(x => x.section === phase)) last.section = phase;
        steps.push(last); para = t.li ? null : last;
      } else para.text += ' ' + s;
    }
    else if (sec === 'notes') { if (!isSourceNote(text)) tips.push(tipOf(text)); }
    else if (sec === 'intro') intro.push(unmark(text));
  }
  const metaText = [...intro, ...meta].join('\n');
  const hasMeta = steps.some(s => s.min != null || s.temp || s.core);
  const keep = intro.filter(l => !/^(personen|porties?|aantal personen|soort|categorie|gang|bereidingstijd|kooktijd|totale tijd|tijd|voorbereiding|moeilijkheid|serves|servings)\s*[:：]/i.test(l.replace(/^[^\p{L}]+/u, '')));
  const r = {
    title: plain(title),
    servings: servingsIn(metaText) || servingsIn(title) || 4,
    category: categoryIn(metaText, title),
    intro: keep.join(' '),
    ingredients: ing.length ? ing : equip,
    tools: ing.length ? equip : [],
    tips,
    // Staan er tijdregels ("⏱ Tijd: …") bij de stappen, dan geen tijden uit de lopende tekst raden.
    steps: steps.map((s, i) => {
      const d = s.min != null ? { min: s.min, max: s.max || 0 } : { min: hasMeta ? 0 : minutesIn(s.text), max: 0 };
      return { ...s, min: d.min, max: d.max, par: i > 0 && PAR.test(s.text) };
    }),
  };
  r._servingsGuess = !(servingsIn(metaText) || servingsIn(title));
  return r;
}

/* ---------- schema.org-JSON → recept ---------- */
function findRecipes(v) {
  if (!v || typeof v !== 'object') return [];
  if (Array.isArray(v)) return v.flatMap(findRecipes);
  const type = [].concat(v['@type'] || []);
  if (type.includes('Recipe')) return [v];
  return findRecipes(v['@graph'] || []);
}
const txt = v => (typeof v === 'string' ? v : v && (v.text || v.name) || '').trim();
function fromJsonLd(o) {
  const x = o['x-details'] || {};
  const yieldText = [].concat(o.recipeYield || []).map(String).join(' ');
  let ingredients = [];
  if (Array.isArray(x.ingredientgroepen) && x.ingredientgroepen.length) {
    const many = x.ingredientgroepen.length > 1;
    for (const g of x.ingredientgroepen) {
      if (many && g.groep) ingredients.push(`${g.groep}:`);
      for (const it of g.items || []) ingredients.push(joinIngredient(it.name, it.amount, [it.optional ? 'optioneel' : '', it.note || '']));
    }
  } else {
    // "3 el Honing [Braise]" → groepen uit de blokhaken
    let group = null;
    for (const line of [].concat(o.recipeIngredient || [])) {
      const m = String(line).match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
      if (m && m[2] !== group) { group = m[2]; ingredients.push(`${group}:`); }
      ingredients.push(unmark(m ? m[1] : line));
    }
    if (new Set(ingredients.filter(l => l.endsWith(':'))).size <= 1) ingredients = ingredients.filter(l => !l.endsWith(':'));
  }
  let steps = [];
  if (Array.isArray(x.stappen) && x.stappen.length) {
    for (const sec of x.stappen) (sec.stappen || []).forEach((s, i) => {
      const st = { text: s.tekst || '', min: s.duur_min_minuten || 0, max: s.duur_max_minuten || 0 };
      if (s.titel) st.title = s.titel;
      if (i === 0 && sec.sectie) st.section = sec.sectie;
      if (s.temperatuur) st.temp = s.temperatuur;
      if (s.kerntemperatuur) st.core = s.kerntemperatuur;
      steps.push(st);
    });
  } else {
    const walk = (list, section) => [].concat(list || []).forEach((s, i) => {
      if (typeof s === 'string') { steps.push({ text: s, min: minutesIn(s) }); return; }
      if ([].concat(s['@type']).includes('HowToSection')) { walk(s.itemListElement, s.name); return; }
      let text = txt(s);
      const meta = text.match(/\(([^()]*(?:Tijd|Temperatuur|Kerntemperatuur)[^()]*)\)\s*$/);
      const st = { text: meta ? text.slice(0, meta.index).trim() : text, ...(meta ? stepMeta(meta[1]) : { min: minutesIn(text) }) };
      if (s.name && s.name !== text) st.title = s.name;
      if (section && i === 0) st.section = section;
      steps.push(st);
    });
    walk(o.recipeInstructions);
  }
  steps = steps.map((s, i) => ({ ...s, par: i > 0 && PAR.test(s.text) }));
  const tips = [...(x.tips || []).map(t => ({ label: t.label || '', text: t.tekst || t.text || '' })),
    ...(x.opmerkingen || []).filter(t => !isSourceNote(t)).map(t => ({ label: 'Opmerking', text: String(t).replace(/^bron:[^.]*\.\s*/i, '') }))].filter(t => t.text);
  const r = {
    title: o.name || '', intro: o.description || '',
    servings: servingsIn(yieldText) || 4, category: categoryIn(`Categorie: ${String(o.recipeCategory || '').split('/')[0]}`, o.name),
    ingredients, steps, tips,
    tools: [].concat(o.tool || []).map(txt).filter(Boolean),
  };
  r._servingsGuess = !servingsIn(yieldText);
  return r;
}

// Tekst (Markdown of JSON) → [{ recipe (opgeschoond), warnings: [..] }]. Meerdere recepten in één tekst kan.
export function parseRecipes(input, fallbackTitle = '') {
  const s = String(input || '').trim();
  if (/^[[{]/.test(s)) {
    let json = null; try { json = JSON.parse(s); } catch (e) { /* geen JSON: als tekst lezen */ }
    if (json) return findRecipes(json).map(fromJsonLd).map(done).filter(x => x.recipe.ingredients.length || x.recipe.steps.length);
  }
  const toks = tokens(s);
  const isTitle = (t, lvl) => t.h === lvl && !sectionOf(t.text);
  // Kies het kopniveau waarop splitsen de meeste recepten met ingrediënten oplevert.
  let best = null;
  for (const lvl of [1, 2, 3, 4]) {
    const blocks = []; let cur = null;
    for (const t of toks) {
      if (isTitle(t, lvl)) { cur = { title: t.text, toks: [] }; blocks.push(cur); }
      else if (cur) cur.toks.push(t);
    }
    const ok = blocks.map(b => toRecipe(b.title, b.toks)).filter(r => r.ingredients.length || r.steps.length);
    if (ok.length && (!best || ok.length > best.length)) best = ok;
  }
  // Geen koppen met recepten: de hele tekst is één recept (titel = eerste regel of bestandsnaam).
  if (!best) {
    const first = toks.find(t => t.p || t.h);
    const title = fallbackTitle || (first ? first.text || first.p : '');
    const r = toRecipe(title, first && (first.p || first.h) && !fallbackTitle ? toks.slice(toks.indexOf(first) + 1) : toks);
    best = r.ingredients.length || r.steps.length ? [r] : [];
  }
  return best.map(done);
}
function done(raw) {
  const recipe = clean(raw), w = [];
  if (!recipe.title) w.push('Geen naam gevonden');
  if (!recipe.ingredients.length) w.push('Geen ingrediënten gevonden');
  if (!recipe.steps.length) w.push('Geen bereiding gevonden');
  else if (!recipe.steps.some(s => s.min)) w.push('Geen tijden bij de stappen');
  if (raw._servingsGuess) w.push('Aantal personen niet gevonden');
  return { recipe, warnings: w };
}

// Receptpagina in de opbouw van de receptstijlgids (kop met .tag/.subtitle/.meta-item, .ingredients-grid met .ing-group,
// .section-title + .steps met .step-content (h4, p, .time-badge, .temp), .tips-block met .note-item) → Markdown.
function styledToMarkdown(doc) {
  const T = n => (n ? n.textContent : '').replace(/\s+/g, ' ').trim();
  const h1 = doc.querySelector('h1');
  if (h1) h1.querySelectorAll('br').forEach(br => br.replaceWith(' — '));
  const out = [`# ${T(h1) || T(doc.querySelector('title'))}`, ''];
  if (doc.querySelector('.subtitle')) out.push(T(doc.querySelector('.subtitle')), '');
  out.push('## Overzicht', '');
  if (doc.querySelector('.tag')) out.push(`Categorie: ${T(doc.querySelector('.tag'))}`);
  doc.querySelectorAll('.meta-item').forEach(m => out.push(`${T(m.querySelector('.meta-label'))}: ${T(m.querySelector('.meta-value'))}`));
  out.push('');
  const main = doc.querySelector('main') || doc.body;
  let section = '', inSteps = false;
  for (const n of main.querySelectorAll('.section-title, .ingredients-grid, .steps, .tips-block')) {
    if (n.classList.contains('section-title')) { if (!n.closest('.tips-block')) section = T(n); continue; }
    if (n.classList.contains('ingredients-grid')) {
      out.push('## Ingrediënten', '');
      n.querySelectorAll('.ing-group').forEach(g => {
        if (g.querySelector('h3')) out.push(`### ${T(g.querySelector('h3'))}`, '');
        g.querySelectorAll('li').forEach(li => {
          const nameEl = li.querySelector('.ing-name'), opt = li.querySelector('.ing-opt');
          const name = nameEl ? T(nameEl).replace(opt ? T(opt) : '\u0000', '').trim() : T(li);
          const amount = T(li.querySelector('.ing-amount'));
          out.push(`- **${name}**${amount ? ` — ${amount}` : ''}${opt ? ` _(${T(opt)})_` : ''}`);
        });
        out.push('');
      });
    } else if (n.classList.contains('steps')) {
      if (!inSteps) { out.push('## Bereiding', ''); inSteps = true; }
      if (section && !/^(bereiding|ingredi)/i.test(section)) out.push(`### ${section}`, '');
      n.querySelectorAll('.step').forEach((st, i) => {
        const c = st.querySelector('.step-content') || st, h4 = c.querySelector('h4');
        const text = [...c.querySelectorAll('p')].map(T).join(' ');
        out.push(`${i + 1}. ${h4 ? `**${T(h4)}** — ` : ''}${text}`);
        const meta = [...c.querySelectorAll('.time-badge, .temp')].map(b => {
          const t = T(b).replace(/^⏱\s*/, '');
          return b.classList.contains('temp') ? `🌡 Temperatuur: ${t}` : /^kern/i.test(t) ? `Kerntemperatuur: ${t.replace(/^kern\w*\s*/i, '')}` : `⏱ Tijd: ${t}`;
        });
        if (meta.length) out.push(`   - ${meta.join(' · ')}`);
      });
      out.push('');
    } else if (n.classList.contains('tips-block')) {
      out.push('## Tips', '');
      n.querySelectorAll('.note-item').forEach(t => out.push(`- **${T(t.querySelector('strong'))}:** ${T(t.querySelector('span'))}`));
      out.push('');
    }
  }
  return out.join('\n');
}

// HTML (bijv. een artifact) → Markdown, zodat parseRecipes het kan lezen. `doc` = een DOM-document (DOMParser).
export function htmlToMarkdown(doc) {
  // JSON-LD in de pagina? Dat is het betrouwbaarst.
  const ld = [...doc.querySelectorAll('script[type="application/ld+json"]')].map(n => n.textContent);
  if (ld.length) return ld[0];
  doc.querySelectorAll('script,style,noscript,svg,button,nav,footer').forEach(n => n.remove());
  if (doc.querySelector('.step-content, .ing-group')) return styledToMarkdown(doc);
  const out = [];
  const text = n => (n.textContent || '').replace(/\s+/g, ' ').trim();
  const walk = node => {
    for (const n of node.children) {
      const tag = n.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) out.push('', '#'.repeat(+tag[1]) + ' ' + text(n), '');
      else if (tag === 'li') {
        // Tekst van het item zelf, zonder geneste lijsten; die volgen als eigen items.
        const own = [...n.childNodes].filter(c => !(c.tagName && /^(ul|ol)$/i.test(c.tagName))).map(c => c.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
        if (own) out.push((n.parentElement && n.parentElement.tagName.toLowerCase() === 'ol' ? '1. ' : '- ') + own);
        n.querySelectorAll(':scope > ul, :scope > ol').forEach(walk);
      }
      else if (tag === 'p' || tag === 'dt' || tag === 'dd' || tag === 'figcaption' || tag === 'td' || tag === 'th') { const t = text(n); if (t) out.push(t, ''); }
      else if (tag === 'br') out.push('');
      else if (tag === 'tr') { const t = [...n.children].map(text).filter(Boolean).join(' '); if (t) out.push('- ' + t); }
      else if (tag === 'ul' || tag === 'ol' || n.children.length) walk(n);
      else { const t = text(n); if (t) out.push(t, ''); }
    }
  };
  walk(doc.body || doc);
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Lijkt deze tekst op HTML?
export const isHtml = s => /<\s*(html|body|h[1-6]|ul|ol|li|p|div|article)\b/i.test(String(s || '').slice(0, 5000));
// Bestaat er al een gerecht met (ongeveer) deze naam?
export const sameTitle = (a, b) => String(a || '').trim().toLowerCase().replace(/\s+/g, ' ') === String(b || '').trim().toLowerCase().replace(/\s+/g, ' ');
