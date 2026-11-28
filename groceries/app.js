// Boodschappen — één gedeelde lijst voor het gezin, vaste boodschappen met een ritme en een weekmenu uit Gerechten.
//   - gegevens per gezin in Supabase (grocery_items, grocery_staples, grocery_menu); kopie op de telefoon om offline te lezen
//   - vaste boodschappen die aan de beurt zijn zet de database op de lijst (rpc grocery_fill) bij het openen
//   - de lijst ververst elke 15 seconden zolang hij open staat (samen in de winkel)
//   - logica (optellen, ritme, afdelingen): plan.js
//   - prijzen van Albert Heijn (zonder inloggen) via de Edge Function groceries-products; rekenen: prices.js.
//     Werkt AH niet, dan werkt de lijst gewoon door, alleen zonder prijzen.
import { storage, account, api, applyTheme, esc, registerSW, canUse, CLOUD } from '../shared/family.js';
import * as G from './plan.js';
import * as PR from './prices.js';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
registerSW('../');

const APP = 'groceries';
const me = account();
const FAMILY = me && me.teamId ? me.teamId : null;
const DKEY = `${FAMILY}:data`;
const ICON_BACK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_CHEV = '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const POLL_MS = 15000;

// data = { items (open + vandaag afgevinkt), staples, menu, recipes, history (afgevinkt, laatste 6 maanden), recipesOk, at,
//          choices (gekozen AH-product per naam), products (die producten + vergelijkbare uit dezelfde subcategorie), pricesAt }
let data = Object.assign({ items: [], staples: [], menu: [], recipes: [], history: [], recipesOk: true, at: null, choices: [], products: [], pricesAt: null },
  (FAMILY && storage.get(APP, DKEY)) || {});
// Op zondag plan je meestal de week die komt: het weekmenu opent dan op volgende week.
let ui = { view: 'list', id: null, draft: null, week: new Date().getDay() === 0 ? G.addDays(G.weekOf(), 7) : G.weekOf(), tab: 'staple', q: '' };
let loading = false, offline = false;

const open = () => data.items.filter(it => !it.checked_at);
const basket = () => data.items.filter(it => it.checked_at).sort((a, b) => b.checked_at.localeCompare(a.checked_at));
const memory = () => G.sectionMemory(data.history);
const recipe = id => data.recipes.find(r => r.id === id);
const staple = id => data.staples.find(s => s.id === id);
const localDay = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const boughtDates = id => data.history.filter(h => h.staple_id === id && h.checked_at).map(h => localDay(h.checked_at));

/* ---------- server ---------- */
async function load() {
  if (!FAMILY || loading || gate()) return;
  loading = true;
  try {
    const since = G.addDays(G.today(), -183), start = new Date(); start.setHours(0, 0, 0, 0);
    await api('/rest/v1/rpc/grocery_fill', { method: 'POST', body: { p_team: FAMILY } });
    const [items, staples, menu, history, recipes] = await Promise.all([
      api(`/rest/v1/grocery_items?team_id=eq.${FAMILY}&deleted=is.false&or=(checked_at.is.null,checked_at.gte.${start.toISOString()})&select=*`),
      api(`/rest/v1/grocery_staples?team_id=eq.${FAMILY}&deleted=is.false&select=*&order=name`),
      api(`/rest/v1/grocery_menu?team_id=eq.${FAMILY}&deleted=is.false&week=gte.${G.addDays(G.weekOf(), -28)}&select=*&order=updated_at`),
      api(`/rest/v1/grocery_items?team_id=eq.${FAMILY}&checked_at=gte.${since}&select=name,section,staple_id,checked_at,updated_at&order=checked_at.desc&limit=1000`),
      // Gerechten is een aparte app: wie die niet mag gebruiken, krijgt hier geen gerechten (en geen fout).
      api(`/rest/v1/recipes?team_id=eq.${FAMILY}&deleted=is.false&status=eq.ready&select=id,title,category,servings,ingredients,health_score&order=title`).catch(() => null),
    ]);
    data = { ...data, items: items || [], staples: staples || [], menu: menu || [], history: history || [], recipes: recipes || [], recipesOk: !!recipes, at: new Date().toISOString() };
    storage.set(APP, DKEY, data);
    offline = false;
  } catch (e) {
    offline = e instanceof TypeError || !navigator.onLine;
    if (!offline) toast(e.message, 'err');
  } finally { loading = false; }
  if (['list', 'staples', 'menu'].includes(ui.view) && !typing()) render();
}
const persist = () => storage.set(APP, DKEY, data);

/* ---------- prijzen (Albert Heijn) ---------- */
const COLS = 'product_id,title,brand,size,price,price_was,bonus,bonus_until,unit,unit_qty,nutriscore,sub_category,available,fetched_at';
// data.products (bewaard op de telefoon) = alleen de gekozen producten; pool (alleen in het geheugen) = die plus de
// vergelijkbare producten voor goedkoper en gezonder. Zo blijft de kopie op de telefoon klein.
let priceErr = '', pool = null, pmapOf = null, pmapCache = null;
const allProducts = () => pool || data.products || [];
const pmap = () => { const all = allProducts(); if (pmapOf !== all) { pmapOf = all; pmapCache = new Map(all.map(p => [String(p.product_id), p])); } return pmapCache; };
const AH_DOWN = 'Prijzen van Albert Heijn lukken nu niet. De lijst werkt gewoon; probeer het later opnieuw.';
// Meldingen van de functie zelf (Nederlands) laten we zien; al het andere (niet bereikbaar, niet gevonden) wordt AH_DOWN.
const shop = body => api('/functions/v1/groceries-products', { method: 'POST', body: { team: FAMILY, ...body } })
  .catch(e => { throw e instanceof TypeError ? e : new Error([400, 401, 403, 429, 502].includes(e.status) ? e.message : AH_DOWN); });
// Eerst de server laten bijwerken wat nog niet van vandaag is, dan keuzes en producten lezen.
async function loadPrices(refresh = true) {
  if (!FAMILY || gate() || !navigator.onLine) return;
  try {
    if (refresh) { await shop({ mode: 'refresh' }); priceErr = ''; data.pricesAt = new Date().toISOString(); }
  } catch (e) { priceErr = e instanceof TypeError ? '' : e.message; }
  try {
    const choices = await api(`/rest/v1/grocery_choices?team_id=eq.${FAMILY}&select=id,name_key,store,product_id,brand_only`);
    const ids = [...new Set((choices || []).map(c => String(c.product_id)))];
    let list = [], mine = [];
    if (ids.length) {
      mine = await api(`/rest/v1/grocery_products?store=eq.ah&product_id=in.(${ids.map(encodeURIComponent).join(',')})&select=${COLS}`);
      const subs = [...new Set(mine.map(p => p.sub_category).filter(Boolean))];
      // vergelijkbare producten: alleen recente prijzen (een bonus van vorige week telt niet)
      const since = new Date(Date.now() - 2 * 864e5).toISOString();
      const similar = subs.length ? await api(`/rest/v1/grocery_products?store=eq.ah&available=is.true&fetched_at=gte.${since}&sub_category=in.(${subs.map(s => encodeURIComponent(`"${s.replace(/["\\]/g, '')}"`)).join(',')})&select=${COLS}&limit=3000`) : [];
      list = [...new Map([...similar, ...mine].map(p => [String(p.product_id), p])).values()];
    }
    data.choices = choices || []; data.products = mine; pool = list; persist();
  } catch (e) { if (!(e instanceof TypeError)) priceErr = priceErr || e.message; }
  if (['list', 'item'].includes(ui.view) && !typing()) render();
}
// Prijs, bonus en alternatieven van een regel; null zonder gekozen product.
function priceInfo(it) {
  const { choice, product } = PR.productFor(it, data.choices, pmap());
  if (!choice) return null;
  if (!product) return { choice, product: null };
  const packs = PR.packsFor(it, product), c = product.available !== false ? PR.cost(product, packs) : null;
  return { choice, product, packs, cost: c, alt: product.available !== false ? PR.alternatives(product, allProducts(), { brandOnly: choice.brand_only, item: it }) : { cheaper: null, healthier: null } };
}
async function choose(name, productId, extra = {}) {
  need();
  const key = PR.nameKey(name); if (!key) throw new Error('Geef de boodschap eerst een naam.');
  const old = data.choices.find(c => c.store === 'ah' && c.name_key === key);
  const [row] = await api('/rest/v1/grocery_choices?on_conflict=team_id,store,name_key', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: { team_id: FAMILY, store: 'ah', name_key: key, product_id: String(productId), brand_only: old ? old.brand_only : false, ...extra } });
  data.choices = data.choices.filter(c => c.id !== row.id).concat(row); persist();
  return row;
}
const need = () => { if (!navigator.onLine) throw new Error('Geen verbinding. Probeer het straks opnieuw.'); };
const post = (table, body) => api(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body });
const patch = (table, id, body) => api(`/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body });
function upsertLocal(list, row) { const i = list.findIndex(x => x.id === row.id); if (row.deleted) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = row; else list.push(row); persist(); }
// Niet opnieuw tekenen terwijl iemand typt (dan sluit het toetsenbord).
const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };

// Iets toevoegen aan de lijst. Staat het er al? Dan de hoeveelheid erbij optellen.
async function addText(text) {
  need();
  const p = G.parseLine(text) || { qty: null, unit: '', name: String(text || '').trim() };
  if (!p.name) throw new Error('Wat moet er bij?');
  const { updates, inserts } = G.mergeIntoList(open(), [{ ...p, section: G.sectionFor(p.name, memory()) }]);
  for (const u of updates) { const [row] = await patch('grocery_items', u.id, { qty: u.qty, unit: u.unit }); upsertLocal(data.items, row); const amt = G.fmtAmount(row.qty, row.unit); return amt ? `Stond er al op. Nu ${amt} ${row.name}.` : `${row.name} stond er al op.`; }
  const st = data.staples.find(s => G.sameName(s.name, p.name) && !open().some(it => it.staple_id === s.id));
  const [row] = await post('grocery_items', { ...inserts[0], team_id: FAMILY, source: 'manual', staple_id: st ? st.id : null });
  upsertLocal(data.items, row);
  return '';
}
async function toggle(id) {
  need();
  const it = data.items.find(x => x.id === id); if (!it) return;
  const was = it.checked_at;
  it.checked_at = was ? null : new Date().toISOString(); render();
  try {
    // Weer uitvinken terwijl de vaste boodschap al opnieuw op de lijst staat: die nieuwe regel vervalt.
    if (was && it.staple_id) for (const o of open().filter(o => o.staple_id === it.staple_id && o.id !== id)) { const [r] = await patch('grocery_items', o.id, { deleted: true }); upsertLocal(data.items, r); }
    const [row] = await patch('grocery_items', id, { checked_at: it.checked_at });
    upsertLocal(data.items, row);
    if (row.checked_at) data.history.unshift({ name: row.name, section: row.section, staple_id: row.staple_id, checked_at: row.checked_at, updated_at: row.updated_at });
    else data.history = data.history.filter(h => !(h.staple_id && h.staple_id === row.staple_id && h.checked_at === was));
    // "laatst gekocht" zet de database (trigger grocery_bought): die vaste boodschap opnieuw ophalen
    if (row.staple_id) { const [s] = await api(`/rest/v1/grocery_staples?id=eq.${row.staple_id}&select=*`); if (s) upsertLocal(data.staples, s); }
    persist();
  } catch (e) { it.checked_at = was; render(); throw e; }
}

/* ---------- scherm ---------- */
const $ = s => document.querySelector(s);
const navBar = (left, title = '', right = '') => `<header class="nav" id="nav"><div class="nav-l">${left || ''}</div><div class="nav-t">${title}</div><div class="nav-r">${right}</div></header>`;
const hubLink = () => `<a class="nb back" href="../" aria-label="Naar alle apps">${ICON_BACK}<span>Apps</span></a>`;
const backTo = (v, txt) => `<button class="nb back" data-a="go" data-v="${v}">${ICON_BACK}<span>${txt}</span></button>`;
const lt = (t, sub) => `<div class="lt"><h1 tabindex="-1">${t}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const sec = (head, body, foot) => `<section class="sec">${head ? `<h2 class="sec-h">${head}</h2>` : ''}${body}${foot ? `<p class="sec-f">${foot}</p>` : ''}</section>`;
const seg = (items, cur, a) => `<div class="segc" role="group">${items.map(([v, l]) => `<button data-a="${a}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
const sectionSelect = (id, cur) => `<select class="sel" id="${id}">${G.SECTIONS.map(([v, l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const rhythmSelect = (id, cur) => `<select class="sel" id="${id}">${G.RHYTHMS.map(n => `<option value="${n}" ${cur === n ? 'selected' : ''}>${G.rhythmLabel(n)}</option>`).join('')}<option value="" ${cur ? '' : 'selected'}>Altijd in huis</option></select>`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const weekLabel = w => { const t = G.weekOf(); return w === t ? 'Deze week' : w === G.addDays(t, 7) ? 'Volgende week' : w === G.addDays(t, -7) ? 'Vorige week' : `Week van ${G.fmtShort(w)}`; };

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
  if (!CLOUD) return 'Boodschappen werkt alleen met een gezin online.';
  if (!me) return 'De boodschappenlijst deel je met je gezin. <a href="../?login">Log in</a> om hem te zien.';
  if (!FAMILY) return 'De boodschappenlijst deel je met je gezin. <a href="../?view=family">Maak een gezin of sluit je aan</a>.';
  if (!canUse(APP)) return 'Boodschappen staat niet aan voor jou in dit gezin. Een beheerder kan de app aanzetten bij <b>Gezin → Apps</b> in het startscherm.';
  return '';
}

function itemSub(it) {
  const st = it.staple_id && staple(it.staple_id);
  const parts = [];
  if (it.note) parts.push(esc(it.note));
  if (st && st.every_days) parts.push(`vast · ${G.rhythmLabel(st.every_days)}`);
  const rs = (it.recipe_ids || []).map(recipe).filter(Boolean).map(r => esc(r.title));
  if (rs.length) parts.push(`voor ${rs.join(', ')}`);
  return parts.join(' · ');
}
// "2 × € 1,79 · bonus" of "niet te krijgen bij AH"
function priceText(pi) {
  if (!pi || !pi.product) return '';
  if (!pi.cost) return 'niet te krijgen bij AH';
  const p = pi.product, bonus = p.bonus ? ` <span class="bonus">${esc(p.bonus)}</span>` : '';
  if (pi.packs === 1) return PR.fmtEuro(p.price) + bonus;
  // "3 × € 0,89", en met een actie ook wat je in totaal betaalt
  const plain = Math.round(p.price * pi.packs * 100) / 100;
  return `${pi.packs} × ${PR.fmtEuro(p.price)}${pi.cost.total !== plain ? ` = ${PR.fmtEuro(pi.cost.total)}` : ''}${bonus}`;
}
// Eén tip per regel: eerst goedkoper, anders gezonder.
function tipText(pi) {
  if (!pi || !pi.alt) return '';
  const c = pi.alt.cheaper, h = pi.alt.healthier;
  if (c) return `${c.healthier ? 'Goedkoper en gezonder' : 'Goedkoper'}: ${esc(c.product.title)} ${esc(c.product.size)} (${PR.savingText(c)})`;
  if (h) return `Gezonder: ${esc(h.product.title)} (Nutri-Score ${esc(h.product.nutriscore)})`;
  return '';
}
function itemCell(it) {
  const amt = G.fmtAmount(it.qty, it.unit), pi = priceInfo(it), pr = priceText(pi);
  const sub = [pr, itemSub(it)].filter(Boolean).join(' · '), tip = it.checked_at ? '' : tipText(pi);
  return `<div class="cell item${it.checked_at ? ' done' : ''}"><button class="check" data-a="tick" data-id="${esc(it.id)}" role="checkbox" aria-checked="${!!it.checked_at}" aria-label="${esc(it.name)} in het mandje"></button>
    <button class="tx" data-a="item" data-id="${esc(it.id)}"><span class="tt">${amt ? `<span class="amt">${esc(amt)}</span>` : ''}${esc(it.name)}</span>${sub ? `<span class="st">${sub}</span>` : ''}${tip ? `<span class="hint">${tip}</span>` : ''}</button></div>`;
}
// Geschat totaal van wat nog op de lijst staat.
function totalLine(o) {
  if (!data.choices.length) return `<p class="sec-f">Tik op een boodschap en kies een product bij Albert Heijn: dan zie je prijs, bonus en een goedkoper of gezonder alternatief.</p>`;
  const t = PR.totals(o, data.choices, pmap());
  if (!t.priced) return priceErr ? `<p class="sec-f">${esc(priceErr)}</p>` : '';
  // de oudste prijs op de lijst: niet van vandaag, dan zeggen we dat
  const dates = o.map(it => PR.productFor(it, data.choices, pmap()).product).filter(p => p && p.fetched_at).map(p => localDay(p.fetched_at)).sort();
  const old = dates.length && dates[0] !== G.today() ? ` Prijzen van ${G.fmtShort(dates[0])}.` : '';
  return `<p class="sec-f total">Geschat bij AH: <b>${PR.fmtEuro(t.total)}</b>${t.saved > 0 ? ` · bonus scheelt ${PR.fmtEuro(t.saved)}` : ''}${t.unpriced ? ` · ${plural(t.unpriced, 'boodschap', 'boodschappen')} zonder prijs` : ''}.${old}${priceErr ? ` ${esc(priceErr)}` : ''}</p>`;
}

function vList() {
  const o = open(), b = basket(), wk = G.toList(data.menu, G.weekOf());
  let h = navBar(hubLink()) + '<main>' + lt('Boodschappen', esc(me.teamName));
  h += `<form class="add" id="add" autocomplete="off"><input type="text" id="add-text" maxlength="80" placeholder="Wat moet er bij? Bijv. 2 uien" enterkeyhint="done" aria-label="Wat moet er bij?"><button type="submit">Voeg toe</button></form>`;
  if (!o.length && !b.length) {
    h += `<div class="card"><h2>De lijst is leeg</h2><p class="muted">Typ hierboven wat er bij moet. Of kies gerechten voor deze week: de ingrediënten komen dan vanzelf op de lijst.</p><button class="btn" data-a="go" data-v="menu" style="margin-top:12px">Weekmenu</button></div>`;
  } else if (o.length) h += totalLine(o);
  for (const g of G.bySection(o)) h += sec(`${g.section[2]} ${esc(g.section[1])}`, `<div class="grp">${g.items.map(itemCell).join('')}</div>`);
  if (b.length) h += sec(`In het mandje (${b.length})`, `<div class="grp">${b.map(itemCell).join('')}<button class="cell tint" data-a="clear"><span class="tx"><span class="tt">Mandje leegmaken</span></span></button></div>`,
    'Afgevinkt per ongeluk? Tik nog een keer op het rondje. Morgen is het mandje vanzelf leeg.');
  const fixed = data.staples.filter(s => s.every_days).length;
  h += sec('', `<div class="grp"><button class="cell" data-a="go" data-v="menu"><span class="tx"><span class="tt">Weekmenu</span></span><span class="tr">${wk.length ? plural(wk.length, 'gerecht', 'gerechten') : ''}</span>${ICON_CHEV}</button>
    <button class="cell" data-a="go" data-v="staples"><span class="tx"><span class="tt">Vaste boodschappen</span></span><span class="tr">${fixed || ''}</span>${ICON_CHEV}</button></div>`,
    offline ? 'Geen verbinding: je ziet de laatst opgehaalde lijst.' : 'De lijst is van het hele gezin en ververst vanzelf.');
  return h + '</main>';
}

function vItem() {
  const d = ui.draft, st = d.staple_id && staple(d.staple_id);
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, '', `<button class="nb" data-a="saveitem" style="font-weight:600">Bewaar</button>`) + '<main>' + lt(esc(d.name || 'Boodschap'));
  h += `<div class="grp"><label class="cell field"><span class="fl">Wat</span><input type="text" id="i-name" value="${esc(d.name)}" maxlength="80"></label>
    <label class="cell field"><span class="fl">Hoeveel</span><input type="text" id="i-amt" value="${esc(d.amount)}" maxlength="20" placeholder="bijv. 2 of 500 g"></label>
    <label class="cell field"><span class="fl">Afdeling</span>${sectionSelect('i-sec', d.section)}</label>
    <label class="cell field"><span class="fl">Notitie</span><input type="text" id="i-note" value="${esc(d.note)}" maxlength="200" placeholder="bijv. het merk"></label></div>`;
  h += `<p class="sec-f">De afdeling onthoudt de app voor de volgende keer.</p>`;
  h += ahSection(d);
  h += sec('', `<div class="grp">${st ?`<button class="cell" data-a="staple" data-id="${esc(st.id)}"><span class="tx"><span class="tt">Vaste boodschap</span><span class="st">${G.rhythmLabel(st.every_days)}</span></span>${ICON_CHEV}</button>`
    : `<button class="cell tint" data-a="makestaple"><span class="tx"><span class="tt">Vaste boodschap maken</span><span class="st">Komt dan vanzelf terug op de lijst</span></span></button>`}
    <button class="cell red" data-a="delitem">${st && st.every_days ? 'Nog genoeg in huis' : 'Van de lijst halen'}</button></div>`,
    st && st.every_days ? `Komt terug op de lijst vanaf ${G.fmtShort(G.snoozeDate(st.every_days))}.` : '');
  return h + '</main>';
}
// Product bij Albert Heijn: het gekozen product, "alleen dit merk" en de alternatieven.
const nsBadge = n => n ? `<span class="ns ns-${esc(n)}" aria-label="Nutri-Score ${esc(n)}">${esc(n)}</span>` : '';
function productLine(p, packs = 1) {
  const c = PR.cost(p, packs), parts = [esc(p.size), p.price != null ? PR.fmtEuro(p.price) : '', PR.fmtUnitPrice(p)].filter(Boolean);
  let s = parts.join(' · ') + (p.nutriscore ? ' ' + nsBadge(p.nutriscore) : '');
  if (p.bonus) s += ` <span class="bonus">${esc(p.bonus)}${p.bonus_until ? ` t/m ${G.fmtShort(p.bonus_until)}` : ''}</span>`;
  if (c && c.dealMissed) s += ` <span class="hint">Koop er ${c.deal.n} voor de bonus</span>`;
  return s;
}
function ahSection(d) {
  const pi = priceInfo(d);
  if (!pi) return sec('Albert Heijn', `<div class="grp"><button class="cell tint" data-a="product"><span class="tx"><span class="tt">Kies een product bij AH</span><span class="st">Dan zie je prijs, bonus en een goedkoper of gezonder alternatief</span></span></button></div>`);
  const p = pi.product;
  let h = `<button class="cell" data-a="product"><span class="tx"><span class="tt">${p ? esc(p.title) : 'Gekozen product'}</span><span class="st">${p ? (p.available === false ? 'Niet meer te krijgen bij AH. Kies een ander product.' : productLine(p, pi.packs)) : 'Prijs wordt opgehaald…'}</span></span>${ICON_CHEV}</button>`;
  h += `<label class="cell field"><span class="fl">Alleen dit merk</span><input type="checkbox" id="i-brand" data-a="brand" ${pi.choice.brand_only ? 'checked' : ''}></label>`;
  for (const [k, label] of [['cheaper', 'Goedkoper'], ['healthier', 'Gezonder']]) {
    const a = pi.alt && pi.alt[k]; if (!a) continue;
    h += `<button class="cell" data-a="usealt" data-id="${esc(a.product.product_id)}"><span class="tx"><span class="tt">${a.healthier ? 'Goedkoper en gezonder' : label}: ${esc(a.product.title)}</span><span class="st">${productLine(a.product)}</span><span class="hint">Tik om te wisselen${a.saving ? ` · ${PR.savingText(a)}` : ''}</span></span></button>`;
  }
  return sec('Albert Heijn', `<div class="grp">${h}</div>`, pi.packs > 1 && pi.cost ? `Je hebt ${pi.packs} nodig: ${PR.fmtEuro(pi.cost.total)}. De keuze geldt voor het hele gezin, ook de volgende keer.` : 'De keuze geldt voor het hele gezin, ook de volgende keer.');
}

// Product zoeken bij Albert Heijn.
function vProduct() {
  const d = ui.draft, r = ui.results, pi = priceInfo(d);
  let h = navBar(`<button class="nb back" data-a="cancel">${ICON_BACK}<span>Terug</span></button>`, 'Product') + '<main>' + lt('Kies een product', esc(d.name));
  h += `<form class="add" id="psearch" autocomplete="off"><input type="search" id="p-q" value="${esc(ui.pq)}" maxlength="60" placeholder="Zoek bij Albert Heijn" enterkeyhint="search" aria-label="Zoek bij Albert Heijn"><button type="submit">Zoek</button></form>`;
  if (r === 'busy') h += `<div class="card"><p class="muted">Zoeken bij Albert Heijn…</p></div>`;
  else if (typeof r === 'string') h += `<div class="card"><p>${esc(r)}</p></div>`;
  else if (Array.isArray(r)) h += `<div class="grp">${r.map(p => `<button class="cell" data-a="choose" data-id="${esc(p.product_id)}"><span class="tx"><span class="tt">${esc(p.title)}</span><span class="st">${productLine(p)}</span></span>${pi && pi.product && pi.product.product_id === p.product_id ? '<span class="tr">✓</span>' : ''}</button>`).join('')
    || `<div class="cell"><span class="tx muted">Niets gevonden. Probeer een ander woord.</span></div>`}</div>`;
  if (pi) h += `<div style="margin-top:18px"><button class="btn danger" data-a="unchoose">Geen product kiezen</button></div>`;
  h += `<p class="sec-f">Albert Heijn heeft geen officiële koppeling. Werkt het even niet, dan blijft de lijst gewoon werken, alleen zonder prijzen.</p>`;
  return h + '</main>';
}
async function searchAH() {
  const q = (ui.pq || '').trim(); if (q.length < 2) return;
  need();
  ui.results = 'busy'; render();
  // AH zoekt ruim ("uien" geeft ook eieren): wat de zoekterm in de naam heeft, eerst
  try { const list = (await shop({ mode: 'search', q })).products || []; ui.results = [...list.filter(p => PR.matchesName(p.title, q)), ...list.filter(p => !PR.matchesName(p.title, q))]; }
  catch (e) { ui.results = e instanceof TypeError ? 'Geen verbinding. Probeer het straks opnieuw.' : e.message === AH_DOWN ? 'Zoeken bij Albert Heijn lukt nu niet. Probeer het later opnieuw.' : e.message; }
  if (ui.view === 'product') render();
}

function readItem() {
  const d = ui.draft, v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  for (const [k, id] of [['name', 'i-name'], ['amount', 'i-amt'], ['section', 'i-sec'], ['note', 'i-note']]) { const x = v(id); if (x !== undefined) d[k] = x; }
}

function vStaples() {
  const fixed = data.staples.filter(s => s.every_days), home = data.staples.filter(s => !s.every_days), t = G.today();
  let h = navBar(backTo('list', 'Lijst'), 'Vast') + '<main>' + lt('Vaste boodschappen', 'Wat je steeds weer koopt');
  h += seg([['staple', `Vast (${fixed.length})`], ['home', `In huis (${home.length})`]], ui.tab, 'tab');
  const list = ui.tab === 'home' ? home : fixed;
  h += `<div class="grp" style="margin-top:12px">${list.map(s => {
    const onList = open().some(it => it.staple_id === s.id), dd = G.dueDate(s), sug = s.every_days && G.suggestRhythm(s.every_days, boughtDates(s.id));
    const when = !s.every_days ? 'Niet vanzelf op de lijst; overgeslagen bij gerechten' : onList ? 'Staat op de lijst' : dd && dd > t ? `Weer op de lijst vanaf ${G.fmtShort(dd)}` : 'Komt op de lijst';
    return `<button class="cell" data-a="staple" data-id="${esc(s.id)}"><span class="tx"><span class="tt">${esc(s.name)}${s.qty ? ` · ${esc(G.fmtAmount(s.qty, s.unit))}` : ''}</span>
      <span class="st">${s.every_days ? G.rhythmLabel(s.every_days) + ' · ' : ''}${when}</span>${sug ? `<span class="hint">Je koopt dit ${G.rhythmLabel(sug)}</span>` : ''}</span>${ICON_CHEV}</button>`;
  }).join('') || `<div class="cell"><span class="tx muted">${ui.tab === 'home' ? 'Nog niets. Bijv. olie, rijst of kruiden die je altijd in huis hebt.' : 'Nog niets. Bijv. melk elke week, wc-papier om de 2 weken.'}</span></div>`}</div>`;
  h += sec(ui.tab === 'home' ? 'Toevoegen aan In huis' : 'Vaste boodschap toevoegen', `<div class="grp"><label class="cell field"><span class="fl">Wat</span><input type="text" id="s-new" maxlength="80" placeholder="${ui.tab === 'home' ? 'bijv. olijfolie' : 'bijv. melk'}"></label>
    ${ui.tab === 'home' ? '' : `<label class="cell field"><span class="fl">Hoe vaak</span>${rhythmSelect('s-every', 7)}</label>`}
    <button class="cell tint" data-a="addstaple"><span class="tx"><span class="tt">Voeg toe</span></span></button></div>`,
    ui.tab === 'home' ? 'Wat je altijd in huis hebt, zet de app niet op de lijst als het in een gerecht van het weekmenu staat.'
      : 'Een vaste boodschap komt vanzelf op de lijst als hij aan de beurt is: iets eerder dan het ritme, zodat je hem op tijd haalt. Koop je het vaker of minder vaak, dan doet de app een voorstel.');
  return h + '</main>';
}

function vStaple() {
  const d = ui.draft, s = staple(d.id), sug = s && s.every_days && G.suggestRhythm(s.every_days, boughtDates(s.id));
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, '', `<button class="nb" data-a="savestaple" style="font-weight:600">Bewaar</button>`) + '<main>' + lt(esc(d.name || 'Vaste boodschap'));
  if (sug) h += `<div class="card"><h2>Je koopt dit ${G.rhythmLabel(sug)}</h2><p class="muted">De laatste keren zat er meestal ${sug === 1 ? '1 dag' : sug + ' dagen'} tussen. Het ritme staat op ${G.rhythmLabel(s.every_days)}.</p><button class="btn" data-a="usesug" data-v="${sug}" style="margin-top:12px">Maak het ${G.rhythmLabel(sug)}</button></div>`;
  h += `<div class="grp"><label class="cell field"><span class="fl">Wat</span><input type="text" id="s-name" value="${esc(d.name)}" maxlength="80"></label>
    <label class="cell field"><span class="fl">Hoeveel</span><input type="text" id="s-amt" value="${esc(d.amount)}" maxlength="20" placeholder="bijv. 2 of 1 l"></label>
    <label class="cell field"><span class="fl">Hoe vaak</span>${rhythmSelect('s-every2', d.every_days)}</label>
    <label class="cell field"><span class="fl">Afdeling</span>${sectionSelect('s-sec', d.section)}</label></div>`;
  if (s && s.last_bought) h += `<p class="sec-f">Laatst gekocht: ${G.fmtShort(s.last_bought)}.</p>`;
  h += `<div style="margin-top:18px"><button class="btn danger" data-a="delstaple">Geen vaste boodschap meer</button></div>`;
  return h + '</main>';
}
function readStaple() {
  const d = ui.draft, v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  for (const [k, id] of [['name', 's-name'], ['amount', 's-amt'], ['section', 's-sec']]) { const x = v(id); if (x !== undefined) d[k] = x; }
  const e = v('s-every2'); if (e !== undefined) d.every_days = e ? +e : null;
}

function vMenu() {
  const w = ui.week, rows = G.toList(data.menu, w), todo = rows.filter(m => !m.listed_at);
  let h = navBar(backTo('list', 'Lijst'), 'Weekmenu') + '<main>' + lt('Weekmenu', 'Wat eten we deze week?');
  h += `<div class="pager"><button class="nb" data-a="week" data-d="-7" aria-label="Vorige week">‹</button><button class="lbl" data-a="thisweek"><b>${weekLabel(w)}</b><span>${G.fmtShort(w)} – ${G.fmtShort(G.addDays(w, 6))}</span></button><button class="nb" data-a="week" data-d="7" aria-label="Volgende week">›</button></div>`;
  if (!data.recipesOk) return h + `<div class="card"><p>Het weekmenu haalt gerechten uit de app <b>Gerechten</b>. Die staat niet aan voor jou. Een beheerder kan hem aanzetten bij <b>Gezin → Apps</b>.</p></div></main>`;
  h += `<div class="grp">${rows.map(m => { const r = recipe(m.recipe_id); return `<div class="cell"><span class="tx"><span class="tt">${esc(r ? r.title : 'Gerecht')}</span><span class="st">${m.listed_at ? 'Op de lijst gezet' : 'Nog niet op de lijst'}</span></span>
      <span class="stepper"><button data-a="srv" data-id="${esc(m.id)}" data-d="-1" aria-label="Minder personen">−</button><b>${m.servings}</b><button data-a="srv" data-id="${esc(m.id)}" data-d="1" aria-label="Meer personen">+</button></span>
      <button class="nb" data-a="delmenu" data-id="${esc(m.id)}" aria-label="Van het menu halen" style="color:var(--red)">✕</button></div>`; }).join('')}
    <button class="cell tint" data-a="go" data-v="pick"><span class="tx"><span class="tt">Gerecht toevoegen</span></span></button></div>`;
  h += `<p class="sec-f">Het getal is voor hoeveel personen. De hoeveelheden rekent de app om.</p>`;
  if (todo.length) h += `<div style="margin-top:14px"><button class="btn" data-a="tolist">Ingrediënten op de lijst (${plural(todo.length, 'gerecht', 'gerechten')})</button></div>`;
  return h + '</main>';
}

function vPick() {
  const q = G.norm(ui.q), list = data.recipes.filter(r => !q || G.norm(r.title).includes(q));
  let h = navBar(backTo('menu', 'Weekmenu'), 'Kies een gerecht') + '<main>' + lt('Kies een gerecht', weekLabel(ui.week));
  h += `<input type="search" class="search" id="pick-q" value="${esc(ui.q)}" placeholder="Zoek een gerecht" aria-label="Zoek een gerecht">`;
  h += `<div class="grp" id="pick-list">${pickList(list)}</div>`;
  return h + '</main>';
}
const pickList = list => list.map(r => `<button class="cell" data-a="pick" data-id="${esc(r.id)}"><span class="tx"><span class="tt">${esc(r.title)}</span><span class="st">${r.servings} personen${r.health_score ? ` · gezondheid ${r.health_score}/10` : ''}</span></span>${ICON_CHEV}</button>`).join('')
  || `<div class="cell"><span class="tx muted">${data.recipes.length ? 'Geen gerecht gevonden.' : 'Nog geen gerechten. Zet ze eerst in de app Gerechten.'}</span></div>`;

function vToList() {
  const d = ui.draft;
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, 'Op de lijst') + '<main>' + lt('Op de lijst', `${weekLabel(ui.week)} · ${plural(d.rows.length, 'gerecht', 'gerechten')}`);
  if (!d.entries.length) return h + '<div class="card"><p>Deze gerechten hebben geen ingrediënten.</p></div></main>';
  const groups = G.bySection(d.entries.map((e, i) => ({ ...e, i })));
  for (const g of groups) h += sec(`${g.section[2]} ${esc(g.section[1])}`, `<div class="grp">${g.items.map(e => `<div class="cell item"><button class="check" data-a="sel" data-i="${e.i}" role="checkbox" aria-checked="${d.sel.has(e.i)}" aria-label="${esc(e.name)} op de lijst"></button>
    <button class="tx" data-a="sel" data-i="${e.i}"><span class="tt">${G.fmtAmount(e.qty, e.unit) ? `<span class="amt">${esc(G.fmtAmount(e.qty, e.unit))}</span>` : ''}${esc(e.name)}</span><span class="st">${e.home ? 'Altijd in huis · ' : ''}${e.recipe_ids.map(recipe).filter(Boolean).map(r => esc(r.title)).join(', ')}</span></button></div>`).join('')}</div>`);
  h += `<p class="sec-f">Vink uit wat je al in huis hebt. Staat iets al op de lijst, dan telt de app het erbij op.</p>`;
  h += `<div style="margin-top:14px"><button class="btn" data-a="putlist">Zet ${d.sel.size} op de lijst</button></div>`;
  return h + '</main>';
}

const VIEWS = { list: vList, item: vItem, product: vProduct, staples: vStaples, staple: vStaple, menu: vMenu, pick: vPick, tolist: vToList };
function render() {
  const g = gate(), a = $('#app');
  a.innerHTML = g ? navBar(hubLink()) + '<main>' + lt('Boodschappen') + `<div class="card"><p>${g}</p></div></main>` : (VIEWS[ui.view] || vList)();
  onScroll();
}
function go(view, extra) { Object.assign(ui, { view }, extra || {}); render(); window.scrollTo(0, 0); }
function onScroll() { const n = document.getElementById('nav'); if (n) n.classList.toggle('scrolled', window.scrollY > 4); }
addEventListener('scroll', onScroll, { passive: true });

const amountText = (q, u) => G.fmtAmount(q, u);
function amountOf(s) { const a = G.parseAmount(s); if (!a) throw new Error('Schrijf de hoeveelheid als een getal, bijv. 2 of 500 g.'); return a; }

document.addEventListener('submit', ev => {
  if (ev.target.id === 'psearch') { ev.preventDefault(); ui.pq = $('#p-q').value; document.activeElement.blur(); run(null, searchAH); return; }
  if (ev.target.id !== 'add') return;
  ev.preventDefault();
  const inp = $('#add-text'), text = inp.value;
  if (!text.trim()) return;
  run(null, async () => { const msg = await addText(text); inp.value = ''; render(); const i = $('#add-text'); if (i) i.focus(); if (msg) toast(msg); });
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'p-q') ui.pq = ev.target.value;
  if (ev.target.id === 'pick-q') { ui.q = ev.target.value; const q = G.norm(ui.q); $('#pick-list').innerHTML = pickList(data.recipes.filter(r => !q || G.norm(r.title).includes(q))); }
});

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a, v = ui.view;
  if (v === 'item') readItem(); else if (v === 'staple') readStaple();
  switch (a) {
    case 'go': go(el.dataset.v, { draft: null, q: el.dataset.v === 'pick' ? '' : ui.q }); break;
    case 'cancel': if (v === 'product') go('item'); else go(v === 'staple' ? (ui.back || 'staples') : v === 'tolist' ? 'menu' : 'list', { draft: null }); break;
    case 'product': if (!ui.draft.name.trim()) { toast('Geef de boodschap eerst een naam.', 'err'); break; }
      go('product', { pq: ui.draft.name.trim(), results: null }); run(null, searchAH); break;
    case 'choose': run(el, async () => {
      const p = Array.isArray(ui.results) && ui.results.find(x => x.product_id === el.dataset.id); if (!p) return;
      await choose(ui.draft.name, p.product_id);
      if (!data.products.some(x => x.product_id === p.product_id)) { data.products = data.products.concat(p); persist(); }
      if (pool && !pmap().has(p.product_id)) pool = pool.concat(p);
      go('item'); toast(`${p.title} gekozen.`);
      loadPrices(); // vergelijkbare producten ophalen voor goedkoper en gezonder
    }); break;
    case 'unchoose': run(el, async () => {
      need();
      const pi = priceInfo(ui.draft); if (!pi) return;
      await api(`/rest/v1/grocery_choices?id=eq.${pi.choice.id}`, { method: 'DELETE' });
      data.choices = data.choices.filter(c => c.id !== pi.choice.id); persist(); go('item'); toast('Geen product meer gekozen.');
    }); break;
    case 'brand': run(null, async () => {
      const pi = priceInfo(ui.draft); if (!pi) return;
      try { await choose(ui.draft.name, pi.choice.product_id, { brand_only: el.checked }); } catch (e) { el.checked = !el.checked; throw e; }
      render(); toast(el.checked ? 'Alleen dit merk: geen goedkoper ander merk meer.' : 'Ook andere merken mogen.');
    }); break;
    case 'usealt': run(el, async () => {
      const p = pmap().get(el.dataset.id); if (!p) return;
      await choose(ui.draft.name, p.product_id);
      if (!data.products.some(x => x.product_id === p.product_id)) { data.products = data.products.concat(p); persist(); }
      render(); toast(`Gewisseld naar ${p.title}.`);
    }); break;
    case 'tick': run(null, () => toggle(el.dataset.id)); break;
    case 'clear': run(el, async () => {
      need();
      await api(`/rest/v1/grocery_items?team_id=eq.${FAMILY}&checked_at=not.is.null&deleted=is.false`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { deleted: true } });
      data.items = open(); persist(); render(); toast('Mandje is leeg.');
    }); break;
    case 'item': { const it = data.items.find(x => x.id === el.dataset.id); if (it) go('item', { id: it.id, draft: { ...it, amount: amountText(it.qty, it.unit) } }); break; }
    case 'saveitem': run(el, async () => {
      need();
      const d = ui.draft, name = d.name.trim(); if (!name) throw new Error('Wat moet er bij?');
      const amt = amountOf(d.amount);
      const [row] = await patch('grocery_items', d.id, { name, ...amt, section: d.section, note: d.note.trim() });
      upsertLocal(data.items, row);
      // De afdeling onthouden: als laatste in de historie.
      data.history.unshift({ name: row.name, section: row.section, staple_id: row.staple_id, checked_at: null, updated_at: row.updated_at }); persist();
      go('list', { draft: null }); toast('Bewaard.');
    }); break;
    case 'delitem': run(el, async () => {
      need();
      const d = ui.draft, st = d.staple_id && staple(d.staple_id);
      if (st && st.every_days) { const [s] = await patch('grocery_staples', st.id, { snooze_until: G.snoozeDate(st.every_days) }); upsertLocal(data.staples, s); }
      const [row] = await patch('grocery_items', d.id, { deleted: true }); upsertLocal(data.items, row);
      go('list', { draft: null }); toast(st && st.every_days ? `Komt terug vanaf ${G.fmtShort(G.snoozeDate(st.every_days))}.` : 'Van de lijst gehaald.');
    }); break;
    case 'makestaple': run(el, async () => {
      need();
      const d = ui.draft, amt = amountOf(d.amount);
      const [s] = await post('grocery_staples', { team_id: FAMILY, name: d.name.trim(), ...amt, section: d.section, every_days: 7 });
      upsertLocal(data.staples, s);
      const [row] = await patch('grocery_items', d.id, { staple_id: s.id }); upsertLocal(data.items, row);
      go('staple', { draft: { ...s, amount: amountText(s.qty, s.unit) }, back: 'list' }); toast('Vaste boodschap: kies hoe vaak.');
    }); break;
    case 'tab': ui.tab = el.dataset.v; render(); break;
    case 'addstaple': run(el, async () => {
      need();
      const name = (($('#s-new') || {}).value || '').trim(); if (!name) throw new Error('Wat koop je steeds weer?');
      if (data.staples.some(s => G.sameName(s.name, name))) throw new Error(`${name} staat er al bij.`);
      const sv = ($('#s-every') || {}).value, every = ui.tab === 'home' || !sv ? null : +sv;
      const p = G.parseLine(name) || { name, qty: null, unit: '' };
      const [s] = await post('grocery_staples', { team_id: FAMILY, name: p.name, qty: p.qty, unit: p.unit, section: G.sectionFor(p.name, memory()), every_days: every });
      upsertLocal(data.staples, s);
      if (every) await load(); else render();
      toast(every ? `${s.name}: ${G.rhythmLabel(every)}.` : `${s.name} staat bij In huis.`);
    }); break;
    case 'staple': { const s = staple(el.dataset.id); if (s) go('staple', { draft: { ...s, amount: amountText(s.qty, s.unit) }, back: v === 'item' ? 'list' : 'staples' }); break; }
    case 'usesug': ui.draft.every_days = +el.dataset.v; render(); toast('Vergeet niet te bewaren.'); break;
    case 'savestaple': run(el, async () => {
      need();
      const d = ui.draft, name = d.name.trim(); if (!name) throw new Error('Vul een naam in.');
      const [s] = await patch('grocery_staples', d.id, { name, ...amountOf(d.amount), section: d.section, every_days: d.every_days, snooze_until: null });
      upsertLocal(data.staples, s);
      await load();
      go(ui.back || 'staples', { draft: null }); toast('Bewaard.');
    }); break;
    case 'delstaple': if (confirm(`${ui.draft.name} is geen vaste boodschap meer. Wat nu op de lijst staat, blijft staan.`)) run(el, async () => {
      need(); const [s] = await patch('grocery_staples', ui.draft.id, { deleted: true }); upsertLocal(data.staples, s); go('staples', { draft: null });
    }); break;
    case 'week': ui.week = G.addDays(ui.week, +el.dataset.d); render(); break;
    case 'thisweek': ui.week = G.weekOf(); render(); break;
    case 'pick': run(el, async () => {
      need();
      const r = recipe(el.dataset.id); if (!r) return;
      const [m] = await post('grocery_menu', { team_id: FAMILY, week: ui.week, recipe_id: r.id, servings: r.servings || 4 });
      upsertLocal(data.menu, m); go('menu'); toast(`${r.title} staat op het menu.`);
    }); break;
    case 'srv': run(null, async () => {
      need();
      const m = data.menu.find(x => x.id === el.dataset.id), n = Math.max(1, Math.min(30, m.servings + +el.dataset.d)); if (n === m.servings) return;
      m.servings = n; render();
      const [row] = await patch('grocery_menu', m.id, { servings: n }); upsertLocal(data.menu, row);
    }); break;
    case 'delmenu': run(null, async () => { need(); const [row] = await patch('grocery_menu', el.dataset.id, { deleted: true }); upsertLocal(data.menu, row); render(); }); break;
    case 'tolist': {
      const rows = G.toList(data.menu, ui.week).filter(m => !m.listed_at);
      const home = data.staples.filter(s => !s.every_days);
      const entries = G.combine(rows.map(m => ({ recipe: recipe(m.recipe_id), servings: m.servings })), memory())
        .map(e => ({ ...e, home: e.basic || home.some(s => G.sameName(s.name, e.name)) }));
      go('tolist', { draft: { rows, entries, sel: new Set(entries.map((e, i) => e.home ? -1 : i).filter(i => i >= 0)) } });
      break;
    }
    case 'sel': { const i = +el.dataset.i, s = ui.draft.sel; if (s.has(i)) s.delete(i); else s.add(i); render(); break; }
    case 'putlist': run(el, async () => {
      need();
      const d = ui.draft, chosen = d.entries.filter((e, i) => d.sel.has(i));
      const { updates, inserts } = G.mergeIntoList(open(), chosen);
      for (const u of updates) { const [row] = await patch('grocery_items', u.id, { qty: u.qty, unit: u.unit, recipe_ids: u.recipe_ids }); upsertLocal(data.items, row); }
      if (inserts.length) for (const row of await post('grocery_items', inserts.map(x => ({ ...x, team_id: FAMILY, source: 'recipe' })))) upsertLocal(data.items, row);
      const at = new Date().toISOString();
      for (const m of d.rows) { const [row] = await patch('grocery_menu', m.id, { listed_at: at }); upsertLocal(data.menu, row); }
      go('list', { draft: null }); toast(`${plural(chosen.length, 'boodschap', 'boodschappen')} op de lijst.`);
    }); break;
  }
});

// Prijzen één keer per dag bijwerken (de server haalt alleen op wat nog niet van vandaag is).
const pricesStale = () => !data.pricesAt || localDay(data.pricesAt) !== G.today();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { load(); if (pricesStale()) loadPrices(); } });
addEventListener('online', () => { load(); loadPrices(); });
setInterval(() => { if (document.visibilityState === 'visible' && ui.view === 'list' && !busy) load(); }, POLL_MS);

render();
load().then(() => loadPrices());
