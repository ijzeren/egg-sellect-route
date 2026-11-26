// Financiën — bij- en afschrijvingen van de eigen bankrekeningen, ingedeeld in soorten.
//   - fase 1: een export uit de bank inlezen (Rabobank CSV of CAMT.053, zie import.js); later ook ophalen via PSD2
//     (docs/plan-finance.md)
//   - een rekening is van wie hem inleest; alleen die ziet hem, tenzij die hem deelt met de beheerders van het gezin
//     (rechten in de database: finance_can_see). Het rekeningnummer zelf bewaren we niet (alleen laatste 4 + hash).
//   - soorten en regels zijn van het gezin; regels delen nieuwe transacties vanzelf in, zelf gekozen soorten blijven
//   - rekenwerk (overzicht, regels, vaste lasten): money.js
//   - fase 3: bankkoppeling via Enable Banking (PSD2): koppelen, elke dag ophalen op de server (Edge Function
//     integrations, type bank); hier alleen knoppen, de status en de terugkeer van de bank (?code=…&state=…)
//   - fase 2: uitbetalingen van Booking.com en Airbnb koppelen aan boekingen in Verhuur (payouts.js), alleen voor
//     beheerders van Verhuur; boekingen worden niet op de telefoon bewaard
import { storage, account, api, applyTheme, esc, registerSW, canUse, CLOUD, CFG } from '../shared/family.js';
import * as M from './money.js';
import * as P from './payouts.js';
import { parseFile, period, ibanHash, dropKnown } from './import.js';
import { sourceName } from '../rentals/tax.js';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
registerSW('../');

const APP = 'finance';
const me = account();
const FAMILY = me && me.teamId ? me.teamId : null;
const DKEY = `${FAMILY}:data`;
const ICON_BACK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_CHEV = '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const TODAY = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const TX_FIELDS = 'id,account_id,ext_id,booked_on,amount,counterparty,counterparty_hash,description,code,category_id,category_by,excluded';

// data = { accounts, cats, rules, txs, members, banks, at }  (banks = mijn bankkoppelingen, zonder geheimen)
let data = (FAMILY && storage.get(APP, DKEY)) || { accounts: [], cats: [], rules: [], txs: [], members: [], banks: [], at: null };
data.banks = data.banks || [];

// Terug van de bank (Rabobank via Enable Banking): ?code=…&state=… of ?error=…&state=…. Meteen uit het adres halen.
const Q = new URLSearchParams(location.search);
const bankReturn = Q.get('state') && (Q.get('code') || Q.get('error')) ? { code: Q.get('code'), state: Q.get('state'), error: Q.get('error') } : null;
if (bankReturn) history.replaceState(null, '', location.pathname);
let bankAvail = null; // mag dit gezin een rekening koppelen? (vraagt de server, één keer)
const BANK_WARN_DAYS = 14;
const daysLeft = b => (b.config && b.config.valid_until ? Math.floor((Date.parse(b.config.valid_until) - Date.now()) / 864e5) : null);
const bankNeedsCare = b => b.status === 'error' || (daysLeft(b) !== null && daysLeft(b) <= BANK_WARN_DAYS) || !(b.config && b.config.valid_until);
let ui = { view: bankReturn ? 'bankdone' : 'home', bankDone: null, m: M.month(TODAY()), acc: storage.get(APP, `${FAMILY}:acc`) || '', f: { m: '', cat: '', q: '' }, id: null, draft: null, back: 'home', imp: null, limit: 150 };
let loading = false, offline = false;

const cat = id => data.cats.find(c => c.id === id && !c.deleted);
const acct = id => data.accounts.find(a => a.id === id);
const memberName = uid => ((data.members || []).find(m => m.user_id === uid) || {}).name || 'iemand anders';
const mine = a => a && me && a.user_id === me.userId;
const accLabel = a => a ? `${a.name}${a.iban_last4 ? ' ••' + a.iban_last4 : ''}` : 'Rekening';
const visibleTxs = () => ui.acc ? data.txs.filter(t => t.account_id === ui.acc) : data.txs;
const isTransfer = t => !!t.counterparty_hash && data.accounts.some(a => a.iban_hash === t.counterparty_hash);

// Verhuur (fase 2): boekingen en gekoppelde uitbetalingen, alleen in het geheugen (niet op de telefoon bewaard).
const rentAdmin = () => !!(me && me.apps && me.apps.rentals && me.apps.rentals.role === 'admin' && canUse('rentals'));
let rent = null; // { houses, bookings, amounts: { booking_id: rij }, payouts }
async function loadRent() {
  if (!rentAdmin()) { rent = null; return; }
  const [houses, bookings, amounts, payouts] = await Promise.all([
    api(`/rest/v1/rental_houses?team_id=eq.${FAMILY}&deleted=is.false&select=id,name&order=sort,name`),
    api(`/rest/v1/rental_bookings?team_id=eq.${FAMILY}&deleted=is.false&status=eq.booked&source=neq.own&select=id,house_id,source,status,arrival,departure,external_id,guests,deleted&order=arrival`),
    api(`/rest/v1/rental_booking_amounts?team_id=eq.${FAMILY}&select=booking_id,payout,guest_name`),
    api(`/rest/v1/rental_booking_payouts?team_id=eq.${FAMILY}&select=*`),
  ]);
  rent = { houses: houses || [], bookings: bookings || [], amounts: Object.fromEntries((amounts || []).map(a => [a.booking_id, a])), payouts: payouts || [] };
}
const txPayouts = id => (rent ? rent.payouts.filter(p => p.transaction_id === id) : []);
const bkById = id => (rent && rent.bookings.find(b => b.id === id)) || null;
const bkShort = b => (b ? `${sourceName(b.source)} ${M.shortDate(b.arrival)}` : 'boeking');
const bkTitle = b => { if (!b) return 'Boeking (niet meer in Verhuur)'; const a = rent.amounts[b.id]; return `${esc(sourceName(b.source))} · ${M.shortDate(b.arrival)} – ${M.shortDate(b.departure)}${a && a.guest_name ? ` · ${esc(a.guest_name)}` : ''}`; };
const bkHouse = b => (b && rent.houses.length > 1 ? esc((rent.houses.find(h => h.id === b.house_id) || {}).name || '') : '');
const suggestFor = t => (rent ? P.suggest(t, P.candidates(t, rent.bookings, rent.amounts, rent.payouts)) : null);
const openPayouts = () => data.txs.filter(t => P.platformOf(t) && !txPayouts(t.id).length);

/* ---------- server ---------- */
async function loadTxs() {
  const out = [];
  for (let off = 0; ; off += 1000) {
    const page = await api(`/rest/v1/finance_transactions?team_id=eq.${FAMILY}&select=${TX_FIELDS}&order=booked_on.desc,id&limit=1000&offset=${off}`);
    out.push(...(page || []));
    if (!page || page.length < 1000) return out;
  }
}
async function load() {
  if (!FAMILY || loading || gate()) return;
  loading = true;
  try {
    let banks;
    let [cats, rules, accounts, members, txs] = await Promise.all([
      api(`/rest/v1/finance_categories?team_id=eq.${FAMILY}&deleted=is.false&select=*&order=sort,name`),
      api(`/rest/v1/finance_rules?team_id=eq.${FAMILY}&select=*&order=updated_at`),
      api(`/rest/v1/finance_accounts?team_id=eq.${FAMILY}&select=*&order=created_at`),
      api(`/rest/v1/team_members?team_id=eq.${FAMILY}&select=user_id,name,role&order=joined_at`).catch(() => data.members),
      loadTxs(),
      loadRent().catch(() => { rent = null; }),
      api(`/rest/v1/integrations?team_id=eq.${FAMILY}&type=eq.bank&select=id,label,config,status,last_sync_at,last_error,enabled&order=created_at`).catch(() => data.banks),
    ]).then(r => { banks = r[6]; return r; });
    if (!(cats || []).length) {
      await api('/rest/v1/rpc/finance_setup', { method: 'POST', body: { p_team: FAMILY } });
      cats = await api(`/rest/v1/finance_categories?team_id=eq.${FAMILY}&deleted=is.false&select=*&order=sort,name`);
    }
    data = { accounts: accounts || [], cats: cats || [], rules: rules || [], txs: txs || [], members: members || [], banks: (banks || []).map(b => ({ ...b, config: { valid_until: b.config && b.config.valid_until, accounts: b.config && b.config.accounts } })), at: new Date().toISOString() };
    if (data.banks.length) bankAvail = true;
    if (ui.acc && !acct(ui.acc)) ui.acc = '';
    // eerste keer openen: de maand van de laatste transactie als deze maand nog leeg is
    if (!data.txs.some(t => M.month(t.booked_on) === ui.m) && data.txs.length && !ui.touched) ui.m = M.month(data.txs[0].booked_on);
    persist();
    offline = false;
  } catch (e) {
    offline = e instanceof TypeError || !navigator.onLine;
    if (!offline) toast(e.message, 'err');
  } finally { loading = false; }
  if (!['tx', 'rule', 'account', 'import', 'cats', 'link', 'bankdone'].includes(ui.view)) { render(); autoRules(); }
}
// Wat de bank 's nachts binnenbracht, is nog niet ingedeeld: regels erop (alleen nog niet ingedeelde transacties).
async function autoRules() {
  if (!data.banks.length || busy || !navigator.onLine) return;
  const open = new Set(data.txs.filter(t => !t.category_by && !t.excluded).map(t => t.id));
  const ch = M.ruleChanges(data.rules, data.txs).filter(c => open.has(c.id) && c.category_id);
  if (!ch.length) return;
  busy = true;
  try { const by = new Map(); for (const c of ch) { if (!by.has(c.category_id)) by.set(c.category_id, []); by.get(c.category_id).push(c.id); } for (const [k, ids] of by) await patchTxs(ids, { category_id: k, category_by: 'rule' }); }
  catch (e) { /* volgende keer opnieuw */ } finally { busy = false; }
  if (['home', 'list'].includes(ui.view)) render();
}
// Kopie op de telefoon (alleen lezen zonder verbinding) en een kleine samenvatting voor de tegel in de hub.
function persist() {
  const live = new Set(data.cats.map(c => c.id)), from = M.addMonths(M.month(TODAY()), -1);
  const open = data.txs.filter(t => !t.excluded && !live.has(t.category_id) && M.month(t.booked_on) >= from).length;
  const imported = data.accounts.map(a => a.imported_at).filter(Boolean).sort().pop() || null;
  const care = data.banks.filter(bankNeedsCare).length;
  storage.set(APP, `${FAMILY}:tile`, { accounts: data.accounts.length, open, imported, bank: care ? 'renew' : data.banks.length ? 'ok' : '' });
  if (!storage.set(APP, DKEY, data)) storage.remove(APP, DKEY); // te groot voor de telefoon: dan alleen online
}
const need = () => { if (!navigator.onLine) throw new Error('Geen verbinding. Probeer het straks opnieuw.'); };
const post = (table, body, prefer = 'return=representation') => api(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: prefer }, body });
const patch = (path, body) => api(`/rest/v1/${path}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body });
function setLocalTx(rows) { for (const r of rows || []) { const t = data.txs.find(x => x.id === r.id); if (t) Object.assign(t, r); } persist(); }

// Soort voor een reeks transacties (per 80, zodat het adres niet te lang wordt).
async function patchTxs(ids, body) {
  for (let i = 0; i < ids.length; i += 80) setLocalTx(await patch(`finance_transactions?id=in.(${ids.slice(i, i + 80).join(',')})&select=${TX_FIELDS}`, body));
}
// Regels opnieuw toepassen op alles wat ik zie (zelf gekozen soorten blijven staan).
async function applyRules() {
  const changes = M.ruleChanges(data.rules, data.txs), by = new Map();
  for (const c of changes) { const k = c.category_id || ''; if (!by.has(k)) by.set(k, []); by.get(k).push(c.id); }
  for (const [k, ids] of by) await patchTxs(ids, k ? { category_id: k, category_by: 'rule' } : { category_id: null, category_by: '' });
  return changes.length;
}

/* ---------- scherm ---------- */
const $ = s => document.querySelector(s);
const navBar = (left, title = '', right = '') => `<header class="nav" id="nav"><div class="nav-l">${left || ''}</div><div class="nav-t">${title}</div><div class="nav-r">${right}</div></header>`;
const hubLink = () => `<a class="nb back" href="../" aria-label="Naar alle apps">${ICON_BACK}<span>Apps</span></a>`;
const backTo = (v, txt) => `<button class="nb back" data-a="go" data-v="${v}">${ICON_BACK}<span>${txt}</span></button>`;
const lt = (t, sub) => `<div class="lt"><h1 tabindex="-1">${t}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const sec = (head, body, foot) => `<section class="sec">${head ? `<h2 class="sec-h">${head}</h2>` : ''}${body}${foot ? `<p class="sec-f">${foot}</p>` : ''}</section>`;
const seg = (items, cur, a, extra = '') => `<div class="segc" role="group">${items.map(([v, l]) => `<button data-a="${a}" data-v="${v}" ${extra} aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
const money = (c, o) => `<span class="amt${c > 0 ? ' pos' : ''}">${M.fmt(c, o)}</span>`;
const catLabel = id => { const c = cat(id); return c ? `${c.icon ? c.icon + ' ' : ''}${esc(c.name)}` : ''; };

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
  if (!CLOUD) return 'Financiën werkt alleen met een account online.';
  if (!me) return 'Je bankgegevens staan veilig op je eigen account. <a href="../?login">Log in</a> om verder te gaan.';
  if (!FAMILY) return 'Financiën hoort bij een gezin. <a href="../?view=family">Maak een gezin of sluit je aan</a>.';
  if (!canUse(APP)) return 'Financiën staat niet aan voor jou in dit gezin. Een beheerder kan de app aanzetten bij <b>Gezin → Apps</b> in het startscherm.';
  return '';
}

const accChips = () => data.accounts.length > 1 ? `<div class="chips" role="group" aria-label="Rekening">${[['', 'Alle rekeningen'], ...data.accounts.map(a => [a.id, a.name])].map(([id, n]) =>
  `<button data-a="acc" data-id="${esc(id)}" aria-pressed="${ui.acc === id}">${esc(n)}</button>`).join('')}</div>` : '';

function txCell(t, showDate = true, link = true) {
  const a = data.accounts.length > 1 && !ui.acc ? acct(t.account_id) : null, c = M.cents(t.amount);
  const what = t.excluded ? '<span class="muted">Telt niet mee</span>' : cat(t.category_id) ? catLabel(t.category_id) : '<span class="open">Niet ingedeeld</span>';
  return `<${link ? `button class="cell tx" data-a="tx" data-id="${esc(t.id)}"` : 'div class="cell tx"'}><span class="tx"><span class="tt">${esc(t.counterparty || t.description || 'Zonder omschrijving')}</span>
    <span class="st">${[showDate ? M.shortDate(t.booked_on) : '', what, a ? esc(a.name) : ''].filter(Boolean).join(' · ')}</span></span><span class="tr">${money(c, { sign: c > 0 })}</span></${link ? 'button' : 'div'}>`;
}

function vHome() {
  let h = navBar(hubLink(), '', data.accounts.length ? `<button class="nb" data-a="go" data-v="import" aria-label="Bestand inlezen" style="font-size:1.6rem;font-weight:300">+</button>` : '') + '<main>' + lt('Financiën', esc(me.teamName));
  if (!data.accounts.length) {
    h += `<div class="card"><h2>Begin met een export uit je bank</h2><p class="muted">Download in Rabo Online Bankieren je transacties als CSV-bestand en lees dat hier in. De app deelt ze in: boodschappen, energie, verzekeringen en zo verder.</p>
      <button class="btn" data-a="go" data-v="import" style="margin-top:12px">Bestand inlezen</button><p class="small muted" style="margin-top:10px"><a href="../?article=financien-inlezen">Hoe download ik mijn transacties?</a></p></div>
      ${bankSection()}
      <div class="card"><h2>Alleen jij ziet je rekening</h2><p class="muted">Een rekening die jij inleest, is privé. Je kunt hem zelf delen met de beheerders van het gezin, bijvoorbeeld de gezamenlijke rekening. <a href="../?article=financien-privacy">Wie ziet wat?</a></p></div>`;
    return h + (loading ? '<p class="sec-f">Laden…</p>' : '') + '</main>';
  }
  h += accChips();
  const txs = visibleTxs(), s = M.summary(txs, data.cats, ui.m), av = M.averages(txs, data.cats, ui.m);
  const now = M.month(TODAY());
  h += `<div class="pager"><button class="nb" data-a="month" data-d="-1" aria-label="Vorige maand">‹</button><button class="lbl" data-a="thismonth"><b>${M.monthName(ui.m)}</b>${ui.m === now ? '<span>deze maand</span>' : ''}</button><button class="nb" data-a="month" data-d="1" aria-label="Volgende maand" ${ui.m >= now ? 'disabled' : ''}>›</button></div>`;
  h += `<div class="tot"><div><span>Bij</span><b>${money(s.inC, { whole: true, sign: true })}</b></div><div><span>Af</span><b>${money(s.outC, { whole: true })}</b></div><div><span>Over</span><b>${money(s.netC, { whole: true, sign: true })}</b></div></div>`;
  for (const b of data.banks.filter(bankNeedsCare)) {
    const d = daysLeft(b);
    h += `<button class="banner ${b.status === 'error' || (d !== null && d < 0) ? 'red' : 'orange'}" data-a="go" data-v="accounts" style="width:100%;text-align:left;margin-top:10px"><span>🏦</span><span><b>${d !== null && d < 0 ? 'Bankkoppeling verlopen' : b.status === 'error' ? 'Bankkoppeling werkt niet' : d !== null ? `Bankkoppeling verloopt over ${d} ${d === 1 ? 'dag' : 'dagen'}` : 'Bankkoppeling niet afgemaakt'}</b><br>${b.status === 'error' && b.last_error ? esc(b.last_error) : 'Tik om de toestemming bij de bank te vernieuwen.'}</span></button>`;
  }
  if (s.open) h += `<button class="banner orange" data-a="list" data-cat="open" data-m="${ui.m}" style="width:100%;text-align:left;margin-top:10px"><span>🏷️</span><span><b>${s.open} ${s.open === 1 ? 'transactie' : 'transacties'} nog niet ingedeeld</b><br>Tik om ze een soort te geven.</span></button>`;
  const groups = M.byGroup(s);
  if (!groups.length && !s.open) h += `<div class="card"><p class="muted">Geen transacties in ${M.monthName(ui.m)}.</p></div>`;
  for (const g of groups) {
    h += sec(`${esc(g.name)} · ${M.fmt(g.c, { whole: true })}`, `<div class="grp">${g.items.map(x => {
      const a = av.avg.get(x.id);
      return `<button class="cell" data-a="list" data-cat="${esc(x.id)}" data-m="${ui.m}"><span class="ico" aria-hidden="true">${esc(x.cat.icon || '•')}</span><span class="tx"><span class="tt">${esc(x.cat.name)}</span><span class="st">${x.n}×${av.months && a ? ` · gem. ${M.fmt(a, { whole: true })}` : ''}</span></span><span class="tr">${money(x.c)}</span>${ICON_CHEV}</button>`;
    }).join('')}</div>`);
  }
  const extra = [];
  if (s.open) extra.push(`<button class="cell" data-a="list" data-cat="open" data-m="${ui.m}"><span class="ico" aria-hidden="true">🏷️</span><span class="tx"><span class="tt">Niet ingedeeld</span><span class="st">${s.open}×</span></span><span class="tr">${money(s.openC, { sign: true })}</span>${ICON_CHEV}</button>`);
  if (s.excluded) extra.push(`<button class="cell" data-a="list" data-cat="excluded" data-m="${ui.m}"><span class="ico" aria-hidden="true">🔁</span><span class="tx"><span class="tt">Telt niet mee</span><span class="st">Overboekingen tussen eigen rekeningen</span></span><span class="tr">${s.excluded}×</span>${ICON_CHEV}</button>`);
  if (extra.length) h += sec('', `<div class="grp">${extra.join('')}</div>`);
  h += sec('', `<div class="grp">
    <button class="cell" data-a="list" data-cat="" data-m=""><span class="tx"><span class="tt">Alle transacties</span></span><span class="tr">${txs.length}</span>${ICON_CHEV}</button>
    <button class="cell" data-a="go" data-v="recurring"><span class="tx"><span class="tt">Vaste lasten</span><span class="st">Wat elke maand terugkomt</span></span>${ICON_CHEV}</button>
    ${rent ? (() => { const n = openPayouts().length; return `<button class="cell" data-a="go" data-v="payouts"><span class="tx"><span class="tt">Uitbetalingen verhuur</span><span class="st">${n ? `${n} nog te koppelen aan een boeking` : 'Booking.com en Airbnb, gekoppeld aan Verhuur'}</span></span>${n ? `<span class="tr" style="color:var(--orange)">${n}</span>` : ''}${ICON_CHEV}</button>`; })() : ''}
    <button class="cell" data-a="go" data-v="rules"><span class="tx"><span class="tt">Regels en soorten</span><span class="st">Zo deelt de app vanzelf in</span></span><span class="tr">${data.rules.length}</span>${ICON_CHEV}</button>
    <button class="cell" data-a="go" data-v="accounts"><span class="tx"><span class="tt">Rekeningen</span></span><span class="tr">${data.accounts.length}</span>${ICON_CHEV}</button>
    <button class="cell tint" data-a="go" data-v="import"><span class="tx"><span class="tt">Bestand inlezen</span></span></button></div>`,
    offline ? 'Geen verbinding: je ziet de laatst opgehaalde gegevens.' : '');
  return h + '</main>';
}

function vList() {
  const f = ui.f, list = M.filter(visibleTxs(), data.cats, { ...f, acc: '' });
  const title = f.cat === 'open' ? 'Niet ingedeeld' : f.cat === 'excluded' ? 'Telt niet mee' : f.cat ? (cat(f.cat) || {}).name || 'Soort' : 'Transacties';
  let h = navBar(backTo('home', 'Overzicht'), '') + '<main>' + lt(esc(title), f.m ? M.monthName(f.m) : 'Alle maanden');
  h += accChips();
  h += `<div class="search"><input type="search" id="q" placeholder="Zoek op naam, omschrijving of bedrag" value="${esc(f.q)}" autocomplete="off" enterkeyhint="search"></div>`;
  if (f.m || f.cat) h += `<div class="chips wrap">${f.m ? `<button data-a="unfilter" data-k="m" aria-pressed="true">${M.monthName(f.m)} ✕</button>` : ''}${f.cat ? `<button data-a="unfilter" data-k="cat" aria-pressed="true">${esc(title)} ✕</button>` : ''}</div>`;
  if (!list.length) return h + `<div class="card"><p class="muted">Niets gevonden.</p></div></main>`;
  const total = list.reduce((s, t) => s + (t.excluded ? 0 : M.cents(t.amount)), 0);
  let last = '';
  h += '<div class="days">';
  for (const t of list.slice(0, ui.limit)) {
    if (t.booked_on !== last) { if (last) h += '</div>'; h += `<h2 class="sec-h wk">${M.shortDate(t.booked_on)}</h2><div class="grp">`; last = t.booked_on; }
    h += txCell(t, false);
  }
  h += '</div></div>';
  if (list.length > ui.limit) h += `<div style="margin-top:12px"><button class="btn sec" data-a="more">Meer tonen (${list.length - ui.limit})</button></div>`;
  return h + `<p class="sec-f">${list.length} ${list.length === 1 ? 'transactie' : 'transacties'} · samen ${M.fmt(total, { sign: true })}</p></main>`;
}

const catOptions = (cur, none = 'Niet ingedeeld') => `<option value="">${none}</option>` + M.GROUPS.map(([g, n]) => {
  const list = data.cats.filter(c => c.grp === g && !c.deleted);
  return list.length ? `<optgroup label="${esc(n)}">${list.map(c => `<option value="${esc(c.id)}" ${c.id === cur ? 'selected' : ''}>${esc((c.icon ? c.icon + ' ' : '') + c.name)}</option>`).join('')}</optgroup>` : '';
}).join('');

function vTx() {
  const t = data.txs.find(x => x.id === ui.id); if (!t) return vList();
  const a = acct(t.account_id), c = M.cents(t.amount), transfer = isTransfer(t);
  let h = navBar(backTo(ui.back, ui.back === 'home' ? 'Overzicht' : 'Terug'), '') + '<main>';
  h += `<div class="hero">${money(c, { sign: c > 0 })}<div class="tt">${esc(t.counterparty || 'Zonder tegenpartij')}</div><div class="muted small">${M.shortDate(t.booked_on)} · ${esc(accLabel(a))}</div></div>`;
  if (t.description) h += sec('Omschrijving', `<div class="grp"><div class="cell"><span class="tx"><span class="tt" style="white-space:pre-wrap">${esc(t.description)}</span></span></div></div>`);
  h += sec('Soort', `<div class="grp"><label class="cell field"><span class="fl">Soort</span><select id="tx-cat" data-ch="txcat" ${t.excluded ? 'disabled' : ''}>${catOptions(cat(t.category_id) ? t.category_id : '')}</select></label>
    ${cat(t.category_id) && !t.excluded ? `<button class="cell tint" data-a="newrule"><span class="tx"><span class="tt">Altijd zo indelen</span><span class="st">Maak een regel voor ${esc(M.suggestPattern(t.counterparty) || 'deze tegenpartij')}</span></span></button>` : ''}</div>`,
    t.excluded ? '' : t.category_by === 'rule' ? 'Ingedeeld door een regel. Kies je zelf een soort, dan blijft die staan.' : t.category_by === 'manual' ? 'Zelf gekozen. Regels veranderen dit niet meer.' : '');
  if (rent && c > 0) h += txRent(t);
  h += sec('', `<div class="grp"><div class="cell"><span class="tx"><span class="tt">Telt mee in de totalen</span><span class="st">${transfer ? 'Overboeking tussen eigen rekeningen' : 'Uit = bijvoorbeeld een terugbetaling of een overboeking'}</span></span><button class="toggle" role="switch" data-a="excl" aria-checked="${!t.excluded}" aria-label="Telt mee"></button></div></div>`);
  return h + '</main>';
}

// Bij een bijschrijving: aan welke boeking(en) in Verhuur hoort dit geld?
function txRent(t) {
  const links = txPayouts(t.id), plat = P.platformOf(t), isRent = (cat(t.category_id) || {}).name === 'Verhuur';
  if (links.length) return sec('Verhuur', `<div class="grp">${links.map(p => { const b = bkById(p.booking_id); return `<div class="cell"><span class="tx"><span class="tt">${bkTitle(b)}</span>${bkHouse(b) ? `<span class="st">${bkHouse(b)}</span>` : ''}</span><span class="tr">${money(M.cents(p.amount))}</span></div>`; }).join('')}
    <button class="cell tint" data-a="link"><span class="tx"><span class="tt">Koppeling wijzigen</span></span></button>
    <button class="cell" data-a="unlink"><span class="tx"><span class="tt" style="color:var(--red)">Ontkoppelen</span></span></button></div>`,
    'Beheerders van Verhuur zien bij de boeking dat dit bedrag op deze datum is uitbetaald. De rest van de rekening zien ze niet.');
  if (!plat && !isRent) return sec('', `<div class="grp"><button class="cell" data-a="link"><span class="tx"><span class="tt">Koppel aan een boeking in Verhuur</span><span class="st">Bijvoorbeeld een directe boeking die de gast overmaakte</span></span>${ICON_CHEV}</button></div>`);
  const s = suggestFor(t);
  return sec(plat ? `Uitbetaling ${P.platformName(plat)}` : 'Verhuur', `<div class="grp">${s ? `<div class="cell"><span class="tx"><span class="tt">Voorstel</span><span class="st">${s.ids.map(id => bkTitle(bkById(id))).join('<br>')}</span></span></div>
    <button class="cell tint" data-a="linksug"><span class="tx"><span class="tt">Koppel aan ${s.ids.length === 1 ? 'deze boeking' : `deze ${s.ids.length} boekingen`}</span></span></button>
    <button class="cell" data-a="link"><span class="tx"><span class="tt">Andere boeking kiezen</span></span>${ICON_CHEV}</button>`
    : `<button class="cell tint" data-a="link"><span class="tx"><span class="tt">Koppel aan een boeking</span><span class="st">Geen boeking gevonden met precies dit bedrag</span></span>${ICON_CHEV}</button>`}</div>`,
    s ? (s.by === 'ref' ? 'Het boekingsnummer staat in de omschrijving.' : s.by === 'amount' ? 'Het bedrag is precies de uitbetaling die bij de boeking staat.' : 'Deze boekingen samen zijn precies dit bedrag.') : '');
}

function vPayouts() {
  let h = navBar(backTo('home', 'Overzicht'), '') + '<main>' + lt('Uitbetalingen verhuur', 'Booking.com en Airbnb → Verhuur');
  if (!rent) return h + `<div class="card"><p class="muted">${offline ? 'Geen verbinding. Probeer het straks opnieuw.' : 'Laden…'}</p></div></main>`;
  const all = data.txs.filter(t => P.platformOf(t)), open = all.filter(t => !txPayouts(t.id).length), done = all.filter(t => txPayouts(t.id).length);
  const cell = t => {
    const links = txPayouts(t.id), s = links.length ? null : suggestFor(t), c = M.cents(t.amount);
    const st = links.length ? '→ ' + links.map(p => bkShort(bkById(p.booking_id))).join(', ') : s ? `Voorstel: ${s.ids.map(id => bkShort(bkById(id))).join(' + ')}` : 'Nog geen voorstel';
    return `<button class="cell tx" data-a="tx" data-id="${esc(t.id)}"><span class="tx"><span class="tt">${esc(P.platformName(P.platformOf(t)))} · ${M.shortDate(t.booked_on)}</span><span class="st">${esc(st)}</span></span><span class="tr">${money(c, { sign: true })}</span>${ICON_CHEV}</button>`;
  };
  h += sec(`Te koppelen${open.length ? ` · ${open.length}` : ''}`, `<div class="grp">${open.map(cell).join('') || '<div class="cell"><span class="tx muted">Alles is gekoppeld.</span></div>'}</div>`,
    'De app herkent een uitbetaling aan “Airbnb” of “Booking.com” in de naam of omschrijving. Staat er een niet bij? Open de transactie en kies <b>Koppel aan een boeking</b>.');
  const late = P.unpaid(rent.bookings, rent.payouts, TODAY());
  if (late.length) h += sec(`Nog niet uitbetaald · ${late.length}`, `<div class="grp">${late.map(b => `<div class="cell"><span class="tx"><span class="tt">${bkTitle(b)}</span><span class="st">${rent.amounts[b.id] && rent.amounts[b.id].payout != null ? `verwacht ${M.fmt(M.cents(rent.amounts[b.id].payout))}` : 'uitbetaling onbekend'}${bkHouse(b) ? ` · ${bkHouse(b)}` : ''}</span></span></div>`).join('')}</div>`,
    'Boekingen waarvan het geld er al had moeten zijn (Airbnb 5 dagen na aankomst, Booking.com 35 dagen na vertrek). Lees eerst de nieuwste transacties in; staat het er dan nog niet, kijk dan bij het platform.');
  if (done.length) h += sec('Gekoppeld', `<div class="grp">${done.slice(0, 40).map(cell).join('')}</div>`);
  return h + '</main>';
}

function vLink() {
  const t = data.txs.find(x => x.id === ui.id); if (!t || !rent) return vTx();
  const txC = M.cents(t.amount), cands = P.candidates(t, rent.bookings, rent.amounts, rent.payouts, ui.linkAll), sel = ui.sel;
  for (const id of sel) if (!cands.some(c => c.booking.id === id)) { const b = bkById(id); if (b) cands.unshift(...P.candidates(t, [b], rent.amounts, rent.payouts, true)); }
  let h = navBar(`<button class="nb" data-a="go" data-v="tx">Annuleer</button>`, 'Koppelen', `<button class="nb" data-a="savelink" style="font-weight:600">Bewaar</button>`) + '<main>';
  h += lt('Bij welke boeking?', `${M.fmt(txC)} · ${esc(t.counterparty || '')} · ${M.shortDate(t.booked_on)}`);
  h += sec('', `<div class="grp">${cands.map(c => { const on = sel.includes(c.booking.id); return `<button class="cell pick" data-a="pick" data-id="${esc(c.booking.id)}" aria-pressed="${on}"><span class="chk" aria-hidden="true">${on ? '✓' : ''}</span><span class="tx"><span class="tt">${bkTitle(c.booking)}</span>
    <span class="st">${c.expectedC !== null ? `verwacht ${M.fmt(c.expectedC)}` : 'uitbetaling onbekend'}${c.paidC ? ` · al ${M.fmt(c.paidC)} binnen` : ''}${bkHouse(c.booking) ? ` · ${bkHouse(c.booking)}` : ''}</span></span></button>`; }).join('')
    || `<div class="cell"><span class="tx muted">Geen boekingen rond ${M.shortDate(t.booked_on)}.</span></div>`}</div>`);
  h += `<div style="margin-top:8px"><button class="btn plain" data-a="linkall">${ui.linkAll ? 'Alleen boekingen rond deze datum' : 'Toon alle boekingen'}</button></div>`;
  if (sel.length) {
    const exp = sel.map(id => { const c = cands.find(x => x.booking.id === id); return c ? (c.leftC !== null && c.leftC > 0 ? c.leftC : c.expectedC) : null; });
    const parts = P.allocate(txC, exp), sum = exp.every(e => e !== null) ? exp.reduce((s, e) => s + e, 0) : null;
    h += `<div class="card"><div class="sum">${sel.map((id, i) => `<span>${esc(bkShort(bkById(id)))}</span><span>${M.fmt(parts[i])}</span>`).join('')}<span class="tot">Samen</span><span class="tot">${M.fmt(txC)}</span></div>
      ${sum !== null && sel.length > 1 && Math.abs(sum - txC) > sel.length ? `<p class="small muted" style="margin-top:8px">Verwacht samen ${M.fmt(sum)}, binnengekomen ${M.fmt(txC)}. De app verdeelt het verschil naar verhouding.</p>` : ''}
      ${sel.length === 1 && exp[0] !== null && Math.abs(exp[0] - txC) > 1 ? `<p class="small muted" style="margin-top:8px">${M.fmt(Math.abs(txC - exp[0]))} ${txC < exp[0] ? 'minder' : 'meer'} dan verwacht.</p>` : ''}</div>`;
  }
  return h + '</main>';
}

// Koppeling bewaren: wat er bij deze transactie stond, wordt vervangen.
async function saveLink(ids, by) {
  need();
  const t = data.txs.find(x => x.id === ui.id), txC = M.cents(t.amount);
  const cands = P.candidates(t, rent.bookings, rent.amounts, rent.payouts, true);
  const exp = ids.map(id => { const c = cands.find(x => x.booking.id === id); return c ? (c.leftC !== null && c.leftC > 0 ? c.leftC : c.expectedC) : null; });
  const parts = P.allocate(txC, exp);
  if (parts.some(x => x < 1)) throw new Error('Dit bedrag is te klein om te verdelen.');
  await api(`/rest/v1/rental_booking_payouts?transaction_id=eq.${t.id}`, { method: 'DELETE' });
  rent.payouts = rent.payouts.filter(p => p.transaction_id !== t.id);
  if (!ids.length) return;
  const out = await post('rental_booking_payouts', ids.map((id, i) => ({ team_id: FAMILY, booking_id: id, transaction_id: t.id, amount: parts[i] / 100, paid_on: t.booked_on, matched_by: by })));
  rent.payouts.push(...(out || []));
  // één boeking zonder bekende uitbetaling: vul hem in Verhuur in
  if (ids.length === 1) {
    const a = rent.amounts[ids[0]];
    if (!a || a.payout === null || a.payout === undefined) {
      const body = { payout: parts[0] / 100 };
      const [row] = a ? await patch(`rental_booking_amounts?booking_id=eq.${ids[0]}&select=booking_id,payout,guest_name`, body)
        : await post('rental_booking_amounts?select=booking_id,payout,guest_name', { booking_id: ids[0], team_id: FAMILY, ...body });
      if (row) rent.amounts[ids[0]] = row;
    }
  }
  // nog niet ingedeeld: soort Verhuur
  const vc = data.cats.find(c => c.grp === 'income' && c.name === 'Verhuur');
  if (vc && !t.excluded && !cat(t.category_id)) setLocalTx(await patch(`finance_transactions?id=eq.${t.id}&select=${TX_FIELDS}`, { category_id: vc.id, category_by: 'manual' }));
}

function vRules() {
  let h = navBar(backTo('home', 'Overzicht'), '', '<button class="nb" data-a="ruleadd" aria-label="Nieuwe regel" style="font-size:1.6rem;font-weight:300">+</button>') + '<main>' + lt('Regels', 'Zo deelt de app vanzelf in');
  const rules = M.sortRules(data.rules);
  h += sec('', `<div class="grp">${rules.map(r => `<button class="cell" data-a="rule" data-id="${esc(r.id)}"><span class="tx"><span class="tt">${r.field === 'description' ? 'Omschrijving' : 'Naam'} bevat “${esc(r.pattern)}”</span><span class="st">${r.direction === 'in' ? 'bij · ' : r.direction === 'out' ? 'af · ' : ''}→ ${catLabel(r.category_id) || '?'}</span></span>${ICON_CHEV}</button>`).join('')
    || '<div class="cell"><span class="tx muted">Nog geen regels. Tip: open een transactie, kies een soort en tik op <b>Altijd zo indelen</b>.</span></div>'}
    <button class="cell tint" data-a="ruleadd"><span class="tx"><span class="tt">Nieuwe regel</span></span></button></div>`,
    'Regels gelden voor het hele gezin. Een soort die je zelf kiest bij een transactie, blijft altijd staan.');
  h += sec('Soorten', `<div class="grp"><button class="cell" data-a="go" data-v="cats"><span class="tx"><span class="tt">Soorten beheren</span><span class="st">${data.cats.length} soorten in ${M.GROUPS.length} groepen</span></span>${ICON_CHEV}</button></div>`);
  return h + '</main>';
}

function vRule() {
  const d = ui.draft, test = { ...d, pattern: d.pattern || '' };
  const hits = test.pattern.trim().length >= 2 ? data.txs.filter(t => M.ruleMatches(test, t)) : [];
  const after = M.ruleChanges([...data.rules.filter(r => r.id !== d.id), { ...test, id: d.id || '~new' }], data.txs).length;
  let h = navBar(`<button class="nb" data-a="go" data-v="${ui.ruleBack}">${d.id ? ICON_BACK + '<span>Terug</span>' : 'Annuleer'}</button>`, d.id ? 'Regel' : 'Nieuwe regel', `<button class="nb" data-a="saverule" style="font-weight:600">Bewaar</button>`) + '<main>';
  h += sec('Als', `<div class="grp"><div class="cell stack">${seg([['counterparty', 'Naam'], ['description', 'Omschrijving']], d.field, 'rulefield')}</div>
    <label class="cell field"><span class="fl">bevat</span><input type="text" id="r-pattern" value="${esc(d.pattern)}" maxlength="80" placeholder="bijv. Albert Heijn" autocapitalize="off" autocorrect="off" spellcheck="false"></label>
    <div class="cell stack">${seg([['', 'Bij en af'], ['out', 'Alleen af'], ['in', 'Alleen bij']], d.direction, 'ruledir')}</div></div>`,
    'Hoofdletters en spaties maken niet uit. Kort is ruim: “ah” past ook op “Bahnhof”.');
  h += sec('Dan', `<div class="grp"><label class="cell field"><span class="fl">Soort</span><select id="r-cat">${catOptions(d.category_id, 'Kies een soort')}</select></label></div>`,
    hits.length ? `Past op ${hits.length} ${hits.length === 1 ? 'transactie' : 'transacties'}${after ? `; bij bewaren veranderen er ${after} van soort` : ''}.` : d.pattern.trim().length >= 2 ? 'Past nu op geen enkele transactie.' : '');
  if (hits.length) h += sec('Voorbeelden', `<div class="grp">${hits.slice(0, 5).map(t => txCell(t, true, false)).join('')}</div>`);
  if (d.id) h += `<div style="margin-top:18px"><button class="btn danger" data-a="delrule">Regel verwijderen</button></div>`;
  return h + '</main>';
}
function readRule() { const d = ui.draft; if (!d) return; const p = $('#r-pattern'), c = $('#r-cat'); if (p) d.pattern = p.value; if (c) d.category_id = c.value; }

function vCats() {
  const d = ui.draft;
  let h = navBar(backTo('rules', 'Regels'), 'Soorten') + '<main>';
  for (const [g, n] of M.GROUPS) {
    const list = data.cats.filter(c => c.grp === g);
    h += sec(esc(n), `<div class="grp">${list.map(c => d && d.id === c.id ? catForm(d) : `<button class="cell" data-a="editcat" data-id="${esc(c.id)}"><span class="ico" aria-hidden="true">${esc(c.icon || '•')}</span><span class="tx"><span class="tt">${esc(c.name)}</span></span>${ICON_CHEV}</button>`).join('')}
      ${d && !d.id && d.grp === g ? catForm(d) : `<button class="cell tint" data-a="addcat" data-g="${g}"><span class="tx"><span class="tt">Soort toevoegen</span></span></button>`}</div>`);
  }
  return h + '</main>';
}
const catForm = d => `<div class="cell stack"><div class="row"><input type="text" id="c-icon" value="${esc(d.icon)}" maxlength="4" aria-label="Icoon" style="flex:0 0 3rem;text-align:center"><input type="text" id="c-name" value="${esc(d.name)}" maxlength="40" placeholder="Naam" aria-label="Naam"></div>
  <select id="c-grp" class="sel" aria-label="Groep" style="text-align:left;max-width:100%">${M.GROUPS.map(([g, n]) => `<option value="${g}" ${g === d.grp ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
  <div class="row"><button class="btn sec" data-a="cancelcat">Annuleer</button><button class="btn" data-a="savecat">Bewaar</button></div>
  ${d.id ? '<button class="btn danger" data-a="delcat">Soort verwijderen</button>' : ''}</div>`;
function readCat() { const d = ui.draft; if (!d) return; const i = $('#c-icon'), n = $('#c-name'), g = $('#c-grp'); if (i) d.icon = i.value; if (n) d.name = n.value; if (g) d.grp = g.value; }

function vAccounts() {
  let h = navBar(backTo('home', 'Overzicht'), '', '<button class="nb" data-a="go" data-v="import" aria-label="Bestand inlezen" style="font-size:1.6rem;font-weight:300">+</button>') + '<main>' + lt('Rekeningen');
  h += sec('', `<div class="grp">${data.accounts.map(a => {
    const n = data.txs.filter(t => t.account_id === a.id).length;
    const who = mine(a) ? (a.shared ? 'gedeeld met de beheerders' : 'alleen jij') : `van ${esc(memberName(a.user_id))}, gedeeld`;
    return `<button class="cell" data-a="account" data-id="${esc(a.id)}"><span class="ico" aria-hidden="true">${a.kind === 'savings' ? '🐷' : '💳'}</span><span class="tx"><span class="tt">${esc(accLabel(a))}</span><span class="st">${who} · ${n} transacties</span></span>${a.balance != null ? `<span class="tr">${money(M.cents(a.balance), { whole: true })}</span>` : ''}${ICON_CHEV}</button>`;
  }).join('') || '<div class="cell"><span class="tx muted">Nog geen rekeningen.</span></div>'}
  <button class="cell tint" data-a="go" data-v="import"><span class="tx"><span class="tt">Bestand inlezen</span><span class="st">Een nieuwe rekening komt er vanzelf bij</span></span></button></div>`,
    'Het rekeningnummer zelf bewaart de app niet, alleen de laatste 4 tekens. <a href="../?article=financien-privacy">Wie ziet wat?</a>');
  h += bankSection();
  return h + '</main>';
}

// Bankkoppeling: alleen je eigen koppeling staat hier (de server en de database laten niets anders zien).
function bankSection() {
  if (bankAvail === null && navigator.onLine) { bankAvail = false; api('/functions/v1/integrations', { method: 'POST', body: { mode: 'bank_info', team: FAMILY } }).then(r => { bankAvail = !!(r && r.available); if (bankAvail && ['accounts', 'home'].includes(ui.view)) render(); }).catch(e => { bankAvail = e && e.status ? false : null; }); }
  if (!data.banks.length && !bankAvail) return '';
  const cells = data.banks.map(b => {
    const d = daysLeft(b), until = b.config && b.config.valid_until ? M.shortDate(b.config.valid_until.slice(0, 10)) : '';
    const st = b.status === 'error' ? `<span class="st" style="color:var(--red)">${esc(b.last_error)}</span>` : `<span class="st">${until ? `toestemming tot ${until}` : 'nog niet afgemaakt'}${b.last_sync_at ? ` · bijgewerkt ${M.shortDate(b.last_sync_at.slice(0, 10))}` : ''}${b.config && b.config.accounts ? ` · ${b.config.accounts} ${b.config.accounts === 1 ? 'rekening' : 'rekeningen'}` : ''}</span>`;
    return `<div class="cell"><span class="ico" aria-hidden="true">🏦</span><span class="tx"><span class="tt">${esc(b.label)}</span>${st}</span></div>
      ${b.config && b.config.valid_until && (d === null || d >= 0) ? `<button class="cell" data-a="banksync" data-id="${esc(b.id)}"><span class="tx"><span class="tt">Nu bijwerken</span></span></button>` : ''}
      <button class="cell${bankNeedsCare(b) ? ' tint' : ''}" data-a="bankstart" data-id="${esc(b.id)}"><span class="tx"><span class="tt">${b.config && b.config.valid_until ? 'Toestemming vernieuwen' : 'Koppelen afmaken'}</span><span class="st">Inloggen bij de bank, weer voor 180 dagen</span></span></button>
      <button class="cell" data-a="bankunlink" data-id="${esc(b.id)}"><span class="tx"><span class="tt" style="color:var(--red)">Ontkoppelen</span></span></button>`;
  }).join('');
  return sec('Bankkoppeling', `<div class="grp">${cells || `<button class="cell tint" data-a="bankstart"><span class="ico" aria-hidden="true">🏦</span><span class="tx"><span class="tt">Rabobank-rekening koppelen</span><span class="st">Nieuwe transacties komen dan elke dag vanzelf binnen</span></span></button>`}</div>`,
    'Je logt in bij Rabobank en kiest welke rekeningen. De toestemming geldt 180 dagen; daarna vraagt de app je om te vernieuwen. Alleen jij ziet je koppeling. <a href="../?article=financien-bank">Hoe werkt het?</a>');
}
async function bankStart(id) {
  need();
  const r = await api('/functions/v1/integrations', { method: 'POST', body: { mode: 'bank_start', team: FAMILY, redirect: location.origin + location.pathname.replace(/index\.html$/, ''), ...(id ? { id } : {}) } });
  if (!r || !r.url) throw new Error('De bank gaf geen link terug. Probeer het later opnieuw.');
  location.href = r.url;
}
async function bankFinish() {
  ui.bankDone = { busy: true }; render();
  if (bankReturn.error) { ui.bankDone = { error: bankReturn.error === 'access_denied' ? 'Je hebt bij de bank geen toestemming gegeven. Er is niets gekoppeld.' : 'Het koppelen bij de bank is afgebroken. Probeer het opnieuw.' }; render(); return; }
  try {
    const res = await fetch(`${CFG.supabaseUrl}/functions/v1/integrations`, { method: 'POST', headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'bank_finish', code: bankReturn.code, state: bankReturn.state }) });
    const d = await res.json().catch(() => ({}));
    ui.bankDone = res.ok ? d : { error: d.error || 'Het koppelen lukte niet. Probeer het opnieuw.' };
  } catch (e) { ui.bankDone = { error: 'Geen verbinding. Probeer het koppelen opnieuw.' }; }
  render();
  if (me && FAMILY && !ui.bankDone.error) load();
}
function vBankDone() {
  const d = ui.bankDone || { busy: true };
  let h = navBar(me && FAMILY ? backTo('accounts', 'Rekeningen') : '', '') + '<main>';
  if (d.busy) return h + lt('Bezig met koppelen…') + '<div class="card"><p class="muted">Even geduld: de app haalt je rekeningen en de transacties van de afgelopen 90 dagen op.</p></div></main>';
  if (d.error) return h + lt('Niet gekoppeld') + `<div class="card"><p>${esc(d.error)}</p></div>${me && FAMILY ? '<div style="margin-top:12px"><button class="btn" data-a="go" data-v="accounts">Naar Rekeningen</button></div>' : ''}</main>`;
  h += lt('Gekoppeld');
  h += sec('', `<div class="grp">${(d.linked || []).map(n => `<div class="cell"><span class="ico" aria-hidden="true">✓</span><span class="tx"><span class="tt">${esc(n)}</span></span></div>`).join('')}</div>`,
    `${d.sync && d.sync.ok ? `${d.sync.added} ${d.sync.added === 1 ? 'transactie' : 'transacties'} opgehaald${d.sync.skipped ? `; ${d.sync.skipped} stonden er al (uit een export)` : ''}.` : d.sync && d.sync.error ? esc(d.sync.error) : ''}
     ${(d.skipped || []).length ? ` ${d.skipped.join(', ')} ${d.skipped.length === 1 ? 'is' : 'zijn'} al toegevoegd door iemand anders in het gezin en ${d.skipped.length === 1 ? 'is' : 'zijn'} overgeslagen.` : ''}`);
  h += me && FAMILY ? '<div style="margin-top:12px"><button class="btn" data-a="go" data-v="home">Naar het overzicht</button></div>'
    : '<div class="card"><p class="muted">Ga terug naar de app Thuis op je telefoon. Daar staan de transacties nu ook.</p></div>';
  return h + '</main>';
}

function vAccount() {
  const a = acct(ui.id); if (!a) return vAccounts();
  const d = ui.draft, own = mine(a), n = data.txs.filter(t => t.account_id === a.id), p = period(n);
  const admins = (data.members || []).filter(m => m.role === 'admin' && m.user_id !== a.user_id).map(m => esc(m.name || 'beheerder'));
  let h = navBar(backTo('accounts', 'Rekeningen'), '', own ? '<button class="nb" data-a="saveaccount" style="font-weight:600">Bewaar</button>' : '') + '<main>' + lt(esc(accLabel(a)), a.balance != null ? `Saldo ${M.fmt(M.cents(a.balance))} op ${M.shortDate(a.balance_on)}` : '');
  if (!own) h += `<div class="card"><p class="muted">Deze rekening is van ${esc(memberName(a.user_id))}, die hem deelt met de beheerders van het gezin. Jij kunt transacties inlezen en indelen; naam en delen regelt ${esc(memberName(a.user_id))}.</p></div>`;
  h += sec('', `<div class="grp"><label class="cell field"><span class="fl">Naam</span><input type="text" id="a-name" value="${esc(d.name)}" maxlength="40" ${own ? '' : 'disabled'}></label>
    <div class="cell stack">${seg([['current', 'Betaalrekening'], ['savings', 'Spaarrekening']], d.kind, 'acckind', own ? '' : 'disabled')}</div></div>`);
  h += sec('Wie ziet deze rekening', `<div class="grp"><div class="cell"><span class="tx"><span class="tt">Delen met de beheerders</span><span class="st">${d.shared ? (admins.length ? 'Zichtbaar voor ' + admins.join(', ') : 'Er is nog geen andere beheerder') : 'Alleen jij ziet deze rekening'}</span></span><button class="toggle" role="switch" data-a="accshare" aria-checked="${!!d.shared}" aria-label="Delen met de beheerders" ${own ? '' : 'disabled'}></button></div></div>`,
    'Leden en kinderen zien nooit de rekening van een ander. Wie meekijkt, ziet alle transacties van deze rekening.');
  if (a.integration_id) h += `<div class="banner blue mb"><span>🏦</span><span>Deze rekening komt elke dag vanzelf binnen via de bankkoppeling.</span></div>`;
  h += sec('', `<div class="grp"><div class="cell"><span class="tx"><span class="tt">${p.count} transacties</span><span class="st">${p.count ? `${M.shortDate(p.from)} – ${M.shortDate(p.to)}` : 'Nog niets ingelezen'}${a.imported_at ? ` · laatst ingelezen ${M.shortDate(a.imported_at.slice(0, 10))}` : ''}</span></span></div>
    <button class="cell tint" data-a="go" data-v="import"><span class="tx"><span class="tt">Nieuwe transacties inlezen</span></span></button></div>`);
  if (own) h += `<div style="margin-top:18px"><button class="btn danger" data-a="delaccount">Rekening verwijderen</button></div><p class="sec-f">Verwijderen wist ook alle transacties van deze rekening. Dat kan niet ongedaan worden.</p>`;
  return h + '</main>';
}

function vRecurring() {
  const list = M.recurring(visibleTxs(), TODAY()), total = list.reduce((s, x) => s + x.c, 0);
  let h = navBar(backTo('home', 'Overzicht'), '') + '<main>' + lt('Vaste lasten', list.length ? `Samen ongeveer ${M.fmt(total, { whole: true })} per maand` : '');
  h += accChips();
  h += sec('', `<div class="grp">${list.map(x => `<button class="cell" data-a="find" data-q="${esc(x.name)}"><span class="ico" aria-hidden="true">${esc((cat(x.category_id) || {}).icon || '🔁')}</span><span class="tx"><span class="tt">${esc(x.name)}</span><span class="st">rond de ${x.day}e · volgende ${M.shortDate(x.next)}</span></span><span class="tr">${money(x.c)}</span>${ICON_CHEV}</button>`).join('')
    || '<div class="cell"><span class="tx muted">Nog niets gevonden. Vaste lasten herkent de app als ze minstens drie maanden terugkomen.</span></div>'}</div>`,
    'Afschrijvingen aan dezelfde partij in minstens 3 van de laatste 6 maanden, met ongeveer hetzelfde bedrag.');
  return h + '</main>';
}

function vImport() {
  const imp = ui.imp;
  let h = navBar(backTo('home', 'Overzicht'), 'Inlezen') + '<main>';
  if (imp && imp.done) {
    h += lt('Klaar');
    h += sec('', `<div class="grp">${imp.done.map(r => `<div class="cell"><span class="tx"><span class="tt">${esc(r.name)}</span><span class="st">${r.added} nieuw${r.existed ? ` · ${r.existed} stonden er al` : ''}${r.ruled ? ` · ${r.ruled} vanzelf ingedeeld` : ''}</span></span></div>`).join('')}</div>`);
    return h + `<div style="margin-top:18px"><button class="btn" data-a="go" data-v="home">Naar het overzicht</button></div></main>`;
  }
  if (!imp) {
    h += lt('Bestand inlezen', 'Rabobank CSV of CAMT.053');
    h += `<label class="btn big filebtn">Kies een bestand<input type="file" id="file" accept=".csv,.txt,.xml,text/csv,text/xml,application/xml"></label>`;
    h += sec('Zo download je het', `<div class="article"><ol><li>Log in bij <b>Rabo Online Bankieren</b>, het liefst op de computer.</li><li>Zoek in het menu <b>Downloaden transacties</b>.</li><li>Kies de rekening(en), de periode (bijv. vanaf 1 januari) en het formaat <b>CSV</b>.</li><li>Kies het bestand hier.</li></ol><p class="small muted">Hetzelfde bestand twee keer inlezen kan geen kwaad: wat er al staat, slaat de app over.</p></div>`,
      '<a href="../?article=financien-inlezen">Meer uitleg, ook voor andere banken</a>');
    return h + '</main>';
  }
  h += lt('Controleer', `${esc(imp.file)} · ${esc(imp.format)}`);
  for (const [i, a] of imp.accounts.entries()) {
    const p = period(a.rows);
    h += sec(`Rekening ••${esc(a.last4)}`, `<div class="grp">
      <div class="cell"><span class="tx"><span class="tt">${p.count} transacties</span><span class="st">${M.shortDate(p.from)} – ${M.shortDate(p.to)}</span></span></div>
      ${a.existing ? `<div class="cell"><span class="tx"><span class="tt">${esc(a.existing.name)}</span><span class="st">Bestaande rekening${mine(a.existing) ? '' : ` van ${esc(memberName(a.existing.user_id))}`}</span></span></div>`
        : a.blocked ? `<div class="cell"><span class="tx"><span class="tt late">Al toegevoegd door iemand anders</span><span class="st">Vraag diegene om de rekening met je te delen. Deze rekening wordt overgeslagen.</span></span></div>`
        : `<label class="cell field"><span class="fl">Naam</span><input type="text" data-i="${i}" class="imp-name" value="${esc(a.name)}" maxlength="40" placeholder="bijv. Gezamenlijk"></label>
           <div class="cell stack">${seg([['current', 'Betaalrekening'], ['savings', 'Spaarrekening']], a.kind, 'impkind', `data-i="${i}"`)}</div>`}</div>`,
      a.existing || a.blocked ? '' : 'Nieuwe rekening: alleen jij ziet hem. Delen kan daarna bij Rekeningen.');
  }
  if (imp.skipped) h += `<p class="sec-f">${imp.skipped} ${imp.skipped === 1 ? 'regel' : 'regels'} niet herkend en overgeslagen.</p>`;
  h += `<div style="margin-top:18px"><button class="btn big" data-a="doimport" ${imp.accounts.every(a => a.blocked) ? 'disabled' : ''}>Inlezen</button></div>
    <div style="margin-top:8px"><button class="btn plain" data-a="impcancel">Ander bestand kiezen</button></div>`;
  return h + '</main>';
}
function readImp() { for (const el of document.querySelectorAll('.imp-name')) ui.imp.accounts[+el.dataset.i].name = el.value; }

async function pickFile(file) {
  if (!file) return;
  if (file.size > 15e6) throw new Error('Dit bestand is te groot. Kies een kortere periode.');
  const parsed = parseFile(await file.arrayBuffer());
  const accounts = [];
  for (const a of parsed.accounts) {
    const hash = await ibanHash(FAMILY, a.iban), existing = data.accounts.find(x => x.iban_hash === hash) || null;
    accounts.push({ ...a, hash, last4: a.iban.slice(-4), existing, kind: /spaar|sav/i.test(file.name) ? 'savings' : 'current', name: existing ? existing.name : `Rekening ${a.iban.slice(-4)}` });
  }
  ui.imp = { file: file.name, format: parsed.format, skipped: parsed.skipped, accounts };
  render(); window.scrollTo(0, 0);
}

async function doImport() {
  need();
  const imp = ui.imp, done = [], created = [];
  const own = new Set(data.accounts.map(a => a.iban_hash).concat(imp.accounts.map(a => a.hash)));
  const cph = new Map();
  for (const a of imp.accounts) {
    if (a.blocked) continue;
    let acc = a.existing;
    if (!acc) {
      if (!a.name.trim()) throw new Error('Geef elke nieuwe rekening een naam.');
      try {
        [acc] = await post('finance_accounts', { team_id: FAMILY, name: a.name.trim().slice(0, 40), kind: a.kind, iban_last4: a.last4.replace(/[^A-Z0-9]/g, ''), iban_hash: a.hash, currency: a.currency || 'EUR' });
      } catch (e) {
        if (e.status === 409) { a.blocked = true; render(); throw new Error(`Rekening ••${a.last4} heeft iemand anders in het gezin al toegevoegd. Vraag diegene om hem te delen.`); }
        throw e;
      }
      data.accounts.push(acc); a.existing = acc; created.push(acc.iban_hash);
    }
    const rows = [];
    for (const r of a.rows) {
      if (r.counterparty_iban && !cph.has(r.counterparty_iban)) cph.set(r.counterparty_iban, await ibanHash(FAMILY, r.counterparty_iban));
      const h = r.counterparty_iban ? cph.get(r.counterparty_iban) : '', excluded = !!h && own.has(h);
      const c = excluded ? null : M.categorize(data.rules, r);
      rows.push({ team_id: FAMILY, account_id: acc.id, ext_id: r.ext_id, booked_on: r.booked_on, amount: r.amount, currency: r.currency || 'EUR', counterparty: r.counterparty,
        counterparty_hash: h, description: r.description, code: r.code, balance_after: r.balance_after, category_id: c, category_by: c ? 'rule' : '', excluded });
    }
    // al binnen via de bankkoppeling (zelfde datum en bedrag)? Dan niet nog een keer.
    const fresh = dropKnown(rows, data.txs.filter(t => t.account_id === acc.id));
    let added = 0, ruled = 0;
    for (let i = 0; i < fresh.length; i += 400) {
      const out = await post('finance_transactions?on_conflict=account_id,ext_id&select=id,category_id', fresh.slice(i, i + 400), 'resolution=ignore-duplicates,return=representation');
      added += (out || []).length; ruled += (out || []).filter(x => x.category_id).length;
    }
    const body = { imported_at: new Date().toISOString() };
    if (a.balance != null && (!acc.balance_on || a.balanceOn >= acc.balance_on)) Object.assign(body, { balance: a.balance, balance_on: a.balanceOn });
    await patch(`finance_accounts?id=eq.${acc.id}`, body).catch(() => {});
    done.push({ name: accLabel(acc), added, existed: rows.length - added, ruled });
  }
  // nieuwe eigen rekening: eerdere overboekingen naar die rekening tellen voortaan niet mee
  if (created.length) await api(`/rest/v1/finance_transactions?team_id=eq.${FAMILY}&counterparty_hash=in.(${created.join(',')})&excluded=is.false&category_by=neq.manual`, { method: 'PATCH', body: { excluded: true } });
  ui.imp = { ...imp, done };
  await load();
  render();
}

const VIEWS = { bankdone: vBankDone, home: vHome, list: vList, tx: vTx, rules: vRules, rule: vRule, cats: vCats, accounts: vAccounts, account: vAccount, recurring: vRecurring, import: vImport, payouts: vPayouts, link: vLink };
function render() {
  const g = ui.view === 'bankdone' ? '' : gate(), a = $('#app');
  a.innerHTML = g ? navBar(hubLink()) + '<main>' + lt('Financiën') + `<div class="card"><p>${g}</p></div></main>` : (VIEWS[ui.view] || vHome)();
  onScroll();
}
function go(view, extra) { Object.assign(ui, { view }, extra || {}); render(); window.scrollTo(0, 0); }
function onScroll() { const n = document.getElementById('nav'); if (n) n.classList.toggle('scrolled', window.scrollY > 4); }
addEventListener('scroll', onScroll, { passive: true });

async function saveRule() {
  need();
  const d = ui.draft, pattern = d.pattern.trim();
  if (pattern.length < 2) throw new Error('Vul minstens 2 tekens in.');
  if (!cat(d.category_id)) throw new Error('Kies een soort.');
  const body = { field: d.field, pattern, direction: d.direction, category_id: d.category_id };
  const [row] = d.id ? await patch(`finance_rules?id=eq.${d.id}`, body) : await post('finance_rules', { ...body, team_id: FAMILY });
  const i = data.rules.findIndex(r => r.id === row.id); if (i >= 0) data.rules[i] = row; else data.rules.push(row);
  const n = await applyRules();
  return n;
}

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a, v = ui.view;
  if (v === 'rule') readRule(); else if (v === 'cats') readCat(); else if (v === 'import' && ui.imp && !ui.imp.done) readImp();
  else if (v === 'account' && ui.draft) { const n = $('#a-name'); if (n) ui.draft.name = n.value; }
  switch (a) {
    case 'go': go(el.dataset.v, { draft: null, imp: el.dataset.v === 'import' ? null : ui.imp }); break;
    case 'acc': ui.acc = el.dataset.id; storage.set(APP, `${FAMILY}:acc`, ui.acc); render(); break;
    case 'month': ui.m = M.addMonths(ui.m, +el.dataset.d); ui.touched = true; render(); break;
    case 'thismonth': ui.m = M.month(TODAY()); ui.touched = true; render(); break;
    case 'list': go('list', { f: { m: el.dataset.m, cat: el.dataset.cat, q: '' }, limit: 150 }); break;
    case 'find': go('list', { f: { m: '', cat: '', q: el.dataset.q }, limit: 150 }); break;
    case 'unfilter': ui.f[el.dataset.k] = ''; render(); break;
    case 'more': ui.limit += 300; render(); break;
    case 'tx': go('tx', { id: el.dataset.id, back: v === 'tx' ? ui.back : v }); break;
    case 'excl': run(el, async () => {
      need(); const t = data.txs.find(x => x.id === ui.id);
      const [row] = await patch(`finance_transactions?id=eq.${t.id}&select=${TX_FIELDS}`, { excluded: !t.excluded });
      setLocalTx([row]); render();
    }); break;
    case 'newrule': {
      const t = data.txs.find(x => x.id === ui.id);
      go('rule', { ruleBack: 'tx', draft: { id: null, field: 'counterparty', pattern: M.suggestPattern(t.counterparty), direction: M.cents(t.amount) < 0 ? 'out' : 'in', category_id: t.category_id } });
      break;
    }
    case 'ruleadd': go('rule', { ruleBack: 'rules', draft: { id: null, field: 'counterparty', pattern: '', direction: '', category_id: '' } }); break;
    case 'rule': { const r = data.rules.find(x => x.id === el.dataset.id); go('rule', { ruleBack: 'rules', draft: { ...r } }); break; }
    case 'rulefield': ui.draft.field = el.dataset.v; render(); break;
    case 'ruledir': ui.draft.direction = el.dataset.v; render(); break;
    case 'saverule': run(el, async () => { const back = ui.ruleBack; const n = await saveRule(); go(back, { draft: null }); toast(n ? `Bewaard. ${n} ${n === 1 ? 'transactie' : 'transacties'} anders ingedeeld.` : 'Bewaard.'); }); break;
    case 'delrule': if (confirm('Deze regel verwijderen? Wat hij indeelde, wordt weer "niet ingedeeld" (tenzij een andere regel past).')) run(el, async () => {
      need(); await api(`/rest/v1/finance_rules?id=eq.${ui.draft.id}`, { method: 'DELETE' });
      data.rules = data.rules.filter(r => r.id !== ui.draft.id); await applyRules(); go('rules', { draft: null }); toast('Verwijderd.');
    }); break;
    case 'addcat': ui.draft = { id: null, name: '', icon: '', grp: el.dataset.g }; render(); { const n = $('#c-name'); if (n) n.focus(); } break;
    case 'editcat': { const c = cat(el.dataset.id); ui.draft = { id: c.id, name: c.name, icon: c.icon, grp: c.grp }; render(); break; }
    case 'cancelcat': ui.draft = null; render(); break;
    case 'savecat': run(el, async () => {
      need(); const d = ui.draft, name = d.name.trim();
      if (!name) throw new Error('Vul een naam in.');
      const body = { name: name.slice(0, 40), icon: d.icon.trim().slice(0, 4), grp: d.grp };
      const [row] = d.id ? await patch(`finance_categories?id=eq.${d.id}`, body) : await post('finance_categories', { ...body, team_id: FAMILY, sort: 100 + data.cats.length });
      const i = data.cats.findIndex(c => c.id === row.id); if (i >= 0) data.cats[i] = row; else data.cats.push(row);
      persist(); ui.draft = null; render();
    }); break;
    case 'delcat': {
      const d = ui.draft, n = data.txs.filter(t => t.category_id === d.id).length, r = data.rules.filter(x => x.category_id === d.id).length;
      if (confirm(`"${d.name}" verwijderen?${n ? ` ${n} ${n === 1 ? 'transactie wordt' : 'transacties worden'} weer "niet ingedeeld".` : ''}${r ? ` ${r} ${r === 1 ? 'regel gaat' : 'regels gaan'} ook weg.` : ''}`)) run(el, async () => {
        need();
        await api(`/rest/v1/finance_rules?category_id=eq.${d.id}`, { method: 'DELETE' });
        await patch(`finance_categories?id=eq.${d.id}`, { deleted: true });
        await patchTxs(data.txs.filter(t => t.category_id === d.id).map(t => t.id), { category_id: null });
        data.rules = data.rules.filter(x => x.category_id !== d.id); data.cats = data.cats.filter(c => c.id !== d.id);
        await applyRules(); persist(); ui.draft = null; render(); toast('Verwijderd.');
      });
      break;
    }
    case 'account': { const x = acct(el.dataset.id); go('account', { id: x.id, draft: { name: x.name, kind: x.kind, shared: x.shared } }); break; }
    case 'acckind': ui.draft.kind = el.dataset.v; render(); break;
    case 'accshare': ui.draft.shared = !ui.draft.shared; render(); break;
    case 'saveaccount': run(el, async () => {
      need(); const d = ui.draft;
      if (!d.name.trim()) throw new Error('Vul een naam in.');
      const [row] = await patch(`finance_accounts?id=eq.${ui.id}`, { name: d.name.trim().slice(0, 40), kind: d.kind, shared: d.shared });
      Object.assign(acct(ui.id), row); persist(); go('accounts', { draft: null }); toast('Bewaard.');
    }); break;
    case 'delaccount': {
      const x = acct(ui.id), n = data.txs.filter(t => t.account_id === x.id).length;
      if (confirm(`${accLabel(x)} en alle ${n} transacties verwijderen? Dit kan niet ongedaan worden.`)) run(el, async () => {
        need(); await api(`/rest/v1/finance_accounts?id=eq.${x.id}`, { method: 'DELETE' });
        data.accounts = data.accounts.filter(y => y.id !== x.id); data.txs = data.txs.filter(t => t.account_id !== x.id);
        if (ui.acc === x.id) ui.acc = '';
        persist(); go('accounts', { draft: null }); toast('Verwijderd.');
      });
      break;
    }
    case 'link': { const t = data.txs.find(x => x.id === ui.id), links = txPayouts(t.id), sg = links.length ? null : suggestFor(t); go('link', { sel: links.length ? links.map(p => p.booking_id) : sg ? sg.ids : [], linkAll: false }); break; }
    case 'pick': { const id = el.dataset.id; ui.sel = ui.sel.includes(id) ? ui.sel.filter(x => x !== id) : [...ui.sel, id]; const y = window.scrollY; render(); window.scrollTo(0, y); break; }
    case 'linkall': ui.linkAll = !ui.linkAll; render(); break;
    case 'linksug': run(el, async () => { await saveLink(suggestFor(data.txs.find(x => x.id === ui.id)).ids, 'suggested'); render(); toast('Gekoppeld aan Verhuur.'); }); break;
    case 'savelink': run(el, async () => {
      if (!ui.sel.length && !txPayouts(ui.id).length) throw new Error('Kies een boeking.');
      await saveLink(ui.sel, 'manual'); go('tx'); toast(ui.sel.length ? 'Gekoppeld aan Verhuur.' : 'Ontkoppeld.');
    }); break;
    case 'unlink': if (confirm('Deze uitbetaling loskoppelen van de boeking(en)?')) run(el, async () => { await saveLink([], 'manual'); render(); toast('Ontkoppeld.'); }); break;
    case 'bankstart': run(el, () => bankStart(el.dataset.id)); break;
    case 'banksync': run(el, async () => {
      need(); const r = await api('/functions/v1/integrations', { method: 'POST', body: { mode: 'sync', id: el.dataset.id } });
      await load(); render(); toast(r && r.ok ? `Bijgewerkt: ${r.added} nieuw.` : (r && r.error) || 'Bijwerken lukte niet.', r && r.ok ? '' : 'err');
    }); break;
    case 'bankunlink': if (confirm('De bankkoppeling stoppen? Er komen geen nieuwe transacties meer binnen. Wat er al is, blijft staan.')) run(el, async () => {
      need(); await api('/functions/v1/integrations', { method: 'POST', body: { mode: 'bank_unlink', id: el.dataset.id } });
      await load(); render(); toast('Ontkoppeld.');
    }); break;
    case 'impkind': ui.imp.accounts[+el.dataset.i].kind = el.dataset.v; render(); break;
    case 'impcancel': ui.imp = null; render(); break;
    case 'doimport': run(el, async () => { el.textContent = 'Bezig met inlezen…'; try { await doImport(); window.scrollTo(0, 0); } finally { if (ui.view === 'import') render(); } }); break;
  }
});
document.addEventListener('change', ev => {
  const t = ev.target;
  if (t.id === 'file') run(null, () => pickFile(t.files && t.files[0]).finally(() => { t.value = ''; }));
  else if (t.id === 'tx-cat') run(t, async () => {
    need(); const id = ui.id, c = t.value || null;
    const [row] = await patch(`finance_transactions?id=eq.${id}&select=${TX_FIELDS}`, { category_id: c, category_by: c ? 'manual' : '' });
    setLocalTx([row]); render(); toast(c ? 'Ingedeeld.' : 'Niet ingedeeld.');
  });
  else if (t.id === 'r-cat' || t.id === 'r-pattern') { readRule(); render(); }
});
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.id === 'q') { ui.f.q = t.value; ui.limit = 150; const pos = t.selectionStart; render(); const q = $('#q'); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }
  else if (t.id === 'r-pattern') { readRule(); const pos = t.selectionStart; render(); const p = $('#r-pattern'); if (p) { p.focus(); p.setSelectionRange(pos, pos); } }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !busy && !['tx', 'rule', 'account', 'import', 'cats', 'link'].includes(ui.view)) load(); });
addEventListener('online', () => load());

render();
if (bankReturn) bankFinish(); else load();
