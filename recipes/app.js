// Gerechten — recepten van het gezin: ingrediënten, bereidingsschema, sterren per gezinslid en een gezondheidsscore.
//   - gegevens per gezin in Supabase (recipes, recipe_ratings); een kopie op de telefoon om ook offline te lezen
//   - toevoegen, wijzigen en sterren geven kan alleen met verbinding
//   - de gezondheidsscore zet de Assistent (geplande routine, zie docs/recipe-scores.md); wijzig je het recept,
//     dan wordt hij opnieuw bepaald
import { storage, account, api, applyTheme, esc, registerSW, canUse, CLOUD } from '../shared/family.js';
import * as R from './recipe.js';
import { parseRecipes, htmlToMarkdown, isHtml, sameTitle } from './import.js';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
registerSW('../');

const APP = 'recipes';
const me = account();
const FAMILY = me && me.teamId ? me.teamId : null;
const DKEY = `${FAMILY}:data`;
const ICON_BACK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_CHEV = '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

// data = { recipes: [...], ratings: [...], members: [{ user_id, name }], at }
let data = (FAMILY && storage.get(APP, DKEY)) || { recipes: [], ratings: [], members: [], at: null };
let ui = { view: 'list', q: '', sort: storage.get(APP, 'sort') || 'top', id: null, servings: null, eatAt: storage.get(APP, 'eatAt') || '18:00', draft: null };
let loading = false, offline = false;

const isAdmin = () => !!(me && me.apps && me.apps.recipes && me.apps.recipes.role === 'admin');
const canEdit = r => r && me && (r.user_id === me.userId || isAdmin());
// Alle kolommen behalve de originele upload (source): die is alleen voor de Assistent en kan groot zijn.
const COLS = 'id,team_id,user_id,author,title,intro,category,servings,ingredients,steps,health_score,health_notes,health_scored_at,status,source_name,deleted,created_at,updated_at';
const byId = id => data.recipes.find(r => r.id === id);
const memberName = id => (id === (me && me.userId) ? me.memberName : (data.members.find(m => m.user_id === id) || {}).name) || 'Gezinslid';
const myStars = id => (data.ratings.find(r => r.recipe_id === id && r.user_id === (me && me.userId)) || {}).stars || 0;

/* ---------- server ---------- */
async function load() {
  if (!FAMILY || loading) return;
  loading = true;
  try {
    const [recipes, ratings, members] = await Promise.all([
      api(`/rest/v1/recipes?team_id=eq.${FAMILY}&deleted=is.false&select=${COLS}&order=created_at`),
      api(`/rest/v1/recipe_ratings?team_id=eq.${FAMILY}&select=recipe_id,user_id,stars`),
      api(`/rest/v1/team_members?team_id=eq.${FAMILY}&select=user_id,name&order=joined_at`).catch(() => data.members),
    ]);
    data = { recipes: recipes || [], ratings: ratings || [], members: members || [], at: new Date().toISOString() };
    storage.set(APP, DKEY, data);
    offline = false;
  } catch (e) {
    offline = e instanceof TypeError || !navigator.onLine;
    if (!offline) toast(e.message, 'err');
  } finally { loading = false; }
  if (ui.view !== 'edit' && ui.view !== 'import') render();
}
const need = () => { if (!navigator.onLine) throw new Error('Geen verbinding. Probeer het straks opnieuw.'); };

async function saveRecipe(input) {
  need();
  const body = R.clean(input);
  if (!body.title) throw new Error('Geef het gerecht een naam.');
  if (!body.ingredients.length) throw new Error('Zet er minstens één ingrediënt in.');
  if (ui.id) {
    const [row] = await api(`/rest/v1/recipes?id=eq.${ui.id}&select=${COLS}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body });
    if (!row) throw new Error('Opslaan mocht niet. Alleen wie het gerecht plaatste of een beheerder kan het wijzigen.');
    data.recipes = data.recipes.map(r => (r.id === row.id ? row : r));
  } else {
    const [row] = await api(`/rest/v1/recipes?select=${COLS}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: { ...body, team_id: FAMILY, user_id: me.userId, author: me.memberName } });
    data.recipes.push(row); ui.id = row.id;
  }
  storage.set(APP, DKEY, data);
}
async function removeRecipe(id) {
  need();
  await api(`/rest/v1/recipes?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { deleted: true } });
  data.recipes = data.recipes.filter(r => r.id !== id);
  storage.set(APP, DKEY, data);
}
// Sterren: tik op dezelfde ster nog een keer om ze weg te halen.
async function rate(id, stars) {
  need();
  const before = data.ratings.slice(), cur = myStars(id);
  data.ratings = data.ratings.filter(r => !(r.recipe_id === id && r.user_id === me.userId));
  if (stars !== cur) data.ratings.push({ recipe_id: id, user_id: me.userId, stars });
  render();
  try {
    if (stars === cur) await api(`/rest/v1/recipe_ratings?recipe_id=eq.${id}&user_id=eq.${me.userId}`, { method: 'DELETE' });
    else await api('/rest/v1/recipe_ratings?on_conflict=recipe_id,user_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { recipe_id: id, team_id: FAMILY, user_id: me.userId, stars, updated_at: new Date().toISOString() } });
    storage.set(APP, DKEY, data);
  } catch (e) { data.ratings = before; render(); throw e; }
}

/* ---------- scherm ---------- */
const $ = s => document.querySelector(s);
const navBar = (left, title = '', right = '') => `<header class="nav" id="nav"><div class="nav-l">${left || ''}</div><div class="nav-t">${title}</div><div class="nav-r">${right}</div></header>`;
const hubLink = () => `<a class="nb back" href="../" aria-label="Naar alle apps">${ICON_BACK}<span>Apps</span></a>`;
const backTo = (v, txt) => `<button class="nb back" data-a="go" data-v="${v}">${ICON_BACK}<span>${txt}</span></button>`;
const lt = (t, sub) => `<div class="lt"><h1 tabindex="-1">${t}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const sec = (head, body, foot) => `<section class="sec">${head ? `<h2 class="sec-h">${head}</h2>` : ''}${body}${foot ? `<p class="sec-f">${foot}</p>` : ''}</section>`;
const hs = score => { const l = R.healthLabel(score); return `<span class="hs ${l.cls}" aria-label="Gezondheid: ${score ?? 'volgt'}">${score ?? '…'}</span>`; };

let toastTimer = null;
function toast(msg, kind) {
  const t = $('#toast'); if (!t) return;
  t.innerHTML = `<div class="t ${kind || ''}" role="status">${esc(msg)}</div>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.innerHTML = ''; }, 3200);
}
let busy = false;
async function run(el, fn) {
  if (busy) return; busy = true; if (el) el.disabled = true;
  try { await fn(); } catch (e) { toast(e.message || String(e), 'err'); }
  finally { busy = false; if (el && el.isConnected) el.disabled = false; }
}

function gate() {
  if (!CLOUD) return 'Gerechten werkt alleen met een gezin online.';
  if (!me) return 'Gerechten deel je met je gezin. <a href="../?login">Log in</a> om ze te zien.';
  if (!FAMILY) return 'Gerechten deel je met je gezin. <a href="../?view=family">Maak een gezin of sluit je aan</a>.';
  if (!canUse(APP)) return 'Gerechten staat niet aan voor jou in dit gezin. Een beheerder kan de app aanzetten bij <b>Gezin → Apps</b> in het startscherm.';
  return '';
}

function vList() {
  const plus = `<button class="nb" data-a="new" aria-label="Nieuw gerecht" style="font-size:1.6rem;font-weight:300">+</button>`;
  let h = navBar(hubLink(), '', plus) + '<main>' + lt('Gerechten', esc(me.teamName));
  const all = data.recipes, list = R.sortRecipes(all.filter(x => R.matches(x, ui.q)), data.ratings, ui.sort);
  if (!all.length) {
    h += `<div class="card"><h2>Nog geen gerechten</h2><p class="muted">Zet je favoriete gerechten erin, met ingrediënten en het bereidingsschema. Iedereen in het gezin kan sterren geven; zo zie je wat de familie het lekkerst vindt.</p><button class="btn" data-a="new" style="margin-top:12px">Eerste gerecht toevoegen</button><button class="btn plain" data-a="import" style="margin-top:4px">Gerechten importeren</button></div>`;
    return h + (offline ? '<p class="sec-f">Geen verbinding.</p>' : loading ? '<p class="sec-f">Laden…</p>' : '') + '</main>';
  }
  h += `<label class="search"><span aria-hidden="true">🔍</span><input type="search" id="q" value="${esc(ui.q)}" placeholder="Zoek op gerecht of ingrediënt" aria-label="Zoeken"></label>`;
  h += `<div class="segc" role="group">${[['top', 'Lekkerst'], ['health', 'Gezondst'], ['new', 'Nieuw'], ['az', 'A-Z']].map(([v, l]) => `<button data-a="sort" data-v="${v}" aria-pressed="${ui.sort === v}">${l}</button>`).join('')}</div>`;
  h += sec('', `<div class="grp">${list.map(x => {
    const r = R.ratingOf(data.ratings, x.id), mins = R.totalMinutes(x.steps);
    const sub = [x.status === 'import' ? '<span class="imp">Wordt verrijkt</span>' : '', r.count ? `<span class="star">★</span> ${R.fmtStars(r.avg)} (${r.count})` : 'Nog geen sterren', mins ? R.fmtMinutes(mins) : '', esc(x.author || '')].filter(Boolean).join(' · ');
    return `<button class="cell" data-a="open" data-id="${esc(x.id)}"><span class="tx"><span class="tt">${esc(x.title)}</span><span class="st">${sub}</span></span>${hs(x.health_score)}${ICON_CHEV}</button>`;
  }).join('') || '<div class="cell"><span class="tx muted">Niets gevonden.</span></div>'}</div>`,
  `${all.length} ${all.length === 1 ? 'gerecht' : 'gerechten'}. Het getal is de gezondheidsscore (1-10); "…" = wordt nog bepaald.${offline ? ' Geen verbinding: je ziet de laatst opgehaalde gerechten.' : ''}`);
  h += `<div style="margin-top:8px"><button class="btn plain" data-a="import">Gerechten importeren</button></div>`;
  return h + '</main>';
}

function vDetail() {
  const x = byId(ui.id); if (!x) return vList();
  const r = R.ratingOf(data.ratings, x.id), mine = myStars(x.id), l = R.healthLabel(x.health_score);
  const servings = ui.servings || x.servings, f = servings / x.servings, p = R.plan(x.steps, ui.eatAt);
  let h = navBar(backTo('list', 'Gerechten'), '', canEdit(x) ? '<button class="nb" data-a="edit">Wijzig</button>' : '') + '<main>';
  h += lt(esc(x.title), [R.categoryName(x.category), x.author ? `van ${esc(x.author)}` : '', p.total ? R.fmtMinutes(p.total) : ''].filter(Boolean).join(' · '));
  if (x.intro) h += `<p style="padding:0 20px;margin:0 0 8px;line-height:1.45">${esc(x.intro)}</p>`;
  if (x.status === 'import') h += `<div class="card"><h2>Geïmporteerd · wordt verrijkt</h2><p class="muted small" style="line-height:1.45">De Assistent maakt dit gerecht af met de juiste stappen, bereidingstijden en hoeveelheden uit je originele bestand${x.source_name ? ` (${esc(x.source_name)})` : ''}. Daarna wordt het originele bestand verwijderd en volgt de gezondheidsscore. Meestal binnen een dag.</p></div>`;
  h += `<div class="card health">${hs(x.health_score)}<div><h2>${x.health_score == null ? 'Gezondheidsscore volgt' : `${l.text} · ${x.health_score} van 10`}</h2>
    <p>${x.health_score == null ? 'De Assistent beoordeelt nieuwe en gewijzigde gerechten automatisch, meestal binnen een dag.' : esc(x.health_notes || '')}</p></div></div>`;
  h += `<div class="card"><h2>Jouw sterren</h2><div class="stars" role="group" aria-label="Geef sterren">${[1, 2, 3, 4, 5].map(n => `<button data-a="rate" data-n="${n}" class="${n <= mine ? 'on' : ''}" aria-label="${n} ${n === 1 ? 'ster' : 'sterren'}" aria-pressed="${n === mine}">★</button>`).join('')}</div>
    <p class="muted small" style="margin-top:6px">${r.count ? `Gezin: <span class="star">★</span> ${R.fmtStars(r.avg)} · ${r.list.map(v => `${esc(memberName(v.user_id))} ${v.stars}`).join(', ')}` : 'Nog niemand heeft sterren gegeven.'}</p></div>`;
  h += sec('Ingrediënten', `<div class="card" style="margin-top:0"><div class="stepper" style="margin-bottom:8px"><button data-a="srv" data-d="-1" aria-label="Minder personen">−</button><b>${servings} ${servings === 1 ? 'persoon' : 'personen'}</b><button data-a="srv" data-d="1" aria-label="Meer personen">+</button></div>
    <ul class="ing">${x.ingredients.map(i => `<li>${esc(R.scaleLine(i, f))}</li>`).join('')}</ul></div>`, f !== 1 ? `Omgerekend van ${x.servings} naar ${servings} personen.` : '');
  if (x.steps.length) {
    h += sec('Bereidingsschema', `<div class="card" style="margin-top:0">${p.total ? `<div class="eat"><span>Aan tafel om</span><input type="time" id="eatAt" value="${esc(ui.eatAt)}"></div><p class="muted small" style="margin:6px 0 4px">Begin om <b>${p.start}</b> · totaal ${R.fmtMinutes(p.total)}</p>` : ''}
      <ol class="steps">${p.steps.map((s, i) => `<li><span class="at">${p.total ? s.at : i + 1 + '.'}${s.min ? `<span class="du">${s.min} min</span>` : ''}</span><span>${s.par ? '<span class="par">Tegelijk met de vorige stap</span><br>' : ''}${esc(s.text)}</span></li>`).join('')}</ol></div>`);
  }
  if (canEdit(x)) h += `<div style="margin-top:18px"><button class="btn danger" data-a="delete">Gerecht verwijderen</button></div>`;
  return h + '</main>';
}

function vEdit() {
  const d = ui.draft;
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, ui.id ? 'Wijzig gerecht' : 'Nieuw gerecht', `<button class="nb" data-a="save" style="font-weight:600">Bewaar</button>`) + '<main>';
  h += sec('Gerecht', `<div class="grp"><label class="cell field"><span class="fl">Naam</span><input type="text" id="f-title" value="${esc(d.title)}" maxlength="120" placeholder="bijv. Lasagne van oma"></label>
    <label class="cell field"><span class="fl">Soort</span><select class="sel" id="f-category">${R.CATEGORIES.map(([v, l]) => `<option value="${v}" ${d.category === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="cell field"><span class="fl">Personen</span><input type="number" id="f-servings" value="${esc(d.servings)}" min="1" max="30" inputmode="numeric"></label>
    <div class="cell"><textarea class="ta" id="f-intro" placeholder="Korte beschrijving of tip (mag leeg)" style="min-height:3.5rem">${esc(d.intro)}</textarea></div></div>`);
  h += sec('Ingrediënten', `<div class="grp"><div class="cell"><textarea class="ta" id="f-ingredients" placeholder="Eén per regel, bijv.&#10;500 g gehakt&#10;2 uien&#10;1 el olijfolie">${esc(d.ingredients)}</textarea></div></div>`,
    'Eén ingrediënt per regel, met de hoeveelheid vooraan. Dan rekent de app het om naar meer of minder personen.');
  h += sec('Bereidingsschema', `<div class="grp">${d.steps.map((s, i) => `<div class="steprow"><textarea data-step="${i}" placeholder="Stap ${i + 1}">${esc(s.text)}</textarea>
    <div class="opts"><label><input type="number" data-min="${i}" value="${s.min || ''}" min="0" max="1440" inputmode="numeric" placeholder="0"> min</label>${i ? `<label><input type="checkbox" data-par="${i}" ${s.par ? 'checked' : ''}> tegelijk met vorige</label>` : ''}<button class="del" data-a="delstep" data-i="${i}">Weg</button></div></div>`).join('')}
    <button class="cell tint" data-a="addstep"><span class="tx"><span class="tt">Stap toevoegen</span></span></button></div>`,
    'Geef per stap aan hoeveel minuten hij duurt. Gaat een stap tegelijk met de vorige (rijst koken terwijl de saus pruttelt), vink dat aan. Dan rekent de app uit hoe laat je moet beginnen.');
  if (ui.id) h += `<p class="sec-f">Wijzig je naam, personen, ingrediënten of stappen, dan bepaalt de Assistent de gezondheidsscore opnieuw.</p>`;
  return h + '</main>';
}
// Formulier → draft (vóór elke herteken, zodat ingevulde tekst blijft staan).
function readDraft() {
  const v = id => (document.getElementById(id) || {}).value ?? '';
  const d = ui.draft;
  Object.assign(d, { title: v('f-title'), category: v('f-category'), servings: v('f-servings'), intro: v('f-intro'), ingredients: v('f-ingredients') });
  d.steps = d.steps.map((s, i) => ({
    text: (document.querySelector(`[data-step="${i}"]`) || {}).value ?? s.text,
    min: (document.querySelector(`[data-min="${i}"]`) || {}).value ?? s.min,
    par: i ? !!(document.querySelector(`[data-par="${i}"]`) || {}).checked : false,
  }));
}

/* ---------- importeren (Markdown of HTML, bijv. van Claude) ---------- */
// ui.imp = { text, items: [{ recipe, warnings, source, dup, on }] | null }
async function readFiles(files) {
  const items = [];
  for (const f of files) {
    let text = await f.text();
    const name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    if (/\.html?$/i.test(f.name) || isHtml(text)) text = htmlToMarkdown(new DOMParser().parseFromString(text, 'text/html'));
    for (const x of parseRecipes(text, name)) items.push({ ...x, source: f.name, original: text });
    if (!items.some(x => x.source === f.name)) items.push({ recipe: null, warnings: ['Geen recept herkend'], source: f.name });
  }
  return items;
}
function readText(text) {
  const md = isHtml(text) ? htmlToMarkdown(new DOMParser().parseFromString(text, 'text/html')) : text;
  const out = parseRecipes(md).map(x => ({ ...x, source: 'geplakte tekst', original: md }));
  return out.length ? out : [{ recipe: null, warnings: ['Geen recept herkend'], source: 'geplakte tekst' }];
}
function markItems(items) {
  const seen = [];
  return items.map(x => {
    if (!x.recipe) return { ...x, on: false };
    const dup = data.recipes.some(r => sameTitle(r.title, x.recipe.title)) ? 'bestaat al' : seen.some(t => sameTitle(t, x.recipe.title)) ? 'dubbel in de import' : '';
    seen.push(x.recipe.title);
    return { ...x, dup, on: !dup && !!x.recipe.title && x.recipe.ingredients.length > 0 };
  });
}
function vImport() {
  const imp = ui.imp;
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, 'Importeren') + '<main>';
  if (!imp.items) {
    h += lt('Gerechten importeren', 'Uit Markdown, tekst of een opgeslagen pagina');
    h += sec('Bestanden', `<div class="grp"><label class="cell tint"><span class="tx"><span class="tt">Kies bestanden…</span><span class="st">.md, .txt of .html, meerdere tegelijk</span></span><input type="file" id="impFiles" multiple accept=".md,.markdown,.txt,.html,.htm,text/markdown,text/plain,text/html" style="position:absolute;opacity:0;width:1px;height:1px"></label></div>`,
      'Bijvoorbeeld recepten die Claude voor je schreef (als Markdown bewaard of gedownload), of een artifact opgeslagen als pagina.');
    h += sec('Of plak de tekst', `<div class="grp"><div class="cell"><textarea class="ta" id="impText" placeholder="# Lasagne&#10;Voor 4 personen&#10;&#10;## Ingrediënten&#10;- 500 g gehakt&#10;&#10;## Bereiding&#10;1. Bak het gehakt 10 minuten." style="min-height:10rem">${esc(imp.text || '')}</textarea></div></div>`,
      'Meerdere recepten in één keer mag: elk recept met een eigen kop. De app herkent ingrediënten, bereiding, personen en minuten per stap.');
    h += `<div class="sec"><button class="btn" data-a="impread">Lees in</button></div>`;
    return h + '</main>';
  }
  const chosen = imp.items.filter(x => x.on).length;
  h += lt('Controleren', `${imp.items.filter(x => x.recipe).length} ${imp.items.filter(x => x.recipe).length === 1 ? 'gerecht' : 'gerechten'} gevonden`);
  h += `<div class="grp">${imp.items.map((x, i) => {
    if (!x.recipe) return `<div class="cell"><span class="tx"><span class="tt muted">${esc(x.source)}</span><span class="st" style="color:var(--orange)">Geen recept herkend</span></span></div>`;
    const r = x.recipe, mins = R.totalMinutes(r.steps);
    const sub = [`${r.servings} pers.`, `${r.ingredients.length} ingrediënten`, `${r.steps.length} stappen`, mins ? R.fmtMinutes(mins) : '', R.categoryName(r.category)].filter(Boolean).join(' · ');
    const warn = [x.dup, ...x.warnings].filter(Boolean).join(' · ');
    return `<div class="cell"><span class="tx"><span class="tt">${esc(r.title || '(geen naam)')}</span><span class="st">${sub}</span>${warn ? `<span class="st" style="color:var(--orange)">${esc(warn)}</span>` : ''}</span>${toggleHtml(x.on, i, r.title)}</div>`;
  }).join('')}</div>`;
  h += `<p class="sec-f">Wat oranje staat, kun je na het importeren aanvullen bij het gerecht (Wijzig). Bestaat een gerecht al, dan staat het standaard uit. Daarna maakt de Assistent elk gerecht af: stappen, minuten en hoeveelheden, en daarna de gezondheidsscore.</p>`;
  h += `<div class="sec"><button class="btn" data-a="impsave" ${chosen ? '' : 'disabled'}>Importeer ${chosen} ${chosen === 1 ? 'gerecht' : 'gerechten'}</button><button class="btn plain" data-a="impagain" style="margin-top:6px">Andere bestanden</button></div>`;
  return h + '</main>';
}
const toggleHtml = (on, i, label) => `<button class="toggle" role="switch" aria-checked="${!!on}" aria-label="${esc(label || 'Gerecht')} importeren" data-a="imptoggle" data-i="${i}"></button>`;
async function saveImport() {
  need();
  // Het origineel gaat mee: de Assistent verrijkt het gerecht later (stappen, minuten, hoeveelheden) en wist dan de upload.
  const rows = ui.imp.items.filter(x => x.on && x.recipe).map(x => ({ ...x.recipe, team_id: FAMILY, user_id: me.userId, author: me.memberName,
    status: 'import', source: String(x.original || '').slice(0, 200000), source_name: String(x.source || '').slice(0, 200) }));
  if (!rows.length) return;
  const out = await api(`/rest/v1/recipes?select=${COLS}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body: rows });
  data.recipes.push(...(out || []));
  storage.set(APP, DKEY, data);
  return (out || []).length;
}

function render() {
  const g = gate();
  const a = $('#app');
  if (g) a.innerHTML = navBar(hubLink()) + '<main>' + lt('Gerechten') + `<div class="card"><p>${g}</p></div></main>`;
  else a.innerHTML = ui.view === 'detail' ? vDetail() : ui.view === 'edit' ? vEdit() : ui.view === 'import' ? vImport() : vList();
  onScroll();
}
function go(view, extra) { Object.assign(ui, { view }, extra || {}); render(); window.scrollTo(0, 0); }
function onScroll() { const n = document.getElementById('nav'); if (n) n.classList.toggle('scrolled', window.scrollY > 4); }
addEventListener('scroll', onScroll, { passive: true });

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a;
  if (a === 'go') go(el.dataset.v);
  else if (a === 'open') go('detail', { id: el.dataset.id, servings: null });
  else if (a === 'sort') { ui.sort = el.dataset.v; storage.set(APP, 'sort', ui.sort); render(); }
  else if (a === 'new') go('edit', { id: null, draft: { title: '', category: 'main', servings: 4, intro: '', ingredients: '', steps: [{ text: '', min: '', par: false }] } });
  else if (a === 'edit') { const x = byId(ui.id); go('edit', { draft: { ...x, ingredients: x.ingredients.join('\n'), steps: x.steps.length ? x.steps.map(s => ({ ...s })) : [{ text: '', min: '', par: false }] } }); }
  else if (a === 'cancel') go(ui.view === 'import' ? 'list' : ui.id ? 'detail' : 'list');
  else if (a === 'import') go('import', { imp: { text: '', items: null } });
  else if (a === 'impread') { const t = ($('#impText') || {}).value || ''; ui.imp.text = t; if (!t.trim()) { toast('Kies bestanden of plak een recept.', 'err'); return; } ui.imp.items = markItems(readText(t)); render(); window.scrollTo(0, 0); }
  else if (a === 'impagain') { ui.imp.items = null; render(); }
  else if (a === 'imptoggle') { const x = ui.imp.items[+el.dataset.i]; x.on = !x.on; render(); }
  else if (a === 'impsave') run(el, async () => { const n = await saveImport(); go('list', { imp: null }); toast(`${n} ${n === 1 ? 'gerecht' : 'gerechten'} geïmporteerd.`); });
  else if (a === 'addstep') { readDraft(); ui.draft.steps.push({ text: '', min: '', par: false }); render(); const t = document.querySelector(`[data-step="${ui.draft.steps.length - 1}"]`); if (t) t.focus(); }
  else if (a === 'delstep') { readDraft(); ui.draft.steps.splice(+el.dataset.i, 1); if (!ui.draft.steps.length) ui.draft.steps.push({ text: '', min: '', par: false }); render(); }
  else if (a === 'save') run(el, async () => { readDraft(); await saveRecipe(ui.draft); go('detail', { servings: null }); toast('Bewaard.'); });
  else if (a === 'delete') { const x = byId(ui.id); if (confirm(`"${x.title}" verwijderen? Ook de sterren gaan weg.`)) run(el, async () => { await removeRecipe(x.id); go('list'); toast('Verwijderd.'); }); }
  else if (a === 'rate') run(null, () => rate(ui.id, +el.dataset.n));
  else if (a === 'srv') { const x = byId(ui.id); ui.servings = Math.min(30, Math.max(1, (ui.servings || x.servings) + +el.dataset.d)); render(); }
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'q') { ui.q = ev.target.value; const pos = ev.target.selectionStart; render(); const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
});
document.addEventListener('change', ev => {
  if (ev.target.id === 'impFiles' && ev.target.files.length) {
    run(null, async () => { ui.imp.items = markItems(await readFiles([...ev.target.files])); render(); window.scrollTo(0, 0); });
    return;
  }
  if (ev.target.id === 'eatAt' && ev.target.value) { ui.eatAt = ev.target.value; storage.set(APP, 'eatAt', ui.eatAt); render(); }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && ui.view !== 'edit' && ui.view !== 'import') load(); });
addEventListener('online', () => load());

render();
load();
