// Training — app (voorlopig één sport: Pilates, programma "Pilates 30").
// Overgenomen uit de losse Pilates-pagina; gedrag van de speler is gelijk gebleven. Nieuw:
//   - vaste trainingsdagen per week; de lessen worden daarover ingepland (program.js)
//   - op een andere dag mag je altijd een les doen: dat is een bonustraining
//   - trainingen per gezin: samen (meerdere deelnemers) of apart; Supabase-tabel training_tracks, lokaal eerst
import { storage, account, api, applyTheme, esc, registerSW, canUse } from '../shared/family.js';
import * as P from './program.js';
import { E, WEEKS, DAYS, PHASES, LESSON_SECONDS, planFor, lessonTitle, PROGRAM } from './sports/pilates/index.js';

applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
registerSW('../');

const TOTAL = PROGRAM.total;
const APP = 'training';
const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
const blockName = w => WEEKS[w].t.split(' · ')[1];
const ICON_BACK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const ICON_CHEV = '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

/* ---------- trainingen per gezin ----------
   Een "training" (track) is één voortgang in een programma, met één of meer deelnemers uit het gezin:
   samen trainen = één training met meerdere deelnemers, apart = ieder een eigen training.
   Lokaal eerst (werkt offline), gesynchroniseerd met Supabase (tabel training_tracks, per gezin).
   Zonder login of gezin: één training op deze telefoon. */
const me = account();
const FAMILY = me && me.teamId ? me.teamId : null;
const SCOPE = FAMILY || 'local';
const TKEY = `${SCOPE}:tracks`, AKEY = `${SCOPE}:active:${PROGRAM.id}`, MKEY = `${SCOPE}:members`;
const nowIso = () => new Date().toISOString();
// Tijden van telefoon (…Z) en server (…+00:00, microseconden) vergelijkbaar maken.
const ms = s => s ? Date.parse(String(s).replace(/(\.\d{3})\d+/, '$1').replace(' ', 'T')) || 0 : 0;
const defaultId = me && FAMILY ? `${PROGRAM.id}:${me.userId}` : `${PROGRAM.id}:local`;
let tracks = storage.get(APP, TKEY, {}) || {};
let members = storage.get(APP, MKEY, []) || [];   // [{ user_id, name }]
const isEmpty = t => !t.data.log.length && !t.data.settings.days.length && !t.data.resetAt;
const newTrack = (id, participants) => ({ id, program: PROGRAM.id, name: '', participants, data: P.emptyProgress(), deleted: false, u: nowIso(), dirty: true });
for (const t of Object.values(tracks)) t.data = P.normalize(t.data);
const mine = () => Object.values(tracks).filter(t => t.program === PROGRAM.id && !t.deleted && (!FAMILY || t.participants.includes(me.userId)));

// Eerder zonder gezin getraind op deze telefoon: die voortgang gaat mee naar je eigen training in het gezin.
if (FAMILY) {
  const loc = (storage.get(APP, 'local:tracks', {}) || {})[`${PROGRAM.id}:local`];
  if (loc && !isEmpty({ data: P.normalize(loc.data) })) {
    if (!tracks[defaultId]) tracks[defaultId] = newTrack(defaultId, [me.userId]);
    tracks[defaultId].data = P.merge(tracks[defaultId].data, loc.data); tracks[defaultId].dirty = true;
  }
  storage.remove(APP, 'local:tracks');
}
if (!mine().length) tracks[defaultId] = newTrack(defaultId, FAMILY ? [me.userId] : []);
let activeId = storage.get(APP, AKEY);
function pickActive() {
  const list = mine();
  if (!list.length) { // nergens (meer) deelnemer: eigen training terugzetten
    const t = tracks[defaultId] || newTrack(defaultId, []);
    tracks[defaultId] = Object.assign(t, { deleted: false, participants: FAMILY ? [...new Set([...t.participants, me.userId])] : [] });
  }
  if (!list.some(t => t.id === activeId)) activeId = (mine().find(t => !isEmpty(t)) || mine()[0]).id;
}
pickActive();
let prog = tracks[activeId].data;
const track = () => tracks[activeId];
const persist = () => { if (!storage.set(APP, TKEY, tracks)) alert('Opslaan op deze telefoon is mislukt.'); storage.set(APP, AKEY, activeId); };
let localVersion = 0;

function save() {
  localVersion++;
  track().data = prog; track().dirty = true;
  persist();
  scheduleSync(800);
}
function switchTrack(id) { activeId = id; prog = track().data; persist(); }

// Naam van een gezinslid; namen van alle deelnemers vormen de naam van een training.
const memberName = id => (id === (me && me.userId) ? me.memberName : (members.find(m => m.user_id === id) || {}).name) || 'Gezinslid';
const trackName = t => !FAMILY ? 'Ik' : t.participants.length ? t.participants.map(memberName).join(' & ') : (t.name || 'Training');

let sync = { state: FAMILY ? 'idle' : 'local' }, syncing = false, syncTimer = null;
function scheduleSync(ms) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms); }
async function syncNow() {
  if (!FAMILY || syncing) return;
  syncing = true;
  const v = localVersion;
  let changedHere = false;
  try {
    const [rows, mem] = await Promise.all([
      api(`/rest/v1/training_tracks?team_id=eq.${FAMILY}&program=eq.${PROGRAM.id}&select=id,name,participants,data,deleted,updated_at`),
      api(`/rest/v1/team_members?team_id=eq.${FAMILY}&select=user_id,name&order=joined_at`).catch(() => null),
    ]);
    if (mem) { members = mem; storage.set(APP, MKEY, members); }
    const remote = new Map((rows || []).map(r => [r.id, r]));
    for (const r of remote.values()) {
      const t = tracks[r.id];
      if (!t) { tracks[r.id] = { id: r.id, program: PROGRAM.id, name: r.name, participants: r.participants || [], data: P.normalize(r.data), deleted: r.deleted, u: r.updated_at }; changedHere = true; continue; }
      const merged = P.merge(t.data, r.data);
      if (!P.same(merged, t.data)) { t.data = merged; changedHere = true; }
      if (ms(r.updated_at) > ms(t.u)) { Object.assign(t, { name: r.name, participants: r.participants || [], deleted: r.deleted, u: r.updated_at }); changedHere = true; }
    }
    // Wat hier nieuwer of anders is: terugschrijven. Een lege eigen training sturen we niet mee.
    const out = [];
    for (const t of Object.values(tracks)) {
      if (t.program !== PROGRAM.id) continue;
      const r = remote.get(t.id);
      if (!r && isEmpty(t) && t.participants.length <= 1 && !t.deleted) continue;
      if (r && P.same(r.data, t.data) && ms(r.updated_at) >= ms(t.u)) { delete t.dirty; continue; }
      out.push({ team_id: FAMILY, id: t.id, program: t.program, name: trackName(t), participants: t.participants, data: t.data, deleted: !!t.deleted, updated_at: t.u });
    }
    if (out.length) await api('/rest/v1/training_tracks?on_conflict=team_id,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: out });
    if (v === localVersion) for (const t of Object.values(tracks)) delete t.dirty; else scheduleSync(500);
    const before = activeId; pickActive(); if (before !== activeId) changedHere = true;
    prog = track().data;
    persist();
    sync = { state: 'ok', at: new Date() };
  } catch (e) {
    sync = { state: e.auth ? 'auth' : (e instanceof TypeError || !navigator.onLine) ? 'offline' : 'error', msg: e.message };
  } finally { syncing = false; }
  if (changedHere && view !== 'session') render();
  else { const el = document.getElementById('syncline'); if (el) el.innerHTML = syncText(); }
}
function syncText() {
  if (!me) return 'Alleen op deze telefoon. <a href="../?login">Log in</a> om samen te trainen en je voortgang op al je telefoons te bewaren.';
  if (!FAMILY) return 'Alleen op deze telefoon. <a href="../?view=family">Sluit je aan bij een gezin</a> om samen te trainen.';
  const who = `Gezin ${esc(me.teamName)}`;
  if (sync.state === 'ok') return `${who} · bijgewerkt om ${sync.at.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
  if (sync.state === 'offline') return `${who} · geen verbinding, wordt later bijgewerkt`;
  if (sync.state === 'auth') return 'Je bent uitgelogd. <a href="../?login">Log opnieuw in</a>; je voortgang blijft op deze telefoon bewaard.';
  if (sync.state === 'error') return `${who} · bijwerken mislukt: ${esc(sync.msg)}`;
  return `${who} · bijwerken…`;
}

/* ---------- scherm ---------- */
const $ = s => document.querySelector(s);
let view = P.hasSchedule(prog) ? 'home' : 'days', cur = 1, S = null, timer = null, AC = null, muted = false, confirmBox = '', pick = null, lastDone = null;

const navBar = (left, title = '') => `<header class="nav" id="nav"><div class="nav-l">${left || ''}</div><div class="nav-t">${title}</div><div class="nav-r"></div></header>`;
const hubLink = () => `<a class="nb back" href="../" aria-label="Naar alle apps">${ICON_BACK}<span>Apps</span></a>`;
const backTo = (a, txt) => `<button class="nb back" data-a="${a}">${ICON_BACK}<span>${txt}</span></button>`;
const lt = (t, sub) => `<div class="lt"><h1 tabindex="-1">${t}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const daysText = days => P.WEEK_ORDER.filter(d => days.includes(d)).map(d => P.DSH[d]).join(', ');

function cues(e) {
  if (e.h || e.z) return `<div class="cues"><div class="cue h"><b>Hij</b>${e.h || 'Zoals hierboven.'}</div><div class="cue z"><b>Zij</b>${e.z || 'Zoals hierboven.'}</div></div>`;
  return `<div class="same">Hetzelfde voor jullie allebei.</div>`;
}

function render() {
  const a = $('#app');
  if (!canUse('training')) { a.innerHTML = navBar(hubLink()) + '<main>' + lt('Training', esc(me.teamName)) + '<div class="card"><p>Training staat niet aan voor jou in dit gezin. Een beheerder kan de app aanzetten bij <b>Gezin → Apps</b> in het startscherm.</p><a class="btn" href="../?view=family">Naar gezin</a></div></main>'; return; }
  if (view === 'home') a.innerHTML = home();
  else if (view === 'days') a.innerHTML = daysView();
  else if (view === 'people') a.innerHTML = peopleView();
  else if (view === 'day') a.innerHTML = dayView();
  else if (view === 'session') { a.innerHTML = sessionView(); updateSession(); }
  else if (view === 'done') a.innerHTML = doneView();
  window.scrollTo(0, 0);
  onScroll();
}

function stats() {
  return `<div class="stats"><div class="stat"><b>${P.doneCount(prog, TOTAL)}/${TOTAL}</b><span>lessen klaar</span></div>
  <div class="stat"><b>${P.streak(prog)}</b><span>op rij</span></div>
  <div class="stat"><b>${P.bonusCount(prog)}</b><span>bonus</span></div>
  <div class="stat"><b>${prog.log.length * PROGRAM.minutes}</b><span>minuten</span></div></div>`;
}

function weekStrip() {
  const t = P.today(), ws = P.weekStart(t);
  let h = '<div class="week" aria-label="Deze week">';
  for (let i = 0; i < 7; i++) {
    const d = P.addDays(ws, i), s = P.sessionsOn(prog, d), train = P.isTrainingDay(prog, d);
    const cls = [train ? 'train' : '', s.length ? (s.some(x => !x.bonus) ? 'done' : 'bonus') : '', d === t ? 'today' : ''].join(' ');
    const lbl = `${P.DAYNAMES[P.dow(d)]}${train ? ', trainingsdag' : ''}${s.length ? ', getraind' : ''}`;
    h += `<div class="wd ${cls}" aria-label="${lbl}">${P.DSH[P.dow(d)]}<b>${P.pd(d).getDate()}</b><span class="dot"></span></div>`;
  }
  return h + '</div>';
}

function nextCard() {
  const t = P.today(), nl = P.nextLesson(prog, TOTAL);
  if (!nl) return `<div class="card"><h2>Programma voltooid 🎉</h2><p class="muted">Alle ${TOTAL} lessen gedaan. Je kunt elke les opnieuw doen.</p></div>`;
  const d = DAYS[nl - 1], plan = P.schedule(prog, TOTAL, t)[0], trainedToday = P.sessionsOn(prog, t).length > 0;
  const meta = `<p class="muted small">${blockName(d.w)} · ${PROGRAM.minutes} min${d.rest ? ' · rustig' : ''}</p>`;
  if (P.isTrainingDay(prog, t) && !trainedToday) {
    return `<div class="card"><span class="badge">${P.doneCount(prog, TOTAL) ? 'Vandaag' : 'Begin hier'}</span><h2>Les ${nl}: ${esc(lessonTitle(nl))}</h2>${meta}
    <button class="btn" data-a="open" data-n="${nl}">Bekijk &amp; start</button></div>`;
  }
  if (trainedToday) {
    return `<div class="card"><span class="badge">Vandaag gedaan ✓</span><h2>Volgende: les ${nl} op ${P.fmtShort(plan.d)}</h2><p class="muted small">${esc(lessonTitle(nl))}</p>
    <button class="btn sec" data-a="open" data-n="${nl}">Bekijk les ${nl}</button></div>`;
  }
  return `<div class="card"><span class="badge bonus">Vrije dag</span><h2>Volgende: les ${nl} op ${P.fmtShort(plan.d)}</h2>
  <p class="muted small">Komt het vandaag beter uit? Doe les ${nl} nu als bonustraining. Je loopt dan voor op je schema.</p>
  <button class="btn sec" data-a="open" data-n="${nl}">Bonustraining: les ${nl}</button></div>`;
}

function home() {
  const nl = P.nextLesson(prog, TOTAL), done = P.doneMap(prog);
  const planned = Object.fromEntries(P.schedule(prog, TOTAL).map(x => [x.les, x.d]));
  let h = navBar(hubLink()) + '<main>' + lt(PROGRAM.name, `Training · ${PROGRAM.sport}${FAMILY ? ' · ' + esc(trackName(track())) : ''}`);
  h += nextCard() + weekStrip() + stats();
  WEEKS.forEach((w, wi) => {
    const ls = DAYS.map((d, i) => [d, i + 1]).filter(x => x[0].w === wi);
    h += `<div class="blk"><b>Blok ${wi + 1} · ${blockName(wi)}</b><span>${ls.filter(x => done[x[1]]).length}/${ls.length}</span></div><div class="blk-i">${w.i}</div><div class="grid">`;
    ls.forEach(([d, i]) => {
      const lbl = `Les ${i}${done[i] ? ', gedaan' : planned[i] ? ', gepland op ' + P.fmtShort(planned[i]) : ''}`;
      h += `<button class="tile${d.rest ? ' rest' : ''}${done[i] ? ' done' : ''}${i === nl ? ' cur' : ''}" data-a="open" data-n="${i}" aria-label="${lbl}">${done[i] ? '✓' : i}</button>`;
    });
    h += '</div>';
  });
  h += `<section class="sec"><h2 class="sec-h">Instellingen</h2><div class="grp">
    <button class="cell" data-a="days"><span class="tx"><span class="tt">Trainingsdagen</span></span><span class="tr">${daysText(prog.settings.days)}</span>${ICON_CHEV}</button>
    <button class="cell" data-a="people"><span class="tx"><span class="tt">Wie doen er mee?</span></span><span class="tr">${esc(trackName(track()))}</span>${ICON_CHEV}</button>
  </div><p class="sec-f" id="syncline">${syncText()}</p></section>`;
  h += `<section class="sec info"><h2 class="sec-h">Goed om te weten</h2>
  <details><summary><span>Man &amp; vrouw</span><span>+</span></summary><p>Pilates is in de basis voor iedereen hetzelfde. Waar het verschil maakt, zie je bij de oefening aparte tips voor <b style="color:var(--him)">hem</b> en <b style="color:var(--her)">haar</b>. Dat zijn algemene tendensen (bijvoorbeeld strakkere hamstrings en heupen, of accent op billen en bekkenbodem). Jullie eigen lichaam telt zwaarder dan de tendens.</p></details>
  <details><summary><span>Hoe is een les opgebouwd?</span><span>+</span></summary><p>5 min warming-up, 20 min hoofdtraining, 5 min cooldown. Elk blok wordt het zwaarder, en elke 7e les is een rustige mobiliteitsles. Bij oefeningen op één kant wisselt de app halverwege met een geluid.</p></details>
  <details><summary><span>Trainingsdagen en bonus</span><span>+</span></summary><p>De lessen worden ingepland op jouw vaste trainingsdagen. Mis je een dag, dan schuift de rest gewoon op. Op een andere dag kun je altijd een les doen: dat is een bonustraining en je loopt dan voor op schema.</p></details>
  <details><summary><span>Veiligheid</span><span>+</span></summary><p>Stop bij pijn (spierbrand mag) en kies de makkelijkere variant. Bij blessures, rugklachten, zwangerschap of twijfel: overleg eerst met je huisarts of fysiotherapeut.</p></details>
  <details><summary><span>Wat heb je nodig?</span><span>+</span></summary><p>Een mat of zacht tapijt, een handdoek, water en ruimte om naast elkaar te liggen. Zet geluid aan voor de pieptonen.</p></details>
  </section>`;
  h += confirmBox === 'reset'
    ? `<div class="card"><p>Alle voortgang van ${PROGRAM.name} wissen${me ? ', ook op je andere telefoons' : ''}? De trainingsdagen blijven staan.</p><div class="row"><button class="btn sec" data-a="noreset">Annuleren</button><button class="btn" style="background:var(--red);color:#fff" data-a="yesreset">Wissen</button></div></div>`
    : `<div style="margin-top:18px"><button class="btn danger" data-a="reset">Voortgang resetten</button></div>`;
  return h + '</main>';
}

function daysView() {
  if (!pick) pick = prog.settings.days.slice();
  const first = !P.hasSchedule(prog);
  let h = navBar(first && mine().length <= 1 ? hubLink() : backTo('home', 'Overzicht'), first ? '' : 'Trainingsdagen') + '<main>';
  h += lt(first ? PROGRAM.name : 'Trainingsdagen', first ? 'Op welke dagen train je meestal?' : 'Op welke dagen train je meestal?');
  h += `<div class="card"><div class="daypick">${P.WEEK_ORDER.map(d => `<button data-a="pick" data-d="${d}" aria-pressed="${pick.includes(d)}" aria-label="${P.DAYNAMES[d]}">${P.DSH[d]}</button>`).join('')}</div>`;
  if (pick.length) {
    const tmp = P.normalize(prog); tmp.settings.days = pick.slice();
    const s = P.schedule(tmp, TOTAL), end = s.length ? s[s.length - 1].d : null;
    h += `<p class="muted small" style="margin-top:12px">${pick.length} ${pick.length === 1 ? 'dag' : 'dagen'} per week${end ? ` · klaar rond ${P.fmtShort(end)}` : ''}${s.length ? ` · eerste les ${P.fmtShort(s[0].d)}` : ''}.</p>`;
  } else h += `<p class="muted small" style="margin-top:12px">Kies minstens één dag.</p>`;
  h += `<button class="btn" data-a="savedays" ${pick.length ? '' : 'disabled'}>${first ? 'Begin' : 'Bewaren'}</button></div>`;
  h += `<p class="sec-f">Dit stel je één keer in en pas je alleen aan als je week verandert. Op andere dagen kun je altijd een les doen als bonustraining.</p>`;
  return h + '</main>';
}

function peopleView() {
  let h = navBar(backTo('home', 'Overzicht'), 'Wie doen er mee?') + '<main>' + lt('Wie doen er mee?', 'Samen trainen of ieder apart');
  if (!FAMILY) return h + `<div class="card"><p>${me ? '<a href="../?view=family">Sluit je aan bij een gezin</a>' : '<a href="../?login">Log in</a> en sluit je aan bij een gezin'} om samen te trainen. Iedereen die meedoet aan een training heeft dan dezelfde voortgang, op elke telefoon.</p></div></main>`;
  const list = mine();
  h += `<section class="sec"><h2 class="sec-h">Jouw trainingen</h2><div class="grp">${list.map(t => `<button class="cell" data-a="track" data-id="${esc(t.id)}"><span class="tx"><span class="tt">${esc(trackName(t))}</span><span class="st">${esc(P.status(t.data, TOTAL).line)}</span></span>${t.id === activeId ? '<span class="tr" aria-label="actief">✓</span>' : ''}</button>`).join('')}</div>
  <p class="sec-f">Tik om te wisselen. Samen en apart kan naast elkaar: bijvoorbeeld samen met je partner én een eigen training.</p></section>`;
  const parts = track().participants;
  h += `<section class="sec"><h2 class="sec-h">Doen mee aan ${esc(trackName(track()))}</h2><div class="grp">`;
  h += members.length ? members.map(m => {
    const self = m.user_id === me.userId, on = parts.includes(m.user_id);
    return `<button class="cell" data-a="member" data-id="${esc(m.user_id)}" ${self ? 'disabled' : ''} aria-pressed="${on}"><span class="tx"><span class="tt">${esc(memberName(m.user_id))}${self ? ' (jij)' : ''}</span></span><span class="tr">${on ? '✓' : ''}</span></button>`;
  }).join('') : '<div class="cell"><span class="tx muted">Gezinsleden laden…</span></div>';
  h += `</div><p class="sec-f">Wie meedoet, ziet deze training en de voortgang op de eigen telefoon. Jij blijft altijd deelnemer.</p></section>`;
  h += `<div style="margin-top:18px"><button class="btn sec" data-a="newtrack">Nieuwe training, alleen ik</button></div>`;
  return h + '</main>';
}

function dayView() {
  const d = DAYS[cur - 1], items = planFor(cur), t = P.today(), done = P.doneMap(prog)[cur];
  const plan = P.schedule(prog, TOTAL).find(x => x.les === cur), bonus = P.isBonusDay(prog, t);
  let h = navBar(backTo('home', 'Overzicht')) + '<main>' + lt(`Les ${cur}`, esc(lessonTitle(cur)));
  h += `<div style="padding:0 4px"><span class="badge">${blockName(d.w)}</span><span class="badge">${PROGRAM.minutes} min</span>${d.rest ? '<span class="badge rest">Rustig</span>' : ''}${done ? `<span class="badge">✓ gedaan ${P.fmtShort(done)}</span>` : plan ? `<span class="badge rest">Gepland ${P.fmtShort(plan.d)}</span>` : ''}${bonus ? '<span class="badge bonus">Vandaag = bonus</span>' : ''}</div>`;
  h += `<button class="btn" style="margin:10px 0" data-a="start">${done ? 'Opnieuw doen' : bonus ? 'Start als bonustraining' : 'Start les'}</button>`;
  [0, 1, 2].forEach(p => {
    const it = items.filter(x => x.ph === p);
    h += `<div class="ph"><span>${PHASES[p]}</span><span>${fmt(it.reduce((a, x) => a + x.s, 0))}</span></div>`;
    it.forEach(x => { const e = E[x.id]; h += `<details><summary><span>${e.n}${x.side ? ' ⇄' : ''}</span><span>${fmt(x.s)}</span></summary><p>${e.d}<br><i>${e.p} · ${e.r}</i></p>${cues(e)}</details>`; });
  });
  h += `<p class="sec-f">⇄ = oefening per kant; de app geeft halverwege een signaal.</p>`;
  if (!done) h += `<button class="btn plain" style="margin-top:14px" data-a="mark">Markeer als gedaan zonder de app</button>`;
  return h + '</main>';
}

function sessionView() {
  const it = S.items[S.i], e = E[it.id], nx = S.items[S.i + 1];
  return `<main class="player"><div class="row" style="margin-bottom:6px"><span class="muted small">Les ${cur} · ${PHASES[it.ph]}</span><span style="text-align:right"><button class="nb" data-a="mute" style="min-height:32px;padding:0">${muted ? '🔇 Geluid uit' : '🔊 Geluid aan'}</button></span></div>
  <div class="bar"><i id="tb"></i></div><div class="tot"><span id="te">0:00</span><span id="tr">30:00</span></div>
  <div class="ex"><span class="badge">${e.p}</span><h1>${e.n}</h1>
  <div class="ring"><svg width="200" height="200" viewBox="0 0 120 120"><circle cx="60" cy="60" r="54" fill="none" stroke="var(--fill)" stroke-width="8"/><circle id="rg" cx="60" cy="60" r="54" fill="none" stroke="var(--green)" stroke-width="8" stroke-linecap="round" stroke-dasharray="339.29" stroke-dashoffset="0"/></svg><div class="t" id="tm">0:00</div></div>
  ${it.side ? `<div class="side" id="sd"></div><div class="flip" id="fl" style="display:none">Wissel van kant ⇄</div>` : ''}
  <p>${e.d}</p><p class="muted"><i>${e.r}</i></p></div>
  ${cues(e)}
  <div class="ctl"><button class="btn sec" data-a="prev" aria-label="Vorige">◀◀</button><button class="btn" id="pp" data-a="pause">${S.run ? 'Pauze' : 'Verder'}</button><button class="btn sec" data-a="skip" aria-label="Volgende">▶▶</button></div>
  <div class="next">${nx ? 'Straks: ' + E[nx.id].n : 'Laatste oefening'}</div>
  ${confirmBox === 'stop' ? `<div class="card"><p>Les stoppen? Deze les telt dan niet mee.</p><div class="row"><button class="btn sec" data-a="nostop">Doorgaan</button><button class="btn" data-a="yesstop">Stoppen</button></div></div>` : `<button class="btn plain" style="margin-top:16px" data-a="stop">Stoppen</button>`}</main>`;
}

function updateSession() {
  if (!S) return; const it = S.items[S.i];
  const done = S.items.slice(0, S.i).reduce((a, x) => a + x.s, 0) + (it.s - S.left);
  const q = (i, f) => { const x = $(i); if (x) f(x); };
  q('#tm', x => x.textContent = fmt(Math.ceil(S.left)));
  q('#rg', x => x.setAttribute('stroke-dashoffset', (339.29 * (1 - S.left / it.s)).toFixed(1)));
  q('#tb', x => x.style.width = (done / LESSON_SECONDS * 100) + '%');
  q('#te', x => x.textContent = fmt(done)); q('#tr', x => x.textContent = '−' + fmt(LESSON_SECONDS - done));
  q('#sd', x => x.textContent = S.flip ? 'Kant 2 van 2' : 'Kant 1 van 2');
  q('#fl', x => x.style.display = (S.flip && S.flashUntil > performance.now()) ? 'block' : 'none');
}

function doneView() {
  const nl = P.nextLesson(prog, TOTAL), all = !nl, plan = P.schedule(prog, TOTAL)[0];
  return `<main><div class="big">${all ? '🏆' : lastDone && lastDone.bonus ? '⭐' : '🌿'}</div><div class="lt center"><h1 tabindex="-1">${all ? `${TOTAL} lessen gehaald!` : 'Les ' + cur + ' klaar'}</h1></div>
  <p class="muted center">${all ? 'Wat een prestatie, jullie hebben het samen volgehouden.' : lastDone && lastDone.bonus ? 'Bonustraining gedaan: je loopt voor op schema. Drink wat water en rek jullie even uit.' : 'Goed gedaan, samen. Drink wat water en rek jullie even uit.'}</p>
  ${stats()}
  <div style="height:16px"></div>${nl ? `<button class="btn" data-a="open" data-n="${nl}">Volgende: les ${nl}${plan ? ` · ${P.fmtShort(plan.d)}` : ''}</button>` : ''}<button class="btn sec" style="margin-top:10px" data-a="home">Naar overzicht</button></main>`;
}

/* ---------- speler ---------- */
function beep(f, d) { if (muted || !AC) return; try { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = f; g.gain.value = .18; o.connect(g); g.connect(AC.destination); o.start(); o.stop(AC.currentTime + d); } catch (e) {} }
function buzz() { try { navigator.vibrate && navigator.vibrate(200); } catch (e) {} }
function goTo(i) {
  if (i >= S.items.length) { finish(); return; }
  S.i = Math.max(0, i); S.left = S.items[S.i].s; S.flip = false; S.lc = null; S.last = performance.now(); S.flashUntil = 0; render();
}
function tick() {
  if (!S || !S.run) return; const now = performance.now(); S.left -= (now - S.last) / 1000; S.last = now;
  const it = S.items[S.i], c = Math.ceil(S.left);
  if (c !== S.lc) { if (c >= 1 && c <= 3) beep(660, .08); S.lc = c; }
  if (it.side && !S.flip && S.left <= it.s / 2) { S.flip = true; S.flashUntil = now + 4000; beep(990, .15); setTimeout(() => beep(990, .15), 230); buzz(); }
  if (S.left <= 0) { beep(520, .4); goTo(S.i + 1); return; }
  updateSession();
}
async function lock() { try { if (navigator.wakeLock && S) S.wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
function unlock() { try { S && S.wl && S.wl.release(); } catch (e) {} }
// Scherm-wakker-houden vervalt als de app even naar de achtergrond gaat: opnieuw aanvragen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (S) lock(); scheduleSync(300); }
});
window.addEventListener('online', () => scheduleSync(300));
function startSession() {
  try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  S = { items: planFor(cur), i: 0, left: 0, run: true, flip: false, last: performance.now() };
  view = 'session'; confirmBox = ''; lock(); goTo(0); clearInterval(timer); timer = setInterval(tick, 200); beep(700, .2);
}
function endSession() { clearInterval(timer); timer = null; unlock(); S = null; }
function complete(manual) {
  lastDone = P.record(prog, cur, P.today(), manual);
  save();
}
function finish() { endSession(); complete(false); view = 'done'; render(); }

function onScroll() { const n = document.getElementById('nav'); if (n) n.classList.toggle('scrolled', window.scrollY > 4); }
window.addEventListener('scroll', onScroll, { passive: true });

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
  if (a === 'open') { cur = +b.dataset.n; view = 'day'; render(); }
  else if (a === 'home') { view = 'home'; confirmBox = ''; render(); }
  else if (a === 'days') { pick = null; view = 'days'; render(); }
  else if (a === 'pick') { const d = +b.dataset.d; pick = pick.includes(d) ? pick.filter(x => x !== d) : [...pick, d]; render(); }
  else if (a === 'savedays') { if (!pick.length) return; P.setDays(prog, pick); pick = null; save(); view = 'home'; render(); }
  else if (a === 'people') { view = 'people'; render(); scheduleSync(0); }
  else if (a === 'track') { switchTrack(b.dataset.id); pick = null; view = P.hasSchedule(prog) ? 'home' : 'days'; render(); }
  else if (a === 'member') {
    const id = b.dataset.id, t = track();
    t.participants = t.participants.includes(id) ? t.participants.filter(x => x !== id) : [...t.participants, id];
    t.u = nowIso(); save(); render();
  }
  else if (a === 'newtrack') {
    const id = `${PROGRAM.id}:${P.uid()}`;
    tracks[id] = newTrack(id, [me.userId]); switchTrack(id); pick = null; view = 'days'; render();
  }
  else if (a === 'start') startSession();
  else if (a === 'mark') { complete(true); view = 'home'; render(); }
  else if (a === 'pause') { S.run = !S.run; S.last = performance.now(); $('#pp').textContent = S.run ? 'Pauze' : 'Verder'; }
  else if (a === 'skip') goTo(S.i + 1);
  else if (a === 'prev') { const it = S.items[S.i]; if (it.s - S.left > 3) goTo(S.i); else goTo(S.i - 1); }
  else if (a === 'mute') { muted = !muted; b.textContent = muted ? '🔇 Geluid uit' : '🔊 Geluid aan'; }
  else if (a === 'stop') { confirmBox = 'stop'; if (S) S.run = false; render(); }
  else if (a === 'nostop') { confirmBox = ''; S.run = true; S.last = performance.now(); render(); }
  else if (a === 'yesstop') { confirmBox = ''; endSession(); view = 'day'; render(); }
  else if (a === 'reset') { confirmBox = 'reset'; render(); }
  else if (a === 'noreset') { confirmBox = ''; render(); }
  else if (a === 'yesreset') { P.reset(prog); save(); confirmBox = ''; render(); }
});

render();
syncNow();
