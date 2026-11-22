// Gerechten — recepten importeren uit Markdown (bijv. uitvoer van Claude) of HTML (bijv. een opgeslagen artifact).
// Zonder scherm, dus te testen met node --test (alleen htmlToMarkdown heeft een DOM nodig: DOMParser in de browser).
//
// Herkent per recept:
//   titel         een kop (# Lasagne) die geen sectienaam is; meerdere recepten per bestand kan
//   personen      "Personen: 4", "voor 4 personen", "4 porties"
//   soort         "Soort: soep", anders geraden uit de titel (soep, salade, taart …)
//   ingrediënten  lijst onder een kop of vette regel "Ingrediënten" / "Benodigdheden" / "Boodschappen"
//   stappen       lijst of alinea's onder "Bereiding" / "Werkwijze" / "Instructies" / "Stappen";
//                 minuten uit de tekst ("15 minuten", "1 uur"), "Ondertussen …" = tegelijk met de vorige stap
//   intro         tekst vóór de secties, plus een sectie "Tips" of "Opmerkingen"
import { clean, CATEGORIES } from './recipe.js';

const SECTION = [
  ['ingredients', /^(ingredi[eë]nten|ingrediënten|benodigdheden|boodschappen(lijst)?|nodig|wat heb je nodig|ingredients)\b/i],
  ['steps', /^(bereiding(swijze)?|werkwijze|instructies|stappen|zo maak je het|aan de slag|method|instructions|directions|preparation)\b/i],
  ['notes', /^(tips?|opmerkingen|notities|variaties?|serveertips?|bewaren|goed om te weten|notes)\b/i],
  ['skip', /^(voedingswaarde|voedingswaarden|nutrition|bron|source)\b/i],
];
const plain = s => String(s || '').replace(/\*\*|__|`/g, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/[:：]\s*$/, '').trim();
const sectionOf = text => { const t = plain(text); for (const [k, re] of SECTION) if (re.test(t)) return k; return null; };
const LIST = /^\s*(?:[-*+•–]|\d+[.)]|\[[ xX]\])\s+/;
const stripList = s => s.replace(LIST, '').replace(/^\[[ xX]\]\s*/, '').trim();

// Markdown → regels met type: { h: niveau, text } | { li: true, text, ordered } | { p: text }
function tokens(md) {
  const out = [];
  for (const raw of String(md || '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { out.push({ blank: true }); continue; }
    const h = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { out.push({ h: h[1].length, text: h[2].trim() }); continue; }
    // Een vette regel als kop: "**Ingrediënten**" of "**Bereiding:**"
    const b = line.trim().match(/^(?:\*\*|__)(.+?)(?:\*\*|__):?$/);
    if (b) { out.push({ h: 7, text: b[1].trim() }); continue; }
    if (LIST.test(line)) { out.push({ li: true, text: stripList(line), ordered: /^\s*\d+[.)]/.test(line) }); continue; }
    // Kale regel "Ingrediënten:" telt ook als kop.
    if (/[:：]\s*$/.test(line) && sectionOf(line) && line.length < 40) { out.push({ h: 7, text: line.trim() }); continue; }
    out.push({ p: line.trim() });
  }
  return out;
}

const MIN = /(\d+(?:[.,]\d+)?)\s*(?:[-–tot]+\s*(\d+)\s*)?(minuten|minuut|min\.?|uur|uren|hours?|minutes?)\b/i;
export function minutesIn(text) {
  const m = String(text || '').match(MIN);
  if (!m) return 0;
  const n = parseFloat((m[2] || m[1]).replace(',', '.'));
  return Math.round(/^(uur|uren|hour)/i.test(m[3]) ? n * 60 : n);
}
const PAR = /^(ondertussen|intussen|tegelijk(ertijd)?|terwijl|meanwhile)\b/i;

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
  ['snack', /snack|borrel|dip\b|hapje/i], ['starter', /voorgerecht/i], ['side', /bijgerecht/i],
];
export function categoryIn(text, title) {
  const m = String(text || '').replace(/\*\*|__/g, '').match(/(?:soort|categorie|gang|type)\s*[:：]\s*([^\n]+)/i);
  if (m) {
    const v = m[1].trim().toLowerCase();
    const c = CATEGORIES.find(([, name]) => name.toLowerCase() === v || v.startsWith(name.toLowerCase().split(' ')[0]));
    if (c) return c[0];
    for (const [id, re] of CAT_WORDS) if (re.test(v)) return id;
  }
  for (const [id, re] of CAT_WORDS) if (re.test(title || '')) return id;
  return 'main';
}

// Eén blok tokens (één recept) → recept-invoer voor clean().
function toRecipe(title, toks) {
  let sec = 'intro'; const ing = [], steps = [], intro = [], notes = [];
  let para = null; // stap als alinea's (zonder lijst)
  for (const t of toks) {
    if (t.h) {
      const k = sectionOf(t.text);
      if (k) sec = k;
      else if (sec === 'ingredients') ing.push(plain(t.text) + ':'); // tussenkop, bijv. "Voor de saus"
      para = null; continue;
    }
    if (t.blank) { para = null; continue; }
    const text = t.text || t.p || '';
    if (sec === 'ingredients') { if (t.li || t.p) ing.push(text.replace(/\*\*/g, '')); }
    else if (sec === 'steps') {
      const s = text.replace(/^(stap\s*\d+\s*[:.)-]?\s*)/i, '').replace(/\*\*/g, '').trim();
      if (!s) continue;
      if (t.li || !para) { para = { text: s }; steps.push(para); if (t.li) para = null; }
      else para.text += ' ' + s;
    }
    else if (sec === 'notes') notes.push((t.li ? '• ' : '') + text.replace(/\*\*/g, ''));
    else if (sec === 'intro') intro.push(text.replace(/\*\*/g, ''));
  }
  const meta = intro.join('\n');
  const keep = intro.filter(l => !/^(personen|porties?|aantal personen|soort|categorie|gang|bereidingstijd|kooktijd|totale tijd|tijd|voorbereiding|moeilijkheid|serves|servings)\s*[:：]/i.test(l.replace(/^[^\p{L}]+/u, '')));
  const r = {
    title: plain(title),
    servings: servingsIn(meta) || servingsIn(title) || 4,
    category: categoryIn(meta, title),
    intro: [keep.join(' '), notes.length ? 'Tips: ' + notes.join(' ') : ''].filter(Boolean).join('\n\n'),
    ingredients: ing,
    steps: steps.map((s, i) => ({ text: s.text, min: minutesIn(s.text), par: i > 0 && PAR.test(s.text) })),
  };
  return clean(r);
}

// Markdown → [{ recipe (opgeschoond), warnings: [..] }]. Meerdere recepten in één tekst kan.
export function parseRecipes(md, fallbackTitle = '') {
  const toks = tokens(md);
  const isTitle = (t, lvl) => t.h === lvl && !sectionOf(t.text);
  // Kies het kopniveau waarop splitsen de meeste recepten met ingrediënten oplevert.
  let best = null;
  for (const lvl of [1, 2, 3, 4]) {
    const blocks = []; let cur = null;
    for (const t of toks) {
      if (isTitle(t, lvl)) { cur = { title: t.text, toks: [] }; blocks.push(cur); }
      else if (cur) cur.toks.push(t);
    }
    const ok = blocks.map(b => ({ b, r: toRecipe(b.title, b.toks) })).filter(x => x.r.ingredients.length || x.r.steps.length);
    if (ok.length && (!best || ok.length > best.length)) best = ok;
  }
  // Geen koppen met recepten: de hele tekst is één recept (titel = eerste regel of bestandsnaam).
  if (!best) {
    const first = toks.find(t => t.p || t.h);
    const title = fallbackTitle || (first ? first.text || first.p : '');
    const r = toRecipe(title, first && (first.p || first.h) && !fallbackTitle ? toks.slice(toks.indexOf(first) + 1) : toks);
    best = r.ingredients.length || r.steps.length ? [{ r }] : [];
  }
  return best.map(({ r }) => ({ recipe: r, warnings: warningsFor(r) }));
}
function warningsFor(r) {
  const w = [];
  if (!r.title) w.push('Geen naam gevonden');
  if (!r.ingredients.length) w.push('Geen ingrediënten gevonden');
  if (!r.steps.length) w.push('Geen bereiding gevonden');
  else if (!r.steps.some(s => s.min)) w.push('Geen tijden bij de stappen');
  return w;
}

// HTML (bijv. een artifact) → Markdown, zodat parseRecipes het kan lezen. `doc` = een DOM-document (DOMParser).
export function htmlToMarkdown(doc) {
  doc.querySelectorAll('script,style,noscript,svg,button,nav,footer').forEach(n => n.remove());
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
