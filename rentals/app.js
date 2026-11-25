// Verhuur — vakantiehuizen van het gezin: boekingen, eigen gebruik en de aangifte van de toeristenbelasting.
//   - huizen, boekingen en bedragen per gezin in Supabase (rental_houses, rental_bookings, rental_booking_amounts,
//     rental_declarations); kopie op de telefoon om offline te lezen; wijzigen kan alleen met verbinding
//   - rollen in de app: Beheerder (admin) ziet en wijzigt alles; Kijker (member) ziet wie wanneer komt, zonder
//     bedragen en namen (dat regelt de database: de bedragen zijn alleen voor admin te lezen)
//   - rekenwerk (nachten, taxe de séjour, aangifte per maand): tax.js
//   - uitbetalingen: in Financiën gekoppeld aan een boeking (rental_booking_payouts); hier zie je ze en wat nog
//     niet binnen is (finance/payouts.js)
//   - fase 1: boekingen met de hand. Later: kosten en begroting, inventaris, Lodgify (zie docs/plan-rentals.md)
import { storage, account, api, applyTheme, esc, registerSW, canUse, CLOUD } from '../shared/family.js';
import * as R from './tax.js';
import * as P from '../finance/payouts.js';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
registerSW('../');

const APP = 'rentals';
const me = account();
const FAMILY = me && me.teamId ? me.teamId : null;
const DKEY = `${FAMILY}:data`;
const PORTAL = 'https://ccvk.consonanceweb.fr';
const ICON_BACK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_CHEV = '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const MONL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const MONS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const DSH = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const COUNTRIES = ['Frankrijk', 'Duitsland', 'België', 'Nederland', 'Zwitserland', 'Luxemburg', 'Spanje', 'Italië', 'Polen', 'Verenigd Koninkrijk', 'Verenigde Staten'];

const isAdmin = () => !!(me && me.apps && me.apps.rentals && me.apps.rentals.role === 'admin');
const today = () => R.ymd(new Date(Date.now() - new Date().getTimezoneOffset() * 6e4));
const pd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDay = s => { const d = pd(s); return `${DSH[d.getDay()]} ${d.getDate()} ${MONS[d.getMonth()]}`; };
const fmtRange = b => `${fmtDay(b.arrival)} – ${fmtDay(b.departure)}${b.departure.slice(0, 4) !== today().slice(0, 4) ? ' ' + b.departure.slice(0, 4) : ''}`;
const fmtFr = s => s.split('-').reverse().join('/'); // zoals het aangifteportaal (dd/mm/jjjj)
const monthName = m => `${MONL[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const eur = x => x === null || x === undefined || Number.isNaN(x) ? '–' : `€ ${Number(x).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dec = x => x === null || x === undefined ? '' : Number(x).toFixed(2).replace('.', ',');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const guestsText = b => `${plural(b.guests, 'persoon', 'personen')}${b.guests !== b.adults ? ` (${plural(b.adults, 'volwassene', 'volwassenen')})` : ''}`;

// data = { houses, bookings, amounts: { booking_id: rij }, declarations, payouts, at }
let data = (FAMILY && storage.get(APP, DKEY)) || { houses: [], bookings: [], amounts: {}, declarations: [], at: null };
let ui = { view: 'home', houseId: storage.get(APP, `${FAMILY}:house`) || null, id: null, draft: null, month: R.prevMonth(today().slice(0, 7)), year: today().slice(0, 4), cancelled: false };
let loading = false, offline = false;

const house = () => data.houses.find(h => h.id === ui.houseId) || data.houses[0] || null;
const booking = id => data.bookings.find(b => b.id === id);
const doneMonths = h => data.declarations.filter(d => d.house_id === h.id).map(d => d.month.slice(0, 7));
const inHouse = () => { const h = house(); return h ? data.bookings.filter(b => b.house_id === h.id && !b.deleted) : []; };
const payoutsOf = id => (data.payouts || []).filter(p => p.booking_id === id).sort((a, b) => a.paid_on.localeCompare(b.paid_on));
// alleen tonen als Financiën aan staat: daar koppel je de uitbetalingen
const unpaidList = () => (isAdmin() && canUse('finance') ? P.unpaid(inHouse(), data.payouts, today()) : []);

/* ---------- server ---------- */
async function load() {
  if (!FAMILY || loading || gate()) return;
  loading = true;
  try {
    const admin = isAdmin();
    const [houses, bookings, amounts, declarations, payouts] = await Promise.all([
      api(`/rest/v1/rental_houses?team_id=eq.${FAMILY}&deleted=is.false&select=*&order=sort,name`),
      api(`/rest/v1/rental_bookings?team_id=eq.${FAMILY}&deleted=is.false&select=*&order=arrival`),
      admin ? api(`/rest/v1/rental_booking_amounts?team_id=eq.${FAMILY}&select=*`) : [],
      admin ? api(`/rest/v1/rental_declarations?team_id=eq.${FAMILY}&select=*`) : [],
      admin ? api(`/rest/v1/rental_booking_payouts?team_id=eq.${FAMILY}&select=id,booking_id,amount,paid_on`).catch(() => []) : [],
    ]);
    data = { houses: houses || [], bookings: bookings || [], amounts: Object.fromEntries((amounts || []).map(a => [a.booking_id, a])), declarations: declarations || [], payouts: payouts || [], at: new Date().toISOString() };
    persist();
    offline = false;
  } catch (e) {
    offline = e instanceof TypeError || !navigator.onLine;
    if (!offline) toast(e.message, 'err');
  } finally { loading = false; }
  if (!['edit', 'house'].includes(ui.view)) render();
}
const persist = () => storage.set(APP, DKEY, data);
const need = () => { if (!navigator.onLine) throw new Error('Geen verbinding. Probeer het straks opnieuw.'); };
const post = (table, body, extra = '') => api(`/rest/v1/${table}${extra}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body });
const patch = (table, id, body) => api(`/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body });
function upsertLocal(row) { const i = data.bookings.findIndex(x => x.id === row.id); if (row.deleted) { if (i >= 0) data.bookings.splice(i, 1); } else if (i >= 0) data.bookings[i] = row; else data.bookings.push(row); data.bookings.sort((a, b) => a.arrival.localeCompare(b.arrival)); persist(); }

/* ---------- scherm ---------- */
const $ = s => document.querySelector(s);
const navBar = (left, title = '', right = '') => `<header class="nav" id="nav"><div class="nav-l">${left || ''}</div><div class="nav-t">${title}</div><div class="nav-r">${right}</div></header>`;
const hubLink = () => `<a class="nb back" href="../" aria-label="Naar alle apps">${ICON_BACK}<span>Apps</span></a>`;
const backTo = (v, txt) => `<button class="nb back" data-a="go" data-v="${v}">${ICON_BACK}<span>${txt}</span></button>`;
const lt = (t, sub) => `<div class="lt"><h1 tabindex="-1">${t}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const sec = (head, body, foot) => `<section class="sec">${head ? `<h2 class="sec-h">${head}</h2>` : ''}${body}${foot ? `<p class="sec-f">${foot}</p>` : ''}</section>`;
const seg = (items, cur, a) => `<div class="segc" role="group">${items.map(([v, l]) => `<button data-a="${a}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
const quick = (items, cur, a) => `<div class="quick" role="group">${items.map(([v, l]) => `<button data-a="${a}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
const pill = s => `<span class="src ${esc(s)}">${esc(R.sourceName(s))}</span>`;
const plus = (a, label) => `<button class="nb" data-a="${a}" aria-label="${label}" style="font-size:1.6rem;font-weight:300">+</button>`;

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
  if (!CLOUD) return 'Verhuur werkt alleen met een gezin online.';
  if (!me) return 'Verhuur deel je met je gezin. <a href="../?login">Log in</a> om het te zien.';
  if (!FAMILY) return 'Verhuur deel je met je gezin. <a href="../?view=family">Maak een gezin of sluit je aan</a>.';
  if (!canUse(APP)) return 'Verhuur staat niet aan voor jou in dit gezin. Een beheerder kan de app aanzetten bij <b>Gezin → Apps</b> in het startscherm.';
  return '';
}

function stayCell(b) {
  const n = R.nights(b), d = pd(b.arrival), off = b.status === 'cancelled', tent = b.status === 'option' || b.status === 'expected';
  const a = data.amounts[b.id], who = isAdmin() && a && a.guest_name ? esc(a.guest_name) : '';
  return `<button class="cell stay${off ? ' off' : ''}${tent ? ' tent' : ''}" data-a="booking" data-id="${esc(b.id)}">
    <span class="dt"><b>${d.getDate()}</b><span>${MONS[d.getMonth()]} · ${DSH[d.getDay()]}</span></span>
    <span class="tx"><span class="tt">${pill(b.source)}${tent || off ? ` <span class="pill">${R.statusName(b.status)}</span>` : ''} ${who}</span>
    <span class="st">${plural(n, 'nacht', 'nachten')} · tot ${fmtDay(b.departure)} · ${guestsText(b)}</span></span>${ICON_CHEV}</button>`;
}

function vHome() {
  const h = house(), t = today(), admin = isAdmin();
  let html = navBar(hubLink(), '', h && admin ? plus('new', 'Boeking toevoegen') : '') + '<main>' + lt('Verhuur', h ? esc(h.name) + (h.place ? ` · ${esc(h.place)}` : '') : esc(me.teamName));
  if (data.houses.length > 1) html += `<div class="chips" role="group" aria-label="Huis">${data.houses.map(x => `<button data-a="pickhouse" data-id="${esc(x.id)}" aria-pressed="${x.id === h.id}">${esc(x.name)}</button>`).join('')}</div>`;
  if (!h) {
    html += admin
      ? `<div class="card"><h2>Welk huis verhuren jullie?</h2><p class="muted">Begin met het huis. Daarna kun je boekingen invoeren en de toeristenbelasting aangeven.</p><button class="btn" data-a="newhouse" style="margin-top:12px">Huis toevoegen</button></div>`
      : `<div class="card"><p class="muted">Er staat nog geen huis in. Een beheerder van Verhuur kan het toevoegen.</p></div>`;
    return html + (loading ? '<p class="sec-f">Laden…</p>' : '') + '</main>';
  }
  const list = inHouse().filter(b => b.status !== 'cancelled');
  const now = list.filter(b => b.status === 'booked' && b.arrival <= t && t < b.departure);
  const next = list.filter(b => b.arrival > t || (b.arrival <= t && t < b.departure && b.status !== 'booked')).slice(0, 6);
  if (now.length) html += sec('Nu', `<div class="grp">${now.map(stayCell).join('')}</div>`);
  html += sec('Komend', `<div class="grp">${next.map(stayCell).join('') || '<div class="cell"><span class="tx muted">Geen boekingen gepland.</span></div>'}
    ${admin ? '<button class="cell tint" data-a="new"><span class="tx"><span class="tt">Boeking toevoegen</span></span></button>' : ''}</div>`,
    list.some(b => b.status === 'option' || b.status === 'expected') ? 'Optie en verwacht: nog niet zeker, telt niet mee in de aangifte.' : '');
  const due = R.declarationDue(t, doneMonths(h)), dl = pd(due.deadline);
  const dueText = !due.open ? `${monthName(due.month)}: gedaan` : due.late ? `${monthName(due.month)}: nog niet aangegeven (was vóór 5 ${MONL[dl.getMonth()]})` : `${monthName(due.month)}: vóór 5 ${MONL[dl.getMonth()]}`;
  html += sec('', `<div class="grp">
    ${admin ? `<button class="cell" data-a="decl" data-m="${due.month}"><span class="tx"><span class="tt">Aangifte toeristenbelasting</span><span class="st${due.late ? ' late' : ''}"${due.late ? ' style="color:var(--red)"' : ''}>${dueText}</span></span>${due.late || (due.open && +t.slice(8, 10) <= 5) ? '<span class="tr" style="color:var(--red)">●</span>' : ''}${ICON_CHEV}</button>` : ''}
    ${unpaidList().length ? `<button class="cell" data-a="go" data-v="unpaid"><span class="tx"><span class="tt">Nog niet uitbetaald</span><span class="st">${plural(unpaidList().length, 'boeking', 'boekingen')} van Booking.com of Airbnb</span></span><span class="tr" style="color:var(--orange)">${unpaidList().length}</span>${ICON_CHEV}</button>` : ''}
    <button class="cell" data-a="go" data-v="list"><span class="tx"><span class="tt">Alle boekingen</span></span><span class="tr">${inHouse().filter(b => b.arrival.slice(0, 4) === t.slice(0, 4) && R.isStay(b)).length} in ${t.slice(0, 4)}</span>${ICON_CHEV}</button>
    ${admin ? `<button class="cell" data-a="edithouse"><span class="tx"><span class="tt">Huis en toeristenbelasting</span><span class="st">${h.stars ? `${h.stars} ★` : 'Niet geclassificeerd'}</span></span>${ICON_CHEV}</button>` : ''}
    <a class="cell" href="../?article=verhuur" style="text-decoration:none;color:inherit"><span class="tx"><span class="tt">Hoe werkt Verhuur?</span></span>${ICON_CHEV}</a></div>`,
    offline ? 'Geen verbinding: je ziet de laatst opgehaalde boekingen.' : '');
  return html + '</main>';
}

function vList() {
  const y = ui.year, all = inHouse().filter(b => b.arrival.slice(0, 4) === y), shown = all.filter(b => ui.cancelled || b.status !== 'cancelled');
  const stays = all.filter(R.isStay), rented = stays.filter(b => b.source !== 'own');
  let html = navBar(backTo('home', 'Verhuur'), 'Boekingen', isAdmin() ? plus('new', 'Boeking toevoegen') : '') + '<main>' + lt(`Boekingen ${y}`, `${plural(rented.length, 'verhuring', 'verhuringen')} · ${plural(rented.reduce((s, b) => s + R.nights(b), 0), 'nacht', 'nachten')} verhuurd${stays.length > rented.length ? ` · ${plural(stays.length - rented.length, 'keer', 'keer')} eigen gebruik` : ''}`);
  html += `<div class="pager"><button class="nb" data-a="year" data-d="-1" aria-label="Vorig jaar">‹</button><button class="lbl" data-a="year" data-d="0"><b>${y}</b></button><button class="nb" data-a="year" data-d="1" aria-label="Volgend jaar">›</button></div>`;
  for (let m = 1; m <= 12; m++) {
    const mm = `${y}-${String(m).padStart(2, '0')}`, rows = shown.filter(b => b.arrival.slice(0, 7) === mm);
    if (rows.length) html += sec(MONL[m - 1], `<div class="grp">${rows.map(stayCell).join('')}</div>`);
  }
  if (!shown.length) html += `<div class="card"><p class="muted">Geen boekingen in ${y}.</p></div>`;
  const nc = all.filter(b => b.status === 'cancelled').length;
  if (nc) html += `<div class="sec"><button class="btn sec" data-a="showcancelled">${ui.cancelled ? 'Verberg geannuleerde' : `Toon geannuleerde (${nc})`}</button></div>`;
  return html + '</main>';
}

function vBooking() {
  const b = booking(ui.id); if (!b) return vHome();
  const h = house(), a = data.amounts[b.id] || {}, admin = isAdmin(), n = R.nights(b), past = b.departure <= today();
  let html = navBar(backTo(ui.from || 'home', ({ list: 'Boekingen', decl: 'Aangifte', unpaid: 'Terug' })[ui.from] || 'Verhuur'), '', admin ? '<button class="nb" data-a="edit">Wijzig</button>' : '')
    + '<main>' + lt(`${pill(b.source)} ${admin && a.guest_name ? esc(a.guest_name) : esc(fmtRange(b))}`, `${R.statusName(b.status)}${b.status === 'booked' && past ? ' · afgerond' : ''}${b.cancelled_at ? ` op ${fmtDay(b.cancelled_at.slice(0, 10))}` : ''}`);
  html += `<div class="grp">
    <div class="cell"><span class="tx"><span class="tt">${esc(fmtRange(b))}</span><span class="st">${plural(n, 'nacht', 'nachten')} · aankomst ${fmtFr(b.arrival)}, vertrek ${fmtFr(b.departure)}</span></span></div>
    <div class="cell"><span class="tx"><span class="tt">${guestsText(b)}</span><span class="st">${b.guests - b.adults > 0 ? `${plural(b.guests - b.adults, 'kind', 'kinderen')} onder 18` : 'Geen kinderen'}${b.country ? ` · ${esc(b.country)}` : ''}</span></span></div>
    ${b.external_id ? `<div class="cell"><span class="tx"><span class="tt">Boekingsnummer</span></span><span class="tr">${esc(b.external_id)}</span></div>` : ''}
    ${b.notes ? `<div class="cell"><span class="tx"><span class="tt" style="white-space:pre-wrap">${esc(b.notes)}</span></span></div>` : ''}</div>`;
  if (admin) {
    const t = R.touristTax(b, a, h), np = R.nightPrice(b, a), rows = [];
    const add = (k, v) => { if (v !== null && v !== undefined && v !== '') rows.push(`<span>${k}</span><span>${typeof v === 'number' ? eur(v) : v}</span>`); };
    if (b.source === 'direct' || b.source === 'other') {
      const d = R.directTotal(b, a, h);
      add(`Huur (${n} × ${eur(R.num(a.night_price))})`, d.rent); add('Schoonmaak', d.cleaning || null); add('Bedlinnen', d.linen || null);
      add('Toeristenbelasting', R.num(a.tourist_tax) ?? d.tax);
      rows.push(`<span class="tot">Totaal voor de gast</span><span class="tot">${eur(d.rent === null ? null : R.round2(d.rent + d.cleaning + d.linen + (R.num(a.tourist_tax) ?? d.tax)))}</span>`);
    } else if (b.source === 'own') {
      add('Schoonmaak', R.num(a.cleaning)); add('Bedlinnen', R.num(a.linen)); add('Bijdrage', R.num(a.accommodation));
    } else {
      add('Huur (overnachtingen)', R.num(a.accommodation)); add('Gemiddeld per nacht', np); add('Uitbetaling', R.num(a.payout));
      add('Schoonmaak', R.num(a.cleaning)); add('Bedlinnen', R.num(a.linen));
      add(`Toeristenbelasting${b.tax_by === 'platform' ? ' (int platform)' : ''}`, R.num(a.tourist_tax));
    }
    html += sec('Bedragen', `<div class="card"><div class="sum">${rows.join('') || '<span class="muted">Nog geen bedragen.</span><span></span>'}</div></div>`,
      b.source === 'own' ? 'Eigen gebruik telt niet mee in de aangifte.' : t
        ? `Berekende toeristenbelasting: ${eur(t.rate)} × ${plural(t.adults, 'volwassene', 'volwassenen')} × ${plural(t.nights, 'nacht', 'nachten')} = <b>${eur(t.amount)}</b>${R.num(a.tourist_tax) !== null && Math.abs(R.num(a.tourist_tax) - t.amount) > 0.05 ? ' (wijkt af van het ingevulde bedrag)' : ''}.`
        : h && !h.stars ? 'Vul de huur in om de toeristenbelasting te berekenen.' : '');
    if (b.source !== 'own') {
      const ps = payoutsOf(b.id), got = R.round2(ps.reduce((s, p) => s + Number(p.amount), 0)), exp = R.num(a.payout);
      const late = P.lateFrom(b), isLate = b.status === 'booked' && late && late <= today();
      html += sec('Uitbetaling', `<div class="grp">${ps.map(p => `<div class="cell"><span class="tx"><span class="tt">Ontvangen op ${fmtDay(p.paid_on)}</span>${p.paid_on.slice(0, 4) !== today().slice(0, 4) ? `<span class="st">${p.paid_on.slice(0, 4)}</span>` : ''}</span><span class="tr">${eur(Number(p.amount))}</span></div>`).join('')
        || `<div class="cell"><span class="tx"><span class="tt"${isLate ? ' style="color:var(--orange)"' : ''}>${isLate ? 'Nog niet uitbetaald' : 'Nog niet binnen'}</span>${late && !isLate && b.status === 'booked' ? `<span class="st">Verwacht rond ${fmtDay(P.expectedOn(b))}</span>` : ''}</span></div>`}
        ${canUse('finance') ? `<a class="cell" href="../finance/" style="text-decoration:none;color:inherit"><span class="tx"><span class="tt">${ps.length ? 'Bekijk in Financiën' : 'Koppelen in Financiën'}</span><span class="st">${ps.length ? 'Alleen als je die rekening ziet' : 'Bij de bijschrijving op de bank'}</span></span>${ICON_CHEV}</a>` : ''}</div>`,
        ps.length && exp !== null && Math.abs(got - exp) > 0.01 ? `${eur(Math.abs(R.round2(got - exp)))} ${got < exp ? 'minder' : 'meer'} dan de uitbetaling bij deze boeking (${eur(exp)}).` : '');
    }
    html += `<div class="sec">${b.status === 'cancelled' ? '<button class="btn sec" data-a="restore">Toch niet geannuleerd</button>' : '<button class="btn sec" data-a="cancelbk">Boeking annuleren</button>'}
      <p class="sec-f">Een geannuleerde boeking blijft bewaard, maar telt nergens meer mee.</p></div>
      <div style="margin-top:12px"><button class="btn danger" data-a="delbk">Verwijderen (per ongeluk ingevoerd)</button></div>`;
  }
  return html + '</main>';
}

function vUnpaid() {
  const list = unpaidList();
  let html = navBar(backTo('home', 'Verhuur'), '') + '<main>' + lt('Nog niet uitbetaald', esc((house() || {}).name || ''));
  html += sec('', `<div class="grp">${list.map(stayCell).join('') || '<div class="cell"><span class="tx muted">Alles is uitbetaald.</span></div>'}</div>`,
    'Boekingen van Booking.com en Airbnb waarvan het geld er al had moeten zijn (Airbnb 5 dagen na aankomst, Booking.com 35 dagen na vertrek), en die nog niet aan een bijschrijving in Financiën hangen. Lees eerst de nieuwste transacties in en koppel ze daar.');
  return html + '</main>';
}

/* ---------- boeking invoeren ---------- */
const MONEY = ['accommodation', 'night_price', 'payout', 'cleaning', 'linen', 'tourist_tax'];
function newDraft() {
  const h = house(), s = (h && h.settings) || {}, t = today();
  return { id: null, source: 'direct', status: 'booked', arrival: t, departure: R.addDays(t, 2), guests: '', adults: '', country: '', external_id: '', notes: '', guest_name: '',
    tax_by: 'host', accommodation: '', night_price: '', payout: '', cleaning: s.cleaning ?? '', linen: s.linen ?? '', tourist_tax: '', taxTouched: false };
}
function draftFrom(b) {
  const a = data.amounts[b.id] || {}, d = { ...b, guests: String(b.guests), adults: String(b.adults), guest_name: a.guest_name || '', taxTouched: true };
  for (const k of MONEY) d[k] = a[k] === null || a[k] === undefined ? '' : dec(a[k]);
  if (b.source === 'direct' || b.source === 'other') d.taxTouched = false; // directe boeking: altijd opnieuw berekenen
  return d;
}
const draftBooking = d => ({ ...d, house_id: (house() || {}).id, guests: parseInt(d.guests, 10) || 0, adults: parseInt(d.adults, 10) || 0 });
const draftAmounts = d => { const o = {}; for (const k of MONEY) o[k] = R.num(d[k]); return o; };

function summary() {
  const d = ui.draft, h = house(), b = draftBooking(d), a = draftAmounts(d), n = R.nights(b);
  if (!n) return '<span class="muted">Kies een vertrekdatum na de aankomst.</span><span></span>';
  if (d.source === 'own') return `<span>${plural(n, 'nacht', 'nachten')} eigen gebruik</span><span></span><span>Kosten (schoonmaak, bedlinnen)</span><span>${eur(R.round2((a.cleaning || 0) + (a.linen || 0)))}</span>`;
  if (d.source === 'direct' || d.source === 'other') {
    const t = R.directTotal(b, a, h);
    return `<span>Huur (${n} × ${eur(a.night_price)})</span><span>${eur(t.rent)}</span><span>Schoonmaak + bedlinnen</span><span>${eur(R.round2(t.cleaning + t.linen))}</span>
      <span>Toeristenbelasting${t.calc ? ` (${eur(t.calc.rate)} × ${t.calc.adults} × ${t.calc.nights})` : ''}</span><span>${t.calc ? eur(t.tax) : '–'}</span>
      <span class="tot">Totaal voor de gast</span><span class="tot">${t.rent === null ? '–' : eur(t.total)}</span>`;
  }
  const t = R.touristTax(b, a, h);
  return `<span>${plural(n, 'nacht', 'nachten')}, gemiddeld per nacht</span><span>${eur(R.nightPrice(b, a))}</span>
    <span>Toeristenbelasting berekend</span><span>${t ? eur(t.amount) : '–'}</span>`;
}

function vEdit() {
  const d = ui.draft, platform = d.source === 'booking' || d.source === 'airbnb', direct = d.source === 'direct' || d.source === 'other', own = d.source === 'own';
  const money = (id, label, ph = '0,00') => `<label class="cell field"><span class="fl">${label}</span><input type="text" inputmode="decimal" id="f-${id}" value="${esc(d[id])}" placeholder="${ph}"></label>`;
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, d.id ? 'Wijzig boeking' : 'Nieuwe boeking', `<button class="nb" data-a="save" style="font-weight:600">Bewaar</button>`) + '<main>';
  h += sec('Geboekt bij', `<div class="grp"><div class="cell stack">${quick(R.SOURCES.filter(s => s[0] !== 'other' || d.source === 'other'), d.source, 'source')}</div>
    ${own ? '' : `<div class="cell stack">${seg(R.STATUSES.filter(s => s[0] !== 'cancelled'), d.status === 'cancelled' ? 'booked' : d.status, 'status')}</div>`}</div>`,
    own ? 'Eigen gebruik: familie of vrienden in het huis. Telt niet mee in de aangifte.' : d.status === 'booked' ? '' : 'Optie of verwacht: nog niet zeker. Telt mee in de planning, niet in de aangifte.');
  h += sec('Verblijf', `<div class="grp">
    <label class="cell field"><span class="fl">Aankomst</span><input type="date" id="f-arrival" value="${esc(d.arrival)}"></label>
    <label class="cell field"><span class="fl">Vertrek</span><input type="date" id="f-departure" value="${esc(d.departure)}"></label>
    <label class="cell field"><span class="fl">Personen</span><input type="text" inputmode="numeric" id="f-guests" value="${esc(d.guests)}" placeholder="alle gasten"></label>
    <label class="cell field"><span class="fl">Volwassenen</span><input type="text" inputmode="numeric" id="f-adults" value="${esc(d.adults)}" placeholder="18 jaar en ouder"></label>
    ${own ? '' : `<label class="cell field"><span class="fl">Land</span><input type="text" id="f-country" list="countries" value="${esc(d.country)}" maxlength="60" placeholder="waar komen ze vandaan"></label>
    <datalist id="countries">${COUNTRIES.map(c => `<option value="${c}">`).join('')}</datalist>`}
    <label class="cell field"><span class="fl">Naam</span><input type="text" id="f-guest_name" value="${esc(d.guest_name)}" maxlength="120" placeholder="${own ? 'wie' : 'naam van de gast'}"></label>
    ${platform ? `<label class="cell field"><span class="fl">Boekingsnr.</span><input type="text" id="f-external_id" value="${esc(d.external_id)}" maxlength="80" placeholder="van ${R.sourceName(d.source)}"></label>` : ''}</div>`,
    'Kinderen (onder 18) tellen mee bij personen, maar betalen geen toeristenbelasting. De naam ziet alleen een beheerder.');
  if (platform) h += sec('Bedragen', `<div class="grp">${money('accommodation', 'Huur', 'overnachtingen')}${money('payout', 'Uitbetaling')}${money('cleaning', 'Schoonmaak')}${money('linen', 'Bedlinnen')}${money('tourist_tax', 'Taxe', 'door platform')}
    <div class="cell"><span class="tx"><span class="tt">${R.sourceName(d.source)} int de toeristenbelasting</span></span><button class="toggle" role="switch" data-a="taxby" aria-checked="${d.tax_by === 'platform'}" aria-label="Platform int de toeristenbelasting"></button></div></div>`,
    'Huur = wat de gast betaalt voor de overnachtingen, zonder schoonmaak, bedlinnen en toeristenbelasting. Daarmee rekent de app de gemiddelde nachtprijs uit.');
  if (direct) h += sec('Afgesproken prijs', `<div class="grp">${money('night_price', 'Per nacht')}${money('cleaning', 'Schoonmaak')}${money('linen', 'Bedlinnen')}</div>`);
  if (own) h += sec('Kosten', `<div class="grp">${money('cleaning', 'Schoonmaak')}${money('linen', 'Bedlinnen')}${money('accommodation', 'Bijdrage', 'als ze iets betalen')}</div>`);
  h += `<div class="card"><div class="sum" id="sum">${summary()}</div></div>`;
  h += sec('Notitie', `<div class="grp"><div class="cell"><textarea class="ta" id="f-notes" maxlength="1000" placeholder="bijv. late aankomst, hond mee">${esc(d.notes)}</textarea></div></div>`, 'De notitie ziet iedereen met Verhuur, ook de kijker.');
  return h + '</main>';
}
function readDraft() {
  const d = ui.draft; if (!d) return;
  for (const k of ['arrival', 'departure', 'guests', 'adults', 'country', 'guest_name', 'external_id', 'notes', ...MONEY]) { const el = document.getElementById('f-' + k); if (el) d[k] = el.value; }
}

async function saveBooking() {
  need();
  const d = ui.draft, h = house(), b = draftBooking(d), n = R.nights(b);
  if (!d.arrival || !d.departure) throw new Error('Vul aankomst en vertrek in.');
  if (!n) throw new Error('Vertrek moet na aankomst zijn.');
  if (!b.guests) throw new Error('Hoeveel personen komen er?');
  if (!String(d.adults).trim()) throw new Error('Hoeveel volwassenen (18 jaar en ouder)?');
  if (b.adults > b.guests) throw new Error('Er zijn meer volwassenen dan personen.');
  for (const k of MONEY) if (String(d[k]).trim() && R.num(d[k]) === null) throw new Error(`Geen geldig bedrag: ${d[k]}`);
  const clash = R.overlaps({ ...b, id: d.id }, data.bookings);
  if (clash.length && !confirm(`Deze data overlappen met ${clash.map(x => `${R.sourceName(x.source)} ${fmtRange(x)}`).join(', ')}. Toch bewaren?`)) return false;
  const a = draftAmounts(d);
  if (d.source === 'direct' || d.source === 'other') { const t = R.directTotal(b, a, h); a.accommodation = t.rent; if (!d.taxTouched || a.tourist_tax === null) a.tourist_tax = t.calc ? t.tax : null; }
  const body = { house_id: h.id, source: d.source, status: d.source === 'own' && d.status !== 'cancelled' ? 'booked' : d.status, arrival: d.arrival, departure: d.departure, guests: b.guests, adults: b.adults,
    country: (d.country || '').trim(), external_id: (d.external_id || '').trim(), notes: (d.notes || '').trim(), tax_by: d.source === 'own' ? 'none' : d.tax_by };
  const [row] = d.id ? await patch('rental_bookings', d.id, body) : await post('rental_bookings', { ...body, team_id: FAMILY });
  const [am] = await api('/rest/v1/rental_booking_amounts?on_conflict=booking_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: { booking_id: row.id, team_id: FAMILY, guest_name: (d.guest_name || '').trim(), accommodation: a.accommodation, night_price: a.night_price, payout: a.payout, cleaning: a.cleaning, linen: a.linen, tourist_tax: a.tourist_tax } });
  data.amounts[row.id] = am; upsertLocal(row);
  return row.id;
}

/* ---------- aangifte ---------- */
function copyKv(k, v, copy) {
  return `<div class="kv"><span class="k">${k}</span><span class="v">${esc(v)}</span>${copy === undefined || copy === '' ? '<span style="min-width:44px"></span>' : `<button class="cp" data-a="copy" data-v="${esc(copy)}" aria-label="Kopieer ${esc(k)}">Kopieer</button>`}</div>`;
}
function vDecl() {
  const h = house(); if (!h) return vHome();
  const m = ui.month, d = R.declaration(data.bookings, data.amounts, h, m);
  const done = data.declarations.find(x => x.house_id === h.id && x.month.slice(0, 7) === m);
  const changed = done ? data.bookings.filter(b => b.house_id === h.id && b.arrival.slice(0, 7) === m && b.updated_at > done.declared_at) : [];
  let html = navBar(backTo('home', 'Verhuur'), 'Aangifte') + '<main>' + lt('Aangifte', `Taxe de séjour · ${esc(h.name)}`);
  html += `<div class="pager"><button class="nb" data-a="month" data-d="-1" aria-label="Vorige maand">‹</button><div class="lbl"><b>${monthName(m)}</b><span>${plural(d.rows.length, 'verblijf', 'verblijven')}</span></div><button class="nb" data-a="month" data-d="1" aria-label="Volgende maand">›</button></div>`;
  if (changed.length) html += `<div class="banner red mb"><span><b>Na de aangifte gewijzigd.</b> ${plural(changed.length, 'boeking is', 'boekingen zijn')} aangepast of geannuleerd na ${fmtDay(done.declared_at.slice(0, 10))}. Corrigeer het in het portaal.</span></div>`;
  html += `<div class="card"><div class="sum"><span>Zelf geïnd, af te dragen</span><span class="tot" style="border:0;padding:0;margin:0">${eur(d.toPay)}</span>
    <span>Via platform (alleen ter informatie)</span><span>${eur(R.round2(d.rows.filter(r => r.byPlatform && r.tax !== null).reduce((s, r) => s + r.tax, 0)))}</span></div>
    ${d.missing ? `<p class="warn" style="padding:8px 0 0">${plural(d.missing, 'verblijf', 'verblijven')} om na te kijken: zie hieronder.</p>` : ''}</div>`;
  for (const r of d.rows) {
    const b = r.booking;
    html += `<div class="decl"><div class="hd"><b>${esc(R.sourceName(b.source))}</b>${r.byPlatform ? '<span class="pill">platform int</span>' : '<span class="pill ok">zelf geïnd</span>'}</div>
      ${copyKv('Plateforme', r.byPlatform ? R.sourceName(b.source) : 'leeg (direct)', r.byPlatform ? R.sourceName(b.source) : '')}
      ${copyKv('Début', fmtFr(b.arrival), fmtFr(b.arrival))}
      ${copyKv('Fin', fmtFr(b.departure) + (r.endsLater ? ' ↪' : ''), fmtFr(b.departure))}
      ${copyKv('Occupants (personen)', r.guests, String(r.guests))}
      ${copyKv('Assujettis (volwassenen)', r.adults, String(r.adults))}
      ${copyKv('Exonérés (kinderen)', r.children, String(r.children))}
      ${copyKv('Prix moyen / nuit', r.nightPrice === null ? '–' : dec(r.nightPrice), r.nightPrice === null ? '' : dec(r.nightPrice))}
      ${copyKv('Taxe', r.tax === null ? '–' : dec(r.tax), '')}
      ${r.endsLater ? `<p class="note">↪ Loopt door in ${MONL[+b.departure.slice(5, 7) - 1]}: vul de hele data in, het portaal verdeelt de nachten.</p>` : ''}
      ${r.issues.length ? `<p class="warn">${r.issues.map(esc).join(' · ')} — <button class="link" style="min-height:0" data-a="booking" data-id="${esc(b.id)}">aanpassen</button></p>` : ''}</div>`;
  }
  if (!d.rows.length) html += `<div class="card"><p class="muted">Geen verhuur die in ${monthName(m)} begint. De aangifte is toch verplicht: klik in het portaal op <b>Déclarer</b> zonder iets in te vullen.</p></div>`;
  html += `<div class="sec"><div class="grp">
    <a class="cell" href="${PORTAL}" target="_blank" rel="noopener"><span class="tx"><span class="tt">Naar het aangifteportaal</span><span class="st">ccvk.consonanceweb.fr · Je déclare en ligne</span></span>${ICON_CHEV}</a>
    ${d.rows.length ? '<button class="cell" data-a="csv"><span class="tx"><span class="tt">CSV downloaden</span><span class="st">Voor op de computer</span></span></button>' : ''}
    <button class="cell ${done ? '' : 'tint'}" data-a="declared"><span class="tx"><span class="tt">${done ? `Aangegeven op ${fmtDay(done.declared_at.slice(0, 10))}` : 'Aangifte gedaan'}</span>${done ? '<span class="st">Tik om ongedaan te maken</span>' : ''}</span>${done ? '<span class="tr" style="color:var(--green)">✓</span>' : ''}</button></div>
    <p class="sec-f">Elke maand vóór de 5e, over de maand ervoor. Ook verblijven via Booking.com en Airbnb invullen: die tellen niet mee in het bedrag dat jij betaalt. Een verblijf staat bij de maand van aankomst.</p></div>`;
  return html + '</main>';
}

/* ---------- huis ---------- */
function vHouse() {
  const d = ui.draft, y = d.year, r = d.rules;
  const field = (id, label, v, ph = '') => `<label class="cell field"><span class="fl">${label}</span><input type="text" inputmode="decimal" id="${id}" value="${esc(v)}" placeholder="${ph}"></label>`;
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, d.id ? 'Huis' : 'Nieuw huis', `<button class="nb" data-a="savehouse" style="font-weight:600">Bewaar</button>`) + '<main>';
  h += sec('Huis', `<div class="grp"><label class="cell field"><span class="fl">Naam</span><input type="text" id="h-name" value="${esc(d.name)}" maxlength="60"></label>
    <label class="cell field"><span class="fl">Plaats</span><input type="text" id="h-place" value="${esc(d.place)}" maxlength="80"></label></div>`);
  h += sec('Classement', `<div class="grp"><div class="cell stack">${quick([['', 'Geen sterren'], ...[1, 2, 3, 4, 5].map(n => [n, '★'.repeat(n)])], d.stars || '', 'stars')}</div></div>`,
    d.stars ? `Geclassificeerd: vast bedrag per volwassene per nacht (${eur(R.num(r.fixed[d.stars]))}, inclusief 10% toeslag).` : 'Niet geclassificeerd: een percentage van de prijs per persoon per nacht, met een maximum.');
  h += sec(`Toeristenbelasting ${y}`, `<div class="grp">${d.stars ? field('h-fixed', `Tarief ${d.stars} ★`, r.fixed[d.stars])
    : field('h-percent', 'Percentage', r.percent, '5') + field('h-cap', 'Maximum', r.cap, '4,60') + field('h-dept', 'Toeslag %', r.dept_percent, '10')}</div>`,
    'Standaard: de tarieven van de Vallée de Kaysersberg (Le Bonhomme). Niet geclassificeerd: 5% per persoon per nacht, maximum € 4,60, plus 10% departementale toeslag. Klopt het maximum niet voor dit jaar? Pas het hier aan.');
  h += sec('Standaardprijzen', `<div class="grp">${field('h-cleaning', 'Schoonmaak', d.cleaning, '0,00')}${field('h-linen', 'Bedlinnen', d.linen, '0,00')}</div>`, 'Worden alvast ingevuld bij een nieuwe boeking.');
  return h + '</main>';
}
function houseDraft(h) {
  const y = today().slice(0, 4), r = R.rulesFor(h, y), s = (h && h.settings) || {};
  return { id: h ? h.id : null, name: h ? h.name : 'Vacances au Bonhomme', place: h ? h.place : 'Le Bonhomme', stars: h ? h.stars : null, year: y,
    rules: { percent: dec(r.percent).replace(',00', ''), cap: dec(r.cap), dept_percent: dec(r.dept_percent).replace(',00', ''), fixed: Object.fromEntries(Object.entries(r.fixed).map(([k, v]) => [k, dec(v)])) },
    cleaning: s.cleaning ?? '', linen: s.linen ?? '' };
}
function readHouse() {
  const d = ui.draft; if (!d) return;
  const v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  if (v('h-name') !== undefined) d.name = v('h-name'); if (v('h-place') !== undefined) d.place = v('h-place');
  if (v('h-percent') !== undefined) d.rules.percent = v('h-percent'); if (v('h-cap') !== undefined) d.rules.cap = v('h-cap'); if (v('h-dept') !== undefined) d.rules.dept_percent = v('h-dept');
  if (v('h-fixed') !== undefined && d.stars) d.rules.fixed[d.stars] = v('h-fixed');
  if (v('h-cleaning') !== undefined) d.cleaning = v('h-cleaning'); if (v('h-linen') !== undefined) d.linen = v('h-linen');
}
async function saveHouse() {
  need();
  const d = ui.draft, old = data.houses.find(x => x.id === d.id), r = d.rules;
  if (!d.name.trim()) throw new Error('Geef het huis een naam.');
  const rule = { percent: R.num(r.percent), cap: R.num(r.cap), dept_percent: R.num(r.dept_percent), fixed: Object.fromEntries(Object.entries(r.fixed).map(([k, v]) => [k, R.num(v)])) };
  if (Object.values(rule).some(x => x === null) || Object.values(rule.fixed).some(x => x === null)) throw new Error('Vul de tarieven in als getal.');
  const money = x => (String(x).trim() ? R.num(x) : null);
  if ([d.cleaning, d.linen].some(x => String(x).trim() && R.num(x) === null)) throw new Error('Vul de standaardprijzen in als bedrag.');
  const body = { name: d.name.trim(), place: d.place.trim(), stars: d.stars ? +d.stars : null, tax: { ...((old && old.tax) || {}), [d.year]: rule },
    settings: { ...((old && old.settings) || {}), cleaning: money(d.cleaning), linen: money(d.linen) } };
  const [row] = d.id ? await patch('rental_houses', d.id, body) : await post('rental_houses', { ...body, team_id: FAMILY, sort: data.houses.length });
  const i = data.houses.findIndex(x => x.id === row.id); if (i >= 0) data.houses[i] = row; else data.houses.push(row);
  ui.houseId = row.id; storage.set(APP, `${FAMILY}:house`, row.id); persist();
}

/* ---------- algemeen ---------- */
const VIEWS = { home: vHome, list: vList, booking: vBooking, edit: vEdit, decl: vDecl, house: vHouse, unpaid: vUnpaid };
function render() {
  const g = gate(), a = $('#app');
  const adminOnly = ['edit', 'decl', 'house', 'unpaid'].includes(ui.view) && !isAdmin();
  a.innerHTML = g ? navBar(hubLink()) + '<main>' + lt('Verhuur') + `<div class="card"><p>${g}</p></div></main>` : (VIEWS[adminOnly ? 'home' : ui.view] || vHome)();
  onScroll();
}
function go(view, extra) { Object.assign(ui, { view }, extra || {}); render(); window.scrollTo(0, 0); }
function onScroll() { const n = document.getElementById('nav'); if (n) n.classList.toggle('scrolled', window.scrollY > 4); }
addEventListener('scroll', onScroll, { passive: true });

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a, v = ui.view;
  if (v === 'edit') readDraft(); else if (v === 'house') readHouse();
  switch (a) {
    case 'go': go(el.dataset.v, { draft: null }); break;
    case 'pickhouse': ui.houseId = el.dataset.id; storage.set(APP, `${FAMILY}:house`, ui.houseId); render(); break;
    case 'booking': go('booking', { id: el.dataset.id, from: ['list', 'decl', 'unpaid'].includes(v) ? v : 'home' }); break;
    case 'new': go('edit', { draft: newDraft(), back: v }); break;
    case 'edit': go('edit', { draft: draftFrom(booking(ui.id)), back: 'booking' }); break;
    case 'cancel': go(v === 'edit' ? (ui.back || 'home') : 'home', { draft: null }); break;
    case 'source': {
      const d = ui.draft; d.source = el.dataset.v; d.tax_by = R.defaultTaxBy(d.source);
      if (d.source === 'own') d.status = 'booked';
      render(); break;
    }
    case 'status': ui.draft.status = el.dataset.v; render(); break;
    case 'taxby': ui.draft.tax_by = ui.draft.tax_by === 'platform' ? 'host' : 'platform'; render(); break;
    case 'save': run(el, async () => {
      const id = await saveBooking(); if (!id) return;
      go(ui.back === 'booking' ? 'booking' : ui.back || 'home', { id, draft: null }); toast('Bewaard.');
    }); break;
    case 'cancelbk': if (confirm('Deze boeking annuleren? Hij blijft bewaard, maar telt niet meer mee.')) run(el, async () => { need(); upsertLocal((await patch('rental_bookings', ui.id, { status: 'cancelled' }))[0]); render(); toast('Geannuleerd.'); }); break;
    case 'restore': run(el, async () => { need(); upsertLocal((await patch('rental_bookings', ui.id, { status: 'booked' }))[0]); render(); toast('Staat weer als geboekt.'); }); break;
    case 'delbk': if (confirm('Deze boeking verwijderen? Doe dit alleen als hij per ongeluk is ingevoerd. Een annulering bewaar je met "Boeking annuleren".')) run(el, async () => {
      need(); upsertLocal((await patch('rental_bookings', ui.id, { deleted: true }))[0]); go(ui.from || 'home'); toast('Verwijderd.');
    }); break;
    case 'year': ui.year = el.dataset.d === '0' ? today().slice(0, 4) : String(+ui.year + +el.dataset.d); render(); break;
    case 'showcancelled': ui.cancelled = !ui.cancelled; render(); break;
    case 'decl': go('decl', { month: el.dataset.m || ui.month }); break;
    case 'month': ui.month = +el.dataset.d < 0 ? R.prevMonth(ui.month) : R.nextMonth(ui.month); render(); break;
    case 'copy': {
      const t = el.dataset.v;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast(`Gekopieerd: ${t}`), () => toast(t));
      break;
    }
    case 'csv': {
      const csv = R.declarationCsv(R.declaration(data.bookings, data.amounts, house(), ui.month));
      const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
      const link = Object.assign(document.createElement('a'), { href: url, download: `taxe-de-sejour-${ui.month}.csv` });
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      break;
    }
    case 'declared': run(el, async () => {
      need();
      const h = house(), month = `${ui.month}-01`, done = data.declarations.find(x => x.house_id === h.id && x.month.slice(0, 7) === ui.month);
      if (done) {
        if (!confirm(`Aangifte ${monthName(ui.month)} weer op "nog niet gedaan" zetten?`)) return;
        await api(`/rest/v1/rental_declarations?house_id=eq.${h.id}&month=eq.${month}`, { method: 'DELETE' });
        data.declarations = data.declarations.filter(x => x !== done);
      } else {
        const [row] = await post('rental_declarations', { house_id: h.id, team_id: FAMILY, month });
        data.declarations.push(row);
      }
      persist(); render(); toast(done ? 'Ongedaan gemaakt.' : 'Aangifte bewaard als gedaan.');
    }); break;
    case 'newhouse': go('house', { draft: houseDraft(null) }); break;
    case 'edithouse': go('house', { draft: houseDraft(house()) }); break;
    case 'stars': ui.draft.stars = el.dataset.v ? +el.dataset.v : null; render(); break;
    case 'savehouse': run(el, async () => { await saveHouse(); go('home', { draft: null }); toast('Bewaard.'); }); break;
  }
});
// bij het typen alleen de samenvatting bijwerken (opnieuw tekenen zou het toetsenbord sluiten)
document.addEventListener('input', ev => {
  if (ui.view !== 'edit' || !ev.target.id || !ev.target.id.startsWith('f-')) return;
  readDraft(); if (ev.target.id === 'f-tourist_tax') ui.draft.taxTouched = true;
  const s = $('#sum'); if (s) s.innerHTML = summary();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
addEventListener('online', () => load());

render();
load();
