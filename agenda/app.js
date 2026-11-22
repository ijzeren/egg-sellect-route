// Agenda — weekoverzicht van het gezin: schoolrooster, trainingen, wedstrijden en huiswerk.
//   - personen in de agenda (ook kinderen zonder account), afspraken één keer of elke week, huiswerk en toetsen
//   - gegevens per gezin in Supabase (agenda_people, agenda_items, agenda_tasks); kopie op de telefoon om offline te lezen
//   - wijzigen kan alleen met verbinding
//   - logica (wat is er op welke dag, rooster plakken): plan.js
//   - agendalinks (iCal, bijv. Magister): per persoon één of meer links; de server haalt ze op (Edge Function
//     `integrations`), de afspraken staan in agenda_items met integration_id en zijn hier alleen te lezen
import { storage, account, api, applyTheme, esc, registerSW, canUse, CLOUD } from '../shared/family.js';
import * as A from './plan.js';
import { PROGRAMS } from '../training/programs.js';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
registerSW('../');

const APP = 'agenda';
const me = account();
const FAMILY = me && me.teamId ? me.teamId : null;
const DKEY = `${FAMILY}:data`;
const ICON_BACK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_CHEV = '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const MONL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const longDate = d => { const x = A.pd(d); return `${A.DAYNAMES[x.getDay()]} ${x.getDate()} ${MONL[x.getMonth()]}`; };

// Database ↔ plan.js (in de database heten tijden en datums anders: end/from zijn SQL-woorden).
const fromRow = r => ({ ...r, start: r.start_time, end: r.end_time, meet: r.meet_time, date: r.on_date, from: r.valid_from, until: r.valid_until, days: r.days || [], skip: r.skip || [], dayTimes: r.day_times || {} });
const toRow = c => ({ kind: c.kind, title: c.title, place: c.place, notes: c.notes, person_ids: c.person_ids, start_time: c.start, end_time: c.end, meet_time: c.meet,
  on_date: c.date, days: c.days, valid_from: c.from, valid_until: c.until, weeks: c.weeks, skip: c.skip, day_times: c.dayTimes || {} });

// data = { people, items (plan-vorm), tasks, members, at }
let data = (FAMILY && storage.get(APP, DKEY)) || { people: [], items: [], tasks: [], members: [], ext: [], links: [], at: null };
// eigen afspraken + afgeleide afspraken uit Egg-sellent en Training (A.externalItems)
const allItems = () => data.items.concat(data.ext || []);
const mePerson = () => data.people.find(p => p.user_id && me && p.user_id === me.userId);
let ui = { view: 'day', day: A.today(), pid: storage.get(APP, `${FAMILY}:pid`) ?? null, id: null, draft: null };
if (ui.pid === null && mePerson()) ui.pid = mePerson().id;
let loading = false, offline = false;

const person = id => data.people.find(p => p.id === id);
const dots = ids => (ids || []).map(person).filter(Boolean).map(p => `<span class="dot" style="background:${esc(p.color)}" title="${esc(p.name)}"></span>`).join('');
const link = id => (data.links || []).find(l => l.id === id);
const linkLabel = id => (link(id) || {}).label || 'agendalink';
const names = ids => (ids || []).map(person).filter(Boolean).map(p => esc(p.name)).join(', ');

/* ---------- server ---------- */
async function load() {
  if (!FAMILY || loading) return;
  loading = true;
  try {
    const soft = p => p.catch(() => null); // geen toegang tot een andere app: die afspraken overslaan
    const [people, items, tasks, members, team, apps, memberApps, absences, deliveries, tracks, links] = await Promise.all([
      api(`/rest/v1/agenda_people?team_id=eq.${FAMILY}&deleted=is.false&select=*&order=sort,name`),
      api(`/rest/v1/agenda_items?team_id=eq.${FAMILY}&deleted=is.false&select=*`),
      // open huiswerk, en afgevinkt huiswerk van de laatste twee weken
      api(`/rest/v1/agenda_tasks?team_id=eq.${FAMILY}&deleted=is.false&or=(done.is.false,done_at.gte.${new Date(Date.now() - 14 * 864e5).toISOString()})&select=*&order=due`),
      api(`/rest/v1/team_members?team_id=eq.${FAMILY}&select=user_id,name,role&order=joined_at`).catch(() => data.members),
      soft(api(`/rest/v1/teams?id=eq.${FAMILY}&select=walk_days`)),
      soft(api(`/rest/v1/team_apps?team_id=eq.${FAMILY}&select=app,enabled,settings`)),
      soft(api(`/rest/v1/team_member_apps?team_id=eq.${FAMILY}&app=eq.eggs&select=user_id,access`)),
      soft(api(`/rest/v1/absences?team_id=eq.${FAMILY}&deleted=is.false&select=date`)),
      soft(api(`/rest/v1/stock_events?team_id=eq.${FAMILY}&kind=eq.delivery&deleted=is.false&select=id,kind,date,ordered,delivered,broken,deleted`)),
      soft(api(`/rest/v1/training_tracks?team_id=eq.${FAMILY}&deleted=is.false&select=id,program,participants,data,deleted`)),
      soft(api(`/rest/v1/integrations?team_id=eq.${FAMILY}&type=eq.ical&select=id,user_id,label,enabled,config,secret_hint,status,last_sync_at,last_error,last_count&order=created_at`)),
    ]);
    const ppl = people || [], mem = members || [];
    const eggApp = (apps || []).find(a => a.app === 'eggs'), es = (eggApp && eggApp.settings) || {};
    // de ronde alleen als we ook de afwezigheid en de leveringen konden lezen (anders zou een afwezige dag als loopdag verschijnen)
    const eggs = !!(eggApp && eggApp.enabled && team && team[0] && absences && deliveries);
    // lopers: zoals ingesteld in Egg-sellent, anders iedereen met toegang tot Egg-sellent
    const access = u => { const x = (memberApps || []).find(y => y.user_id === u.user_id); return x && x.access != null ? x.access : u.role !== 'child'; };
    const walkers = Array.isArray(es.walkers) && es.walkers.length ? es.walkers : mem.filter(access).map(u => u.user_id);
    const ext = A.externalItems({ eggs, walkDays: eggs ? team[0].walk_days || [] : [], walkStart: es.walkStart || {}, walkers,
      absences: (absences || []).map(a => a.date), deliveries: deliveries || [], tracks: tracks || [], programs: PROGRAMS, people: ppl });
    data = { people: ppl, items: (items || []).map(fromRow), tasks: tasks || [], members: mem, ext, links: links || data.links || [], at: new Date().toISOString() };
    if (ui.pid && !person(ui.pid)) ui.pid = '';
    if (ui.pid === null && mePerson()) ui.pid = mePerson().id;
    storage.set(APP, DKEY, data);
    offline = false;
  } catch (e) {
    offline = e instanceof TypeError || !navigator.onLine;
    if (!offline) toast(e.message, 'err');
  } finally { loading = false; }
  if (!['edit', 'task', 'timetable', 'people', 'link'].includes(ui.view)) render();
}
const persist = () => storage.set(APP, DKEY, data);
const need = () => { if (!navigator.onLine) throw new Error('Geen verbinding. Probeer het straks opnieuw.'); };
const post = (table, body) => api(`/rest/v1/${table}`, { method: 'POST', headers: { Prefer: 'return=representation' }, body });
const patch = (table, id, body) => api(`/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body });
function upsertLocal(list, row) { const i = list.findIndex(x => x.id === row.id); if (row.deleted) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = row; else list.push(row); persist(); }

async function saveItem(c, id) {
  need();
  const err = A.validItem(c); if (err) throw new Error(err);
  const [row] = id ? await patch('agenda_items', id, toRow(c)) : await post('agenda_items', { ...toRow(c), team_id: FAMILY });
  upsertLocal(data.items, fromRow(row));
  return row.id;
}
async function setItem(id, body) { need(); const [row] = await patch('agenda_items', id, body); upsertLocal(data.items, fromRow(row)); }
async function saveTask(t, id) {
  need();
  if (!t.person_id) throw new Error('Kies voor wie het huiswerk is.');
  if (!t.text.trim()) throw new Error('Wat moet er gebeuren?');
  const body = { person_id: t.person_id, kind: t.kind === 'test' ? 'test' : 'homework', subject: t.subject.trim().slice(0, 60), text: t.text.trim().slice(0, 500), due: t.due || null };
  const [row] = id ? await patch('agenda_tasks', id, body) : await post('agenda_tasks', { ...body, team_id: FAMILY });
  upsertLocal(data.tasks, row);
}
async function toggleTask(id) {
  need();
  const t = data.tasks.find(x => x.id === id); if (!t) return;
  t.done = !t.done; render();
  try { const [row] = await patch('agenda_tasks', id, { done: t.done }); upsertLocal(data.tasks, row); }
  catch (e) { t.done = !t.done; render(); throw e; }
}

/* ---------- scherm ---------- */
const $ = s => document.querySelector(s);
const navBar = (left, title = '', right = '') => `<header class="nav" id="nav"><div class="nav-l">${left || ''}</div><div class="nav-t">${title}</div><div class="nav-r">${right}</div></header>`;
const hubLink = () => `<a class="nb back" href="../" aria-label="Naar alle apps">${ICON_BACK}<span>Apps</span></a>`;
const backTo = (v, txt) => `<button class="nb back" data-a="go" data-v="${v}">${ICON_BACK}<span>${txt}</span></button>`;
const lt = (t, sub) => `<div class="lt"><h1 tabindex="-1">${t}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const sec = (head, body, foot) => `<section class="sec">${head ? `<h2 class="sec-h">${head}</h2>` : ''}${body}${foot ? `<p class="sec-f">${foot}</p>` : ''}</section>`;
const seg = (items, cur, a, extra = '') => `<div class="segc" role="group">${items.map(([v, l]) => `<button data-a="${a}" data-v="${v}" ${extra} aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;

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
  if (!CLOUD) return 'Agenda werkt alleen met een gezin online.';
  if (!me) return 'De agenda deel je met je gezin. <a href="../?login">Log in</a> om hem te zien.';
  if (!FAMILY) return 'De agenda deel je met je gezin. <a href="../?view=family">Maak een gezin of sluit je aan</a>.';
  if (!canUse(APP)) return 'Agenda staat niet aan voor jou in dit gezin. Een beheerder kan de app aanzetten bij <b>Gezin → Apps</b> in het startscherm.';
  return '';
}

const chips = () => data.people.length > 1 ? `<div class="chips" role="group" aria-label="Voor wie">${[['', 'Iedereen', ''], ...data.people.map(p => [p.id, p.name, p.color])].map(([id, n, c]) =>
  `<button data-a="pid" data-id="${esc(id)}" aria-pressed="${(ui.pid || '') === id}">${c ? `<span class="dot" style="background:${esc(c)}"></span>` : ''}${esc(n)}</button>`).join('')}</div>` : '';

function itemCell(it, d) {
  const k = A.kindOf(it.kind), icon = it.icon || k[2], time = it.meet ? `<b>${it.meet}</b><span>verzamelen</span>` : it.start ? `<b>${it.start}</b>${it.end ? `<span>${it.end}</span>` : ''}` : '<b>–</b>';
  const skipped = !it.date && (it.skip || []).includes(d);
  const inner = `<span class="tm">${time}</span><span class="tx"><span class="tt">${icon} ${esc(it.title)}${skipped ? ' · gaat niet door' : ''}</span><span class="st">${dots(it.person_ids)} ${[it.meet && it.start ? `aftrap ${it.start}` : '', esc(it.place), it.ext ? (it.ext.app === 'eggs' ? 'uit Egg-sellent' : 'uit Training') : it.integration_id ? `uit ${esc(linkLabel(it.integration_id))}` : ''].filter(Boolean).join(' · ')}</span></span>${ICON_CHEV}`;
  if (it.ext) return `<a class="cell item${skipped ? ' skipped' : ''}" href="${esc(it.ext.href)}" style="text-decoration:none;color:inherit">${inner}</a>`;
  return `<button class="cell item${skipped ? ' skipped' : ''}" data-a="item" data-id="${esc(it.id)}" data-day="${d}">${inner}</button>`;
}
function taskCell(t) {
  const p = person(t.person_id), lbl = A.dueLabel(t.due);
  return `<div class="cell task${t.done ? ' done' : ''}"><button class="check" data-a="tick" data-id="${esc(t.id)}" role="checkbox" aria-checked="${!!t.done}" aria-label="Klaar"></button>
    <button class="tx" data-a="task" data-id="${esc(t.id)}"><span class="tt">${t.kind === 'test' ? '<b>Toets</b> ' : ''}${t.subject ? `<b>${esc(t.subject)}</b>: ` : ''}${esc(t.text)}</span>
    <span class="st">${p && !ui.pid ? `<span class="dot" style="background:${esc(p.color)}"></span> ${esc(p.name)} · ` : ''}${lbl ? `<span class="${lbl === 'te laat' ? 'late' : ''}">${lbl}</span>` : 'geen datum'}</span></button></div>`;
}

function vDay() {
  const t = A.today(), d = ui.day, items = A.dayItems(allItems(), d, ui.pid), plus = `<button class="nb" data-a="new" aria-label="Nieuwe afspraak" style="font-size:1.6rem;font-weight:300">+</button>`;
  let h = navBar(hubLink(), '', data.people.length ? plus : '') + '<main>' + lt('Agenda', esc(me.teamName));
  if (!data.people.length) {
    h += `<div class="card"><h2>Wie staan er in de agenda?</h2><p class="muted">Begin met de kinderen (of iedereen in het gezin). Een kind hoeft geen eigen account te hebben.</p><button class="btn" data-a="go" data-v="people" style="margin-top:12px">Personen toevoegen</button></div>`;
    return h + (loading ? '<p class="sec-f">Laden…</p>' : '') + '</main>';
  }
  h += chips();
  h += `<div class="pager"><button class="nb" data-a="day" data-d="-1" aria-label="Vorige dag">‹</button><button class="lbl" data-a="today"><b>${d === t ? 'Vandaag' : d === A.addDays(t, 1) ? 'Morgen' : d === A.addDays(t, -1) ? 'Gisteren' : A.DAYNAMES[A.dow(d)]}</b><span>${[t, A.addDays(t, 1), A.addDays(t, -1)].includes(d) ? longDate(d) : longDate(d).split(' ').slice(1).join(' ')}</span></button><button class="nb" data-a="day" data-d="1" aria-label="Volgende dag">›</button></div>`;
  const shown = [...items, ...allItems().filter(it => !it.date && (it.skip || []).includes(d) && (!ui.pid || it.person_ids.includes(ui.pid)) && A.occursOn({ ...it, skip: [] }, d)).map(it => A.atDay(it, d))].sort((a, b) => (a.meet || a.start || '').localeCompare(b.meet || b.start || ''));
  h += `<div class="grp">${shown.length ? shown.map(it => itemCell(it, d)).join('') : '<div class="cell"><span class="tx muted">Niets gepland.</span></div>'}</div>`;
  const open = A.openTasks(data.tasks, ui.pid), soon = open.filter(x => !x.due || x.due <= A.addDays(t, 7)).slice(0, 8);
  h += sec('Huiswerk', `<div class="grp">${soon.map(taskCell).join('') || '<div class="cell"><span class="tx muted">Geen open huiswerk.</span></div>'}
    <button class="cell tint" data-a="newtask"><span class="tx"><span class="tt">Huiswerk of toets toevoegen</span></span></button>
    ${open.length > soon.length || data.tasks.some(x => x.done) ? `<button class="cell" data-a="go" data-v="tasks"><span class="tx"><span class="tt">Al het huiswerk</span></span><span class="tr">${open.length} open</span>${ICON_CHEV}</button>` : ''}</div>`);
  h += sec('', `<div class="grp"><button class="cell" data-a="go" data-v="week"><span class="tx"><span class="tt">Weekoverzicht</span></span>${ICON_CHEV}</button>
    <button class="cell" data-a="timetable"><span class="tx"><span class="tt">Schoolrooster invoeren</span></span>${ICON_CHEV}</button>
    <button class="cell" data-a="go" data-v="links"><span class="tx"><span class="tt">Agendalinks</span><span class="st">Rooster uit Magister of een andere agenda</span></span>${(data.links || []).some(l => l.enabled && l.status === 'error') ? '<span class="tr late">⚠︎</span>' : (data.links || []).length ? `<span class="tr">${data.links.length}</span>` : ''}${ICON_CHEV}</button>
    <button class="cell" data-a="go" data-v="people"><span class="tx"><span class="tt">Personen</span></span><span class="tr">${data.people.map(p => `<span class="dot" style="background:${esc(p.color)}"></span>`).join('')}</span>${ICON_CHEV}</button></div>`,
    offline ? 'Geen verbinding: je ziet de laatst opgehaalde agenda.' : '');
  return h + '</main>';
}

function vWeek() {
  const ws = A.weekStart(ui.day), t = A.today();
  let h = navBar(backTo('day', 'Agenda'), 'Week') + '<main>' + lt(`Week ${A.isoWeek(ws)}`, `${A.fmtShort(ws)} – ${A.fmtShort(A.addDays(ws, 6))}`);
  h += chips();
  h += `<div class="pager"><button class="nb" data-a="day" data-d="-7" aria-label="Vorige week">‹</button><button class="lbl" data-a="today"><b>Deze week</b></button><button class="nb" data-a="day" data-d="7" aria-label="Volgende week">›</button></div>`;
  for (let i = 0; i < 7; i++) {
    const d = A.addDays(ws, i), items = A.dayItems(allItems(), d, ui.pid), tasks = A.openTasks(data.tasks, ui.pid).filter(x => x.due === d);
    h += `<h2 class="sec-h wk${d === t ? ' now' : ''}">${longDate(d)}</h2><div class="grp">${items.map(it => itemCell(it, d)).join('')}${tasks.map(taskCell).join('')}${!items.length && !tasks.length ? '<div class="cell"><span class="tx muted small">Niets</span></div>' : ''}</div>`;
  }
  return h + '</main>';
}

function vItem() {
  const it = data.items.find(x => x.id === ui.id); if (!it) return vDay();
  const k = A.kindOf(it.kind), d = ui.itemDay, skipped = (it.skip || []).includes(d), tt = A.timesOn(it, d || A.today());
  const when = it.date ? longDate(it.date) : `Elke ${A.WEEK_ORDER.filter(n => it.days.includes(n)).map(n => A.DAYNAMES[n]).join(', ')}${it.weeks ? ` (${it.weeks === 'odd' ? 'oneven' : 'even'} weken)` : ''}${it.from || it.until ? ` · ${it.from ? 'vanaf ' + A.fmtShort(it.from) : ''}${it.until ? ' t/m ' + A.fmtShort(it.until) : ''}` : ''}`;
  const imported = !!it.integration_id;
  let h = navBar(backTo(ui.from || 'day', ui.from === 'week' ? 'Week' : 'Agenda'), '', imported ? '' : '<button class="nb" data-a="edit">Wijzig</button>') + '<main>' + lt(`${k[2]} ${esc(it.title)}`, k[1]);
  h += `<div class="grp">
    <div class="cell"><span class="tx"><span class="tt">${esc(when)}</span><span class="st">${[it.meet ? `verzamelen ${it.meet}` : '', tt.start ? `${it.kind === 'match' ? 'aftrap ' : ''}${tt.start}${tt.end ? ' – ' + tt.end : ''}` : ''].filter(Boolean).join(' · ') || 'Hele dag'}</span></span></div>
    ${A.hasDayTimes(it) ? `<div class="cell"><span class="tx"><span class="tt">Tijd per dag</span><span class="st">${A.WEEK_ORDER.filter(n => it.days.includes(n)).map(n => { const x = A.timesOn(it, A.addDays(A.weekStart(A.today()), (n + 6) % 7)); return `${A.DSH[n]} ${x.start || '–'}${x.end ? '–' + x.end : ''}`; }).join(' · ')}</span></span></div>` : ''}
    <div class="cell"><span class="tx"><span class="tt">${dots(it.person_ids)} ${names(it.person_ids)}</span></span></div>
    ${it.place ? `<a class="cell" href="https://maps.apple.com/?q=${encodeURIComponent(it.place)}" target="_blank" rel="noopener"><span class="tx"><span class="tt">${esc(it.place)}</span><span class="st">Open in Kaarten</span></span>${ICON_CHEV}</a>` : ''}
    ${it.notes ? `<div class="cell"><span class="tx"><span class="tt" style="white-space:pre-wrap">${esc(it.notes)}</span></span></div>` : ''}</div>`;
  if (imported) {
    const l = link(it.integration_id);
    h += sec('', `<div class="grp">${l ? `<button class="cell" data-a="link" data-id="${esc(l.id)}"><span class="tx"><span class="tt">Uit de agendalink ${esc(l.label)}</span><span class="st">${esc(linkStatus(l))}</span></span>${ICON_CHEV}</button>` : '<div class="cell"><span class="tx muted">Uit een agendalink</span></div>'}</div>`,
      'Deze afspraak komt uit een agendalink en is hier niet te wijzigen. Pas hem aan in de agenda waar hij vandaan komt (bijv. Magister); de app werkt hem elk half uur bij.');
    return h + '</main>';
  }
  if (!it.date && d) h += `<div class="sec"><button class="btn sec" data-a="${skipped ? 'unskip' : 'skip'}">${skipped ? `Gaat ${longDate(d)} toch door` : `Gaat ${longDate(d)} niet door`}</button><p class="sec-f">Bijvoorbeeld als de training uitvalt of het vakantie is. Alleen deze ene keer.</p></div>`;
  h += `<div style="margin-top:18px"><button class="btn danger" data-a="delitem">Afspraak verwijderen</button></div>`;
  return h + '</main>';
}

function vEdit() {
  const d = ui.draft, once = d.mode === 'once';
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, ui.id ? 'Wijzig afspraak' : 'Nieuwe afspraak', `<button class="nb" data-a="saveitem" style="font-weight:600">Bewaar</button>`) + '<main>';
  h += sec('Soort', `<div class="grp"><div class="cell stack">${seg(A.KINDS.map(k => [k[0], k[1]]), d.kind, 'kind')}</div>
    <label class="cell field"><span class="fl">${d.kind === 'lesson' ? 'Vak' : 'Wat'}</span><input type="text" id="f-title" value="${esc(d.title)}" maxlength="80" placeholder="${{ lesson: 'bijv. Wiskunde', school: 'bijv. Basisschool', sport: 'bijv. Voetbaltraining', match: 'bijv. Thuis tegen VV Oost', other: 'bijv. Tandarts' }[d.kind]}"></label>
    <label class="cell field"><span class="fl">${d.kind === 'lesson' ? 'Lokaal' : 'Waar'}</span><input type="text" id="f-place" value="${esc(d.place)}" maxlength="120" placeholder="${d.kind === 'lesson' ? 'bijv. 1.12' : 'adres of plek'}"></label></div>`);
  h += sec('Voor wie', `<div class="chips wrap">${data.people.map(p => `<button data-a="who" data-id="${esc(p.id)}" aria-pressed="${d.person_ids.includes(p.id)}"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join('')}</div>`);
  h += sec('Wanneer', `<div class="grp"><div class="cell stack">${seg([['weekly', 'Elke week'], ['once', 'Eén keer']], d.mode, 'mode')}</div>
    ${once ? `<label class="cell field"><span class="fl">Datum</span><input type="date" id="f-date" value="${esc(d.date || '')}"></label>`
      : `<div class="cell stack"><div class="daypick">${A.WEEK_ORDER.map(n => `<button data-a="wday" data-d="${n}" aria-pressed="${d.days.includes(n)}">${A.DSH[n]}</button>`).join('')}</div></div>
    <div class="cell stack">${seg([['', 'Elke week'], ['odd', 'Oneven weken'], ['even', 'Even weken']], d.weeks, 'weeks')}</div>
    <label class="cell field"><span class="fl">Vanaf</span><input type="date" id="f-from" value="${esc(d.from || '')}"></label>
    <label class="cell field"><span class="fl">Tot en met</span><input type="date" id="f-until" value="${esc(d.until || '')}"></label>`}
    ${d.kind === 'match' ? `<label class="cell field"><span class="fl">Verzamelen</span><input type="time" id="f-meet" value="${esc(d.meet)}"></label>` : ''}
    ${!once && d.days.length > 1 ? `<div class="cell stack">${seg([['same', 'Zelfde tijd'], ['perday', 'Tijd per dag']], d.perDay ? 'perday' : 'same', 'perday')}</div>` : ''}
    ${!once && d.perDay && d.days.length > 1 ? A.WEEK_ORDER.filter(n => d.days.includes(n)).map(n => { const x = (d.dayTimes || {})[n] || {}; return `<div class="cell field dayrow"><span class="fl">${A.DSH[n]}</span><input type="time" id="f-ds-${n}" aria-label="Begin op ${A.DAYNAMES[n]}" value="${esc(x.start || '')}"><span class="muted">–</span><input type="time" id="f-de-${n}" aria-label="Einde op ${A.DAYNAMES[n]}" value="${esc(x.end || '')}"></div>`; }).join('')
      : `<label class="cell field"><span class="fl">${d.kind === 'match' ? 'Aftrap' : 'Begin'}</span><input type="time" id="f-start" value="${esc(d.start)}"></label>
    <label class="cell field"><span class="fl">Einde</span><input type="time" id="f-end" value="${esc(d.end)}"></label>`}</div>`,
    once ? '' : `${d.perDay && d.days.length > 1 ? 'Elke dag zijn eigen begin- en eindtijd. ' : ''}Deze week is week ${A.isoWeek(A.today())} (${A.isoWeek(A.today()) % 2 ? 'oneven' : 'even'}). Vanaf en tot en met mag leeg; bij een schoolrooster bijvoorbeeld het schooljaar.`);
  h += sec('Notitie', `<div class="grp"><div class="cell"><textarea class="ta" id="f-notes" placeholder="${d.kind === 'match' ? 'bijv. tenue, wie rijdt, wie wast' : 'bijv. sporttas mee'}">${esc(d.notes)}</textarea></div></div>`);
  return h + '</main>';
}
function readItemDraft() {
  const v = id => { const el = document.getElementById(id); return el ? el.value : undefined; };
  const d = ui.draft;
  for (const [k, id] of [['title', 'f-title'], ['place', 'f-place'], ['date', 'f-date'], ['from', 'f-from'], ['until', 'f-until'], ['meet', 'f-meet'], ['start', 'f-start'], ['end', 'f-end'], ['notes', 'f-notes']]) { const x = v(id); if (x !== undefined) d[k] = x; }
  d.dayTimes = { ...(d.dayTimes || {}) };
  for (let n = 0; n < 7; n++) { const a = v(`f-ds-${n}`), b = v(`f-de-${n}`); if (a !== undefined) d.dayTimes[n] = { start: a, end: b || '' }; }
}

function vTasks() {
  const open = A.openTasks(data.tasks, ui.pid), done = data.tasks.filter(t => t.done && (!ui.pid || t.person_id === ui.pid)).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  let h = navBar(backTo('day', 'Agenda'), 'Huiswerk', `<button class="nb" data-a="newtask" aria-label="Huiswerk toevoegen" style="font-size:1.6rem;font-weight:300">+</button>`) + '<main>' + lt('Huiswerk', 'Toetsen en huiswerk');
  h += chips();
  h += sec('Open', `<div class="grp">${open.map(taskCell).join('') || '<div class="cell"><span class="tx muted">Alles af. 🎉</span></div>'}</div>`);
  if (done.length) h += sec('Afgevinkt', `<div class="grp">${done.slice(0, 20).map(taskCell).join('')}</div>`, 'Afgevinkt huiswerk van de laatste twee weken.');
  return h + '</main>';
}

function vTask() {
  const d = ui.draft, subs = A.subjects(data.items, d.person_id), next = A.nextLesson(data.items, d.person_id, d.subject), t = A.today();
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, d.id ? 'Wijzig huiswerk' : 'Huiswerk', `<button class="nb" data-a="savetask" style="font-weight:600">Bewaar</button>`) + '<main>';
  h += sec('Voor wie', `<div class="chips wrap">${data.people.map(p => `<button data-a="taskwho" data-id="${esc(p.id)}" aria-pressed="${d.person_id === p.id}"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join('')}</div>`);
  h += sec('', `<div class="grp"><div class="cell stack">${seg([['homework', 'Huiswerk'], ['test', 'Toets']], d.kind, 'taskkind')}</div>
    <label class="cell field"><span class="fl">Vak</span><input type="text" id="t-subject" list="subjects" value="${esc(d.subject)}" maxlength="60" placeholder="bijv. Engels"></label>
    <datalist id="subjects">${subs.map(s => `<option value="${esc(s)}">`).join('')}</datalist>
    <div class="cell"><textarea class="ta" id="t-text" placeholder="${d.kind === 'test' ? 'bijv. hoofdstuk 3, woordjes' : 'bijv. opgaven 4 t/m 12 maken'}" style="min-height:4rem">${esc(d.text)}</textarea></div>
    <label class="cell field"><span class="fl">${d.kind === 'test' ? 'Datum toets' : 'Inleveren'}</span><input type="date" id="t-due" value="${esc(d.due || '')}"></label>
    <div class="cell stack"><div class="quick">${[[A.addDays(t, 1), 'Morgen'], ...(next ? [[next, `Volgende ${esc(d.subject)}-les: ${A.fmtShort(next)}`]] : [])].map(([v, l]) => `<button data-a="due" data-v="${v}" aria-pressed="${d.due === v}">${l}</button>`).join('')}</div></div></div>`,
    subs.length ? 'Staat het rooster erin? Dan stelt de app de datum van de volgende les van dat vak voor.' : '');
  if (d.id) h += `<div style="margin-top:18px"><button class="btn danger" data-a="deltask">Verwijderen</button></div>`;
  return h + '</main>';
}
function readTaskDraft() {
  const v = id => (document.getElementById(id) || {}).value;
  const d = ui.draft;
  if (v('t-subject') !== undefined) d.subject = v('t-subject');
  if (v('t-text') !== undefined) d.text = v('t-text');
  if (v('t-due') !== undefined) d.due = v('t-due');
}

function vPeople() {
  let h = navBar(backTo('day', 'Agenda'), 'Personen') + '<main>' + lt('Personen', 'Wie staan er in de agenda?');
  h += `<div class="grp">${data.people.map(p => `<div class="cell"><span class="dot big" style="background:${esc(p.color)}"></span><span class="tx"><span class="tt">${esc(p.name)}</span><span class="st">${p.user_id ? 'Eigen account: ' + esc((data.members.find(m => m.user_id === p.user_id) || {}).name || 'gekoppeld') : 'Geen account gekoppeld'}</span></span><button class="nb" data-a="editperson" data-id="${esc(p.id)}">Wijzig</button></div>`).join('') || '<div class="cell"><span class="tx muted">Nog niemand.</span></div>'}</div>`;
  const d = ui.draft || { name: '', color: A.COLORS[data.people.length % A.COLORS.length], user_id: '' };
  ui.draft = d;
  h += sec(d.id ? 'Wijzig persoon' : 'Persoon toevoegen', `<div class="grp"><label class="cell field"><span class="fl">Naam</span><input type="text" id="p-name" value="${esc(d.name)}" maxlength="40" placeholder="bijv. Daan"></label>
    <div class="cell stack"><div class="colors">${A.COLORS.map(c => `<button data-a="color" data-v="${c}" style="background:${c}" aria-pressed="${d.color === c}" aria-label="Kleur ${c}"></button>`).join('')}</div></div>
    <label class="cell field"><span class="fl">Account</span><select class="sel" id="p-user"><option value="">Geen (bijv. kind zonder telefoon)</option>${data.members.map(m => `<option value="${esc(m.user_id)}" ${d.user_id === m.user_id ? 'selected' : ''}>${esc(m.name || 'Gezinslid')}</option>`).join('')}</select></label>
    <button class="cell tint" data-a="saveperson"><span class="tx"><span class="tt">${d.id ? 'Bewaar' : 'Voeg toe'}</span></span></button>
    ${d.id ? '<button class="cell red" data-a="delperson">Verwijder uit de agenda</button>' : ''}</div>`,
    'Koppel je een account, dan opent de agenda voor die persoon meteen op zijn of haar eigen planning. Een kind heeft pas toegang als een beheerder Agenda voor hem of haar aanzet bij Gezin.');
  return h + '</main>';
}

function vTimetable() {
  const d = ui.draft, parsed = A.parseTimetable(d.text);
  let h = navBar(`<button class="nb" data-a="cancel">Annuleer</button>`, 'Schoolrooster', `<button class="nb" data-a="savett" style="font-weight:600">Bewaar</button>`) + '<main>' + lt('Schoolrooster', 'Per dag de lessen plakken of typen');
  h += sec('Voor wie', `<div class="chips wrap">${data.people.map(p => `<button data-a="ttwho" data-id="${esc(p.id)}" aria-pressed="${d.person_id === p.id}"><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join('')}</div>`);
  h += sec('Dag', `<div class="daypick">${A.WEEK_ORDER.filter(n => n >= 1 && n <= 5).map(n => `<button data-a="ttday" data-d="${n}" aria-pressed="${d.day === n}">${A.DSH[n]}</button>`).join('')}</div>`);
  h += sec('Lessen', `<div class="grp"><div class="cell"><textarea class="ta" id="tt-text" placeholder="Eén les per regel:&#10;8:30-9:20 Wiskunde, 1.12&#10;9:20-10:10 Engels, 2.04" style="min-height:10rem">${esc(d.text)}</textarea></div></div>`,
    `Begintijd, eindtijd, vak en (na een komma) het lokaal. ${parsed.lessons.length ? `${parsed.lessons.length} ${parsed.lessons.length === 1 ? 'les' : 'lessen'} herkend.` : ''}${parsed.bad.length ? ` Niet herkend: ${parsed.bad.map(esc).join('; ')}.` : ''}`);
  h += sec('Schooljaar', `<div class="grp"><label class="cell field"><span class="fl">Vanaf</span><input type="date" id="tt-from" value="${esc(d.from)}"></label><label class="cell field"><span class="fl">Tot en met</span><input type="date" id="tt-until" value="${esc(d.until)}"></label></div>`,
    'De lessen staan elke week op deze dag, in deze periode. Wisselt het rooster per week (A/B), maak dan per les een afspraak met even of oneven weken.');
  return h + '</main>';
}
function readTt() { const d = ui.draft; for (const [k, id] of [['text', 'tt-text'], ['from', 'tt-from'], ['until', 'tt-until']]) { const el = document.getElementById(id); if (el) d[k] = el.value; } }

/* ---------- agendalinks ---------- */
const ago = iso => { if (!iso) return ''; const d = new Date(iso), t = new Date(); const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return A.ymd(d) === A.ymd(t) ? `vandaag ${hm}` : `${A.fmtShort(A.ymd(d))} ${hm}`; };
function linkStatus(l) {
  if (!l.enabled) return 'Staat uit';
  if (l.status === 'error') return `⚠︎ ${l.last_error || 'Bijwerken lukte niet'}`;
  if (l.status === 'new') return 'Wordt zo opgehaald';
  return `${l.last_count} ${l.last_count === 1 ? 'afspraak' : 'afspraken'} · bijgewerkt ${ago(l.last_sync_at)}`;
}
const mayEdit = l => !l.id || l.user_id === me.userId || me.role === 'admin';
const LINK_KINDS = [['lesson', 'Schoolrooster'], ['other', 'Andere agenda']];
function vLinks() {
  let h = navBar(backTo('day', 'Agenda'), 'Agendalinks', `<button class="nb" data-a="newlink" aria-label="Agendalink toevoegen" style="font-size:1.6rem;font-weight:300">+</button>`) + '<main>' + lt('Agendalinks', 'Rooster en agenda\'s automatisch in de agenda');
  const links = data.links || [];
  for (const p of data.people) {
    const mine = links.filter(l => (l.config || {}).person_id === p.id);
    if (!mine.length) continue;
    h += sec(`<span class="dot" style="background:${esc(p.color)}"></span> ${esc(p.name)}`, `<div class="grp">${mine.map(l => `<button class="cell" data-a="link" data-id="${esc(l.id)}"><span class="tx"><span class="tt">${esc(l.label)}</span><span class="st${l.enabled && l.status === 'error' ? ' late' : ''}">${esc(linkStatus(l))}</span></span>${ICON_CHEV}</button>`).join('')}</div>`);
  }
  const orphan = links.filter(l => !person((l.config || {}).person_id));
  if (orphan.length) h += sec('Zonder persoon', `<div class="grp">${orphan.map(l => `<button class="cell" data-a="link" data-id="${esc(l.id)}"><span class="tx"><span class="tt">${esc(l.label)}</span><span class="st late">De persoon staat niet meer in de agenda</span></span>${ICON_CHEV}</button>`).join('')}</div>`);
  h += sec(links.length ? '' : 'Nog geen agendalinks', `<div class="grp"><button class="cell tint" data-a="newlink"><span class="tx"><span class="tt">Agendalink toevoegen</span></span></button>
    <a class="cell" href="../?article=agendalinks" style="text-decoration:none;color:inherit"><span class="tx"><span class="tt">Waar vind ik de link?</span><span class="st">Uitleg voor Magister en andere agenda's</span></span>${ICON_CHEV}</a></div>`,
    'Plak de agendalink (iCal) van bijvoorbeeld het rooster in Magister. De app haalt de afspraken elk half uur op en zet ze bij die persoon in de agenda. Iedereen kan meerdere links toevoegen.');
  return h + '</main>';
}
function vLink() {
  const d = ui.draft, l = d.id ? link(d.id) : null, can = mayEdit(d);
  let h = navBar(`<button class="nb" data-a="go" data-v="links">${d.id ? ICON_BACK + '<span>Links</span>' : 'Annuleer'}</button>`, d.id ? '' : 'Agendalink', can ? `<button class="nb" data-a="savelink" style="font-weight:600">Bewaar</button>` : '') + '<main>';
  if (d.id) h += lt(esc(d.label || 'Agendalink'), l ? esc(linkStatus(l)) : '');
  if (!can) h += `<div class="card"><p class="muted">Alleen wie deze link toevoegde, of een beheerder van het gezin, kan hem wijzigen.</p></div>`;
  h += sec('Voor wie', `<div class="chips wrap">${data.people.map(p => `<button data-a="linkwho" data-id="${esc(p.id)}" aria-pressed="${d.person_id === p.id}" ${can ? '' : 'disabled'}><span class="dot" style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join('')}</div>`);
  h += sec('Soort', `<div class="grp"><div class="cell stack">${seg(LINK_KINDS, d.kind, 'linkkind', can ? '' : 'disabled')}</div>
    <label class="cell field"><span class="fl">Naam</span><input type="text" id="l-label" value="${esc(d.label)}" maxlength="40" placeholder="bijv. Magister" ${can ? '' : 'disabled'}></label></div>`,
    d.kind === 'lesson' ? 'De afspraken komen als les in de agenda; het huiswerk kan dan de volgende les van een vak voorstellen.' : 'De afspraken komen als gewone afspraak in de agenda.');
  h += sec('Link', `<div class="grp"><div class="cell"><textarea class="ta" id="l-url" placeholder="${d.id ? 'Plak hier een nieuwe link om de oude te vervangen' : 'https://… of webcal://…'}" style="min-height:4.5rem;overflow-wrap:anywhere" autocapitalize="off" autocorrect="off" spellcheck="false" ${can ? '' : 'disabled'}>${esc(d.url || '')}</textarea></div></div>`,
    d.id && l && l.secret_hint ? `Ingesteld: ${esc(l.secret_hint)}. De link zelf is geheim: niemand in het gezin kan hem terugzien.` : 'De link werkt als een wachtwoord: de app bewaart hem veilig en laat hem aan niemand zien. <a href="../?article=agendalinks">Waar vind ik de link?</a>');
  if (d.id && l) {
    h += sec('', `<div class="grp"><div class="cell"><span class="tx"><span class="tt">Aan</span><span class="st">Uit = niet meer bijwerken; de afspraken blijven staan</span></span><button class="toggle" role="switch" data-a="linkon" aria-checked="${!!d.enabled}" aria-label="Agendalink aan" ${can ? '' : 'disabled'}></button></div>
      <button class="cell tint" data-a="synclink" ${l.enabled ? '' : 'disabled'}><span class="tx"><span class="tt">Nu bijwerken</span></span></button></div>`);
    if (can) h += `<div style="margin-top:18px"><button class="btn danger" data-a="dellink">Agendalink verwijderen</button></div><p class="sec-f">Verwijderen haalt ook alle afspraken uit deze link uit de agenda.</p>`;
  }
  return h + '</main>';
}
function readLink() { const d = ui.draft; if (!d) return; const a = document.getElementById('l-label'), b = document.getElementById('l-url'); if (a) d.label = a.value; if (b) d.url = b.value; }
async function syncLink(id) {
  const r = await api('/functions/v1/integrations', { method: 'POST', body: { mode: 'sync', id } });
  await load();
  return r || {};
}

const VIEWS = { day: vDay, week: vWeek, item: vItem, edit: vEdit, tasks: vTasks, task: vTask, people: vPeople, timetable: vTimetable, links: vLinks, link: vLink };
function render() {
  const g = gate(), a = $('#app');
  a.innerHTML = g ? navBar(hubLink()) + '<main>' + lt('Agenda') + `<div class="card"><p>${g}</p></div></main>` : (VIEWS[ui.view] || vDay)();
  onScroll();
}
function go(view, extra) { Object.assign(ui, { view }, extra || {}); render(); window.scrollTo(0, 0); }
function onScroll() { const n = document.getElementById('nav'); if (n) n.classList.toggle('scrolled', window.scrollY > 4); }
addEventListener('scroll', onScroll, { passive: true });

const newItem = () => ({ perDay: false, dayTimes: {}, mode: 'weekly', kind: 'sport', title: '', place: '', notes: '', person_ids: ui.pid ? [ui.pid] : data.people.length === 1 ? [data.people[0].id] : [], start: '', end: '', meet: '', date: ui.day, days: [A.dow(ui.day)], weeks: '', from: '', until: '', skip: [] });
const toggle = (list, v) => list.includes(v) ? list.filter(x => x !== v) : [...list, v];

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a, v = ui.view;
  if (v === 'edit') readItemDraft(); else if (v === 'task') readTaskDraft(); else if (v === 'timetable') readTt(); else if (v === 'link') readLink();
  switch (a) {
    case 'go': go(el.dataset.v, { draft: null }); break;
    case 'pid': ui.pid = el.dataset.id; storage.set(APP, `${FAMILY}:pid`, ui.pid); render(); break;
    case 'day': ui.day = A.addDays(ui.day, +el.dataset.d); render(); break;
    case 'today': ui.day = A.today(); render(); break;
    case 'item': go('item', { id: el.dataset.id, itemDay: el.dataset.day, from: v }); break;
    case 'new': go('edit', { id: null, draft: newItem(), back: v }); break;
    case 'edit': { const it = data.items.find(x => x.id === ui.id); go('edit', { draft: { ...it, mode: it.date ? 'once' : 'weekly', date: it.date || ui.itemDay, days: it.days.length ? it.days : [A.dow(ui.itemDay || A.today())], from: it.from || '', until: it.until || '', perDay: A.hasDayTimes(it), dayTimes: { ...(it.dayTimes || {}) } }, back: 'item' }); break; }
    case 'cancel': go(v === 'task' ? (ui.back || 'day') : v === 'edit' ? (ui.back || 'day') : 'day', { draft: null }); break;
    case 'kind': ui.draft.kind = el.dataset.v; if (el.dataset.v === 'match' && ui.back !== 'item') ui.draft.mode = 'once'; render(); break;
    case 'mode': ui.draft.mode = el.dataset.v; render(); break;
    case 'who': ui.draft.person_ids = toggle(ui.draft.person_ids, el.dataset.id); render(); break;
    case 'wday': ui.draft.days = toggle(ui.draft.days, +el.dataset.d); render(); break;
    case 'weeks': ui.draft.weeks = el.dataset.v; render(); break;
    case 'perday': {
      const d = ui.draft; d.perDay = el.dataset.v === 'perday';
      if (d.perDay) for (const n of d.days) { const x = (d.dayTimes || {})[n]; if (!x || (!x.start && !x.end)) d.dayTimes = { ...d.dayTimes, [n]: { start: d.start || '', end: d.end || '' } }; }
      else { const f = A.WEEK_ORDER.find(n => d.days.includes(n) && (d.dayTimes || {})[n]); if (f !== undefined && !d.start) { d.start = d.dayTimes[f].start; d.end = d.dayTimes[f].end; } }
      render(); break;
    }
    case 'saveitem': run(el, async () => {
      const d = ui.draft, c = A.cleanItem({ ...d, date: d.mode === 'once' ? d.date : null, days: d.mode === 'once' ? [] : d.days });
      const id = await saveItem(c, ui.id && ui.back === 'item' ? ui.id : null);
      if (c.date) ui.day = c.date;
      go(ui.back === 'item' ? 'item' : 'day', { id, draft: null }); toast('Bewaard.');
    }); break;
    case 'skip': case 'unskip': run(el, async () => {
      const it = data.items.find(x => x.id === ui.id), skip = a === 'skip' ? [...new Set([...(it.skip || []), ui.itemDay])].sort() : (it.skip || []).filter(x => x !== ui.itemDay);
      await setItem(it.id, { skip }); render(); toast(a === 'skip' ? 'Gaat deze keer niet door.' : 'Gaat toch door.');
    }); break;
    case 'delitem': { const it = data.items.find(x => x.id === ui.id); if (confirm(`"${it.title}" verwijderen${it.date ? '' : ' (alle weken)'}?`)) run(el, async () => { await setItem(it.id, { deleted: true }); go(ui.from || 'day'); toast('Verwijderd.'); }); break; }
    case 'tick': run(null, () => toggleTask(el.dataset.id)); break;
    case 'newtask': go('task', { draft: { id: null, person_id: ui.pid || (data.people.length === 1 ? data.people[0].id : ''), kind: 'homework', subject: '', text: '', due: '' }, back: v }); break;
    case 'task': { const t = data.tasks.find(x => x.id === el.dataset.id); go('task', { draft: { ...t, due: t.due || '' }, back: v }); break; }
    case 'taskwho': ui.draft.person_id = el.dataset.id; render(); break;
    case 'taskkind': ui.draft.kind = el.dataset.v; render(); break;
    case 'due': ui.draft.due = el.dataset.v; render(); break;
    case 'savetask': run(el, async () => { await saveTask(ui.draft, ui.draft.id); go(ui.back || 'day', { draft: null }); toast('Bewaard.'); }); break;
    case 'deltask': if (confirm('Dit huiswerk verwijderen?')) run(el, async () => { need(); const [row] = await patch('agenda_tasks', ui.draft.id, { deleted: true }); upsertLocal(data.tasks, row); go(ui.back || 'day', { draft: null }); }); break;
    case 'color': ui.draft.name = (document.getElementById('p-name') || {}).value || ''; ui.draft.user_id = (document.getElementById('p-user') || {}).value || ''; ui.draft.color = el.dataset.v; render(); break;
    case 'editperson': { const p = person(el.dataset.id); ui.draft = { id: p.id, name: p.name, color: p.color, user_id: p.user_id || '' }; render(); break; }
    case 'saveperson': run(el, async () => {
      need();
      const name = ((document.getElementById('p-name') || {}).value || '').trim(), user_id = (document.getElementById('p-user') || {}).value || null;
      if (!name) throw new Error('Vul een naam in.');
      const body = { name, color: ui.draft.color, user_id };
      const [row] = ui.draft.id ? await patch('agenda_people', ui.draft.id, body) : await post('agenda_people', { ...body, team_id: FAMILY, sort: data.people.length });
      upsertLocal(data.people, row); ui.draft = null; render();
    }); break;
    case 'delperson': if (confirm(`${ui.draft.name} uit de agenda halen? Het huiswerk van ${ui.draft.name} gaat ook weg.`)) run(el, async () => {
      need(); const [row] = await patch('agenda_people', ui.draft.id, { deleted: true }); upsertLocal(data.people, row);
      data.tasks = data.tasks.filter(t => t.person_id !== row.id); persist(); if (ui.pid === row.id) ui.pid = ''; ui.draft = null; render();
    }); break;
    case 'timetable': go('timetable', { draft: { person_id: ui.pid || (data.people[0] || {}).id || '', day: [1, 2, 3, 4, 5].includes(A.dow(ui.day)) ? A.dow(ui.day) : 1, text: '', ...A.schoolYear() } }); break;
    case 'ttwho': ui.draft.person_id = el.dataset.id; render(); break;
    case 'newlink': go('link', { draft: { id: null, person_id: ui.pid || (data.people.length === 1 ? data.people[0].id : ''), kind: 'lesson', label: 'Magister', url: '', enabled: true } }); break;
    case 'link': { const l = link(el.dataset.id); if (l) go('link', { draft: { id: l.id, user_id: l.user_id, person_id: (l.config || {}).person_id || '', kind: (l.config || {}).kind === 'lesson' ? 'lesson' : 'other', label: l.label, url: '', enabled: l.enabled } }); break; }
    case 'linkwho': ui.draft.person_id = el.dataset.id; render(); break;
    case 'linkkind': { const d = ui.draft, defaults = ['', 'Magister', 'Agenda']; if (defaults.includes(d.label.trim())) d.label = el.dataset.v === 'lesson' ? 'Magister' : 'Agenda'; d.kind = el.dataset.v; render(); break; }
    case 'linkon': ui.draft.enabled = !ui.draft.enabled; render(); break;
    case 'savelink': run(el, async () => {
      need();
      const d = ui.draft;
      if (!d.person_id) throw new Error('Kies voor wie de agenda is.');
      if (!d.label.trim()) throw new Error('Geef de link een naam.');
      if (!d.id && !d.url.trim()) throw new Error('Plak de link van de agenda.');
      const id = await api('/rest/v1/rpc/integration_save', { method: 'POST', body: { p_id: d.id, p_team: FAMILY, p_type: 'ical', p_label: d.label.trim(), p_config: { person_id: d.person_id, kind: d.kind }, p_url: d.url.trim() || null, p_enabled: d.enabled } });
      toast('Bewaard. Agenda ophalen…');
      const r = d.enabled ? await syncLink(id).catch(e => ({ ok: false, error: e.message })) : (await load(), {});
      go('links', { draft: null });
      if (d.enabled) toast(r.ok ? `${r.count} ${r.count === 1 ? 'afspraak' : 'afspraken'} opgehaald.` : r.error || 'Ophalen lukte niet.', r.ok ? '' : 'err');
    }); break;
    case 'synclink': run(el, async () => {
      need(); const r = await syncLink(ui.draft.id);
      render(); toast(r.ok ? `Bijgewerkt: ${r.count} ${r.count === 1 ? 'afspraak' : 'afspraken'}${r.added || r.changed || r.removed ? ` (${[r.added && `${r.added} nieuw`, r.changed && `${r.changed} gewijzigd`, r.removed && `${r.removed} weg`].filter(Boolean).join(', ')})` : ''}.` : r.error || 'Bijwerken lukte niet.', r.ok ? '' : 'err');
    }); break;
    case 'dellink': if (confirm(`"${ui.draft.label}" verwijderen? Alle afspraken uit deze link verdwijnen uit de agenda.`)) run(el, async () => {
      need(); await api('/rest/v1/rpc/integration_delete', { method: 'POST', body: { p_id: ui.draft.id } }); await load(); go('links', { draft: null }); toast('Verwijderd.');
    }); break;
    case 'ttday': ui.draft.day = +el.dataset.d; render(); break;
    case 'savett': run(el, async () => {
      need();
      const d = ui.draft, { lessons, bad } = A.parseTimetable(d.text);
      if (!d.person_id) throw new Error('Kies voor wie het rooster is.');
      if (!lessons.length) throw new Error(bad.length ? `Niet herkend: ${bad[0]}` : 'Zet er minstens één les in.');
      const rows = lessons.map(l => toRow(A.cleanItem({ kind: 'lesson', title: l.title, place: l.place, person_ids: [d.person_id], start: l.start, end: l.end, days: [d.day], from: d.from, until: d.until })));
      const out = await api('/rest/v1/agenda_items', { method: 'POST', headers: { Prefer: 'return=representation' }, body: rows.map(r => ({ ...r, team_id: FAMILY })) });
      for (const r of out || []) upsertLocal(data.items, fromRow(r));
      toast(`${out.length} ${out.length === 1 ? 'les' : 'lessen'} op ${A.DAYNAMES[d.day]} bewaard.`);
      d.text = ''; d.day = d.day < 5 ? d.day + 1 : d.day; render();
    }); break;
  }
});
document.addEventListener('input', ev => { if (ev.target.id === 'tt-text') { readTt(); const pos = ev.target.selectionStart; render(); const t = $('#tt-text'); if (t) { t.focus(); t.setSelectionRange(pos, pos); } } });
document.addEventListener('change', ev => { if (ev.target.id === 't-subject') { readTaskDraft(); render(); } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (ui.view === 'day' && !busy) ui.day = A.today(); load(); } });
addEventListener('online', () => load());

render();
load();
