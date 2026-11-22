// Hub van de familie-app: startscherm, inloggen, gezin (leden, rollen, apps) en algemene instellingen.
// App-specifieke instellingen blijven in de app zelf (bijv. loopdagen in Egg-sellent).
import * as F from '../shared/family.js';
import { APPS } from '../shared/apps.js';
import { ymd } from '../training/program.js';
import { RELEASES, VERSION, APP_NAMES } from '../shared/releases.js';

const { esc, storage, account, CLOUD, DEV_CODE, ROLE_LABEL } = F;
F.applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', F.applyTheme);
F.registerSW('./');

const DAYS = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MONL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const ICON_BACK = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
const CHEV = '<svg class="i chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
const FACE = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M9 9.5v1M15 9.5v1M12 9.5v3.5h-1M9.5 16a4 4 0 0 0 5 0"/></svg>';

// ui = schermstatus (niet bewaard); fam = gegevens van het gekozen gezin (leden, apps)
let ui = { view: 'home' };
let fam = null, busy = false;

const nav = (left, title = '', right = '') => `<header class="nav" id="nav"><div class="nav-l">${left}</div><div class="nav-t">${title}</div><div class="nav-r">${right}</div></header>`;
const back = (v, txt) => `<button class="nb back" data-a="go" data-v="${v}">${ICON_BACK}<span>${esc(txt)}</span></button>`;
const lt = (t, sub) => `<div class="lt"><h1 tabindex="-1">${t}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
const sec = (head, body, foot) => `<section class="sec">${head ? `<h2 class="sec-h">${head}</h2>` : ''}${body}${foot ? `<p class="sec-f">${foot}</p>` : ''}</section>`;
const grp = inner => `<div class="grp">${inner}</div>`;
const toggle = (on, a, attrs, label, disabled) => `<button class="toggle" role="switch" aria-checked="${!!on}" aria-label="${esc(label)}" data-a="${a}" ${attrs || ''} ${disabled ? 'disabled' : ''}></button>`;
const seg = (items, cur, a, attrs, disabled) => `<div class="segc" role="group">${items.map(([v, l]) => `<button data-a="${a}" data-v="${v}" ${attrs || ''} aria-pressed="${cur === v}" ${disabled ? 'disabled' : ''}>${l}</button>`).join('')}</div>`;
const val = id => ((document.getElementById(id) || {}).value || '').trim();

let toastTimer = null;
function toast(msg, kind) {
  const t = document.getElementById('toast');
  t.innerHTML = `<div class="t ${kind || ''}" role="status">${esc(msg)}</div>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.innerHTML = ''; }, 3200);
}
async function run(el, fn) {
  if (busy) return; busy = true; if (el) el.disabled = true;
  try { await fn(); } catch (e) { toast(e.message || String(e), 'err'); }
  finally { busy = false; if (el && el.isConnected) el.disabled = false; }
}
function go(view, extra) { Object.assign(ui, { view }, extra || {}); render(); window.scrollTo(0, 0); }

/* ---------- gegevens van het gezin ---------- */
async function loadFamily() {
  const a = account(); if (!a || !a.teamId) { fam = null; return; }
  const t = a.teamId;
  const [members, apps, memberApps] = await Promise.all([
    F.api(`/rest/v1/team_members?team_id=eq.${t}&select=user_id,role,name,joined_at&order=joined_at`),
    F.api(`/rest/v1/team_apps?team_id=eq.${t}&select=app,enabled`),
    F.api(`/rest/v1/team_member_apps?team_id=eq.${t}&select=user_id,app,access,role`),
  ]);
  fam = { id: t, members: members || [], apps: Object.fromEntries((apps || []).map(x => [x.app, x.enabled])), memberApps: memberApps || [] };
}
const isAdmin = () => { const a = account(); return !!(a && a.role === 'admin'); };
const memberApp = (uid, app) => (fam && fam.memberApps.find(x => x.user_id === uid && x.app === app)) || {};
// Toegang zoals de database het berekent: app aan + (eigen instelling, anders iedereen behalve kinderen).
const hasAccess = (m, app) => !!(fam && fam.apps[app]) && (memberApp(m.user_id, app).access ?? (m.role !== 'child'));
const appRole = (m, app) => memberApp(m.user_id, app).role || (m.role === 'admin' ? 'admin' : 'member');

async function refresh() {
  if (!account()) return;
  try { await F.refreshFamilies(); await loadFamily(); }
  catch (e) { if (!(e instanceof TypeError)) console.warn(e); }
  render();
}

/* ---------- schermen ---------- */
function vHome() {
  const now = new Date(), today = ymd(now), me = account(), hr = now.getHours();
  const hello = hr < 6 ? 'Goedenacht' : hr < 12 ? 'Goedemorgen' : hr < 18 ? 'Goedemiddag' : 'Goedenavond';
  const right = CLOUD ? (me ? `<button class="nb" data-a="go" data-v="family">${me.teamId ? 'Gezin' : 'Account'}</button>` : `<button class="nb" data-a="go" data-v="login">Log in</button>`) : '';
  let h = nav('', '', right) + `<main>${lt(hello, `${DAYS[now.getDay()]} ${now.getDate()} ${MONL[now.getMonth()]}${me && me.teamName ? ' · ' + esc(me.teamName) : ''}`)}`;
  if (CLOUD && F.sessionExpired()) h += `<div class="banner mb">Je sessie is verlopen. <button class="link" data-a="go" data-v="login" style="min-height:0">Log opnieuw in</button>; je gegevens op deze telefoon blijven bewaard.</div>`;
  else if (CLOUD && !me) h += `<div class="banner blue mb"><div><b>Log in</b> om je gezin te gebruiken: Egg-sellent, samen trainen en je voortgang op al je telefoons. <button class="link" data-a="go" data-v="login" style="min-height:0">Inloggen</button></div></div>`;
  else if (me && !me.teamId) h += `<div class="banner blue mb"><div><b>Nog geen gezin.</b> Maak een gezin of sluit je aan met een code. <button class="link" data-a="go" data-v="onboard" style="min-height:0">Verder</button></div></div>`;
  const list = APPS.filter(app => F.canUse(app.id));
  h += '<div class="tiles">';
  for (const app of list) {
    let s = { line: '', sub: '' };
    try { s = app.status({ today, account: me, storage }) || s; } catch (e) { console.warn(app.id, e); }
    h += `<a class="tile${s.today ? ' now' : ''}" href="${app.route}"><span class="ic" aria-hidden="true">${app.icon}</span><span class="nm">${esc(app.name)}</span><span class="ln">${esc(s.line)}</span>${s.sub ? `<span class="sb">${esc(s.sub)}</span>` : ''}</a>`;
  }
  h += '</div>';
  if (me && me.teamId && !list.length) h += `<p class="sec-f">Er staan nog geen apps aan voor dit gezin.${isAdmin() ? ' Zet ze aan bij Gezin → Apps.' : ' Vraag een beheerder om ze aan te zetten.'}</p>`;
  // Na een update: één keer melden wat er nieuw is.
  const seen = storage.get('hub', 'seenVersion');
  if (seen && seen !== VERSION) h += `<div class="banner blue" style="margin-top:16px"><div><b>Nieuw in versie ${VERSION}:</b> ${esc(RELEASES[0].title)}. <button class="link" data-a="go" data-v="news" style="min-height:0">Bekijk</button></div></div>`;
  else if (!seen) storage.set('hub', 'seenVersion', VERSION);
  h += sec('Hulp', grp(`<button class="cell" data-a="go" data-v="news"><span class="tx"><span class="tt">Wat is nieuw</span></span><span class="tr">${VERSION}</span>${CHEV}</button>`));
  return h + '</main>';
}

function vLogin() {
  const sent = ui.loginSent && ui.loginEmail;
  let h = nav(back('home', 'Apps')) + `<main><div class="brand"><img src="icon-192.png" alt=""><h1 tabindex="-1">Inloggen</h1><p>Eén account voor alle apps van je gezin.</p></div>`;
  if (DEV_CODE) h += `<div class="banner blue mb"><div><b>Lokaal testen.</b> Er wordt geen mail verstuurd; de code is altijd <b>${DEV_CODE}</b>.</div></div>`;
  if (!sent) {
    h += sec('Inloggen of account aanmaken', grp(`<label class="cell field"><span class="fl">E-mail</span><input type="email" id="loginEmail" autocomplete="email" inputmode="email" autocapitalize="off" value="${esc(ui.loginEmail || '')}" placeholder="naam@voorbeeld.nl"></label>`),
      'Je krijgt een mail met een code; geen wachtwoord nodig. Nog geen account? Dat wordt vanzelf aangemaakt.');
    const pkFirst = F.HAS_PASSKEY_API && F.hasPasskey();
    h += `<div class="sec"><button class="btn big ${pkFirst ? 'gray' : ''}" data-a="sendcode">Stuur code</button></div>`;
    if (F.HAS_PASSKEY_API) h += `<div class="sec"><button class="btn big ${pkFirst ? '' : 'gray'}" data-a="pklogin">${FACE}Log in met passkey</button><p class="sec-f">Met Face ID of Touch ID, zonder mail. De eerste keer log je in met een code; daarna kun je bij Gezin → Account een passkey aanmaken.</p></div>`;
  } else {
    h += sec(`Code uit de mail aan ${esc(ui.loginEmail)}`, grp(`<div class="cell"><input type="text" id="loginCode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" aria-label="Code" style="width:100%;border:0;background:none;font:600 1.8rem/1.4 ui-monospace,Menlo,monospace;letter-spacing:.3em;text-align:center" placeholder="••••••"></div>`),
      'Kijk ook in je spam. Staat er een link in de mail in plaats van een code? Tik daarop; je komt dan ingelogd in de app.');
    h += `<div class="sec"><button class="btn big" data-a="verify">Log in</button></div>
      <div class="sec" style="display:flex;justify-content:center;gap:24px"><button class="link" data-a="sendcode">Opnieuw sturen</button><button class="link" data-a="otheremail">Ander e-mailadres</button></div>`;
  }
  return h + '</main>';
}

function vOnboard() {
  const me = account(), fams = F.families();
  let h = nav(back('home', 'Apps'), '', '<button class="nb" data-a="logout">Log uit</button>') + '<main>' + lt('Je gezin', `Ingelogd als ${esc(me ? me.email : '')}`);
  if (fams.length) h += sec('Jouw gezinnen', grp(fams.map(t => `<button class="cell" data-a="choose" data-id="${esc(t.team_id)}"><span class="tx"><span class="tt">${esc(t.team_name)}</span><span class="st">${ROLE_LABEL[t.role] || t.role}</span></span>${CHEV}</button>`).join('')));
  h += sec('Nieuw gezin', grp(`<label class="cell field"><span class="fl">Gezin</span><input type="text" id="famName" placeholder="bijv. Familie Jansen"></label>
    <label class="cell field"><span class="fl">Jouw naam</span><input type="text" id="memberName1" autocomplete="given-name"></label>
    ${APPS.map(app => `<div class="cell"><span class="ico" aria-hidden="true">${app.icon}</span><span class="tx"><span class="tt">${esc(app.name)}</span><span class="st">${esc(app.about || '')}</span></span>${toggle((ui.newApps || []).includes(app.id), 'newapp', `data-app="${app.id}"`, app.name)}</div>`).join('')}`),
    'Jij wordt beheerder. Apps kun je later altijd aan- of uitzetten.');
  h += `<div class="sec"><button class="btn big ${fams.length ? 'gray' : ''}" data-a="create">Maak gezin</button></div>`;
  h += sec('Ik heb een code', grp(`<label class="cell field"><span class="fl">Code</span><input type="text" id="joinCode" autocapitalize="characters" autocomplete="off" style="text-transform:uppercase;letter-spacing:.2em;font-weight:600" placeholder="ABC123"></label>
    <label class="cell field"><span class="fl">Jouw naam</span><input type="text" id="memberName2" autocomplete="given-name"></label>`), 'Een beheerder van het gezin maakt de code bij Gezin → Iemand uitnodigen.');
  h += `<div class="sec"><button class="btn big gray" data-a="join">Sluit je aan</button></div>`;
  return h + '</main>';
}

function vFamily() {
  const me = account();
  if (!me) return vLogin();
  if (!me.teamId) return vOnboard();
  const admin = isAdmin();
  let h = nav(back('home', 'Apps'), 'Gezin') + '<main>' + lt(esc(me.teamName), `Jij bent ${(ROLE_LABEL[me.role] || '').toLowerCase()}`);
  if (!fam) return h + '<p class="sec-f">Laden…</p></main>';
  // leden
  h += sec('Leden', grp(fam.members.map(m => `<button class="cell" data-a="member" data-id="${esc(m.user_id)}" ${admin || m.user_id === me.userId ? '' : 'disabled'}><span class="tx"><span class="tt">${esc(m.name || '(geen naam)')}${m.user_id === me.userId ? ' (jij)' : ''}</span><span class="st">${ROLE_LABEL[m.role] || m.role}${APPS.filter(app => hasAccess(m, app.id)).map(app => ' · ' + esc(app.name)).join('')}</span></span>${admin || m.user_id === me.userId ? CHEV : ''}</button>`).join('')),
    admin ? 'Tik op een lid voor rol, apps en rechten.' : '');
  if (admin) {
    h += sec('Iemand uitnodigen', grp(`<div class="cell stack"><span class="tt">Als</span>${seg([['member', 'Lid'], ['child', 'Kind'], ['admin', 'Beheerder']], ui.inviteRole || 'member', 'inviterole')}</div>`
      + (ui.invite ? `<div class="cell stack"><div class="codebox">${esc(ui.invite)}</div></div><button class="cell tint" data-a="shareinvite"><span class="tx"><span class="tt">Deel code</span></span></button><button class="cell" data-a="invite"><span class="tx"><span class="tt">Maak nieuwe code</span></span></button>`
        : `<button class="cell tint" data-a="invite"><span class="tx"><span class="tt">Maak uitnodigingscode</span></span>${CHEV}</button>`)),
      'De ander opent de app, logt in en kiest "Ik heb een code". Een code is 14 dagen geldig; een nieuwe code maakt de vorige ongeldig.');
  }
  // apps van het gezin
  h += sec('Apps', grp(APPS.map(app => `<div class="cell"><span class="ico" aria-hidden="true">${app.icon}</span><span class="tx"><span class="tt">${esc(app.name)}</span><span class="st">${esc(app.about || '')}</span></span>${toggle(!!fam.apps[app.id], 'appon', `data-app="${app.id}"`, app.name, !admin)}</div>`).join('')),
    admin ? 'Een app die aan staat, kan ieder lid gebruiken (kinderen alleen als je het per kind aanzet). Uitzetten verwijdert niets; de gegevens blijven bewaard.' : 'Apps aan- of uitzetten doet een beheerder.');
  // gezinnen
  const others = F.families().filter(t => t.team_id !== me.teamId);
  h += sec('Jouw gezinnen', grp(`${admin ? `<label class="cell field"><span class="fl">Naam gezin</span><input type="text" id="famRename" value="${esc(me.teamName)}" data-a-change="rename"></label>` : ''}`
    + others.map(t => `<button class="cell" data-a="choose" data-id="${esc(t.team_id)}"><span class="tx"><span class="tt">${esc(t.team_name)}</span><span class="st">${ROLE_LABEL[t.role] || t.role}</span></span><span class="tr">Wissel</span>${CHEV}</button>`).join('')
    + `<button class="cell" data-a="go" data-v="onboard"><span class="tx"><span class="tt">Nieuw gezin of code invullen</span></span>${CHEV}</button>`
    + (!admin ? '<button class="cell red" data-a="leave">Verlaat dit gezin</button>' : '')));
  h += vAccountSections(me);
  return h + '</main>';
}

function vAccountSections(me) {
  let h = sec('Weergave', grp(`<div class="cell stack">${seg([['auto', 'Automatisch'], ['light', 'Licht'], ['dark', 'Donker']], F.getTheme(), 'theme')}</div>`), 'Geldt voor alle apps op deze telefoon. Automatisch volgt de instelling van je iPhone.');
  h += sec('Account', grp(`<div class="cell"><span class="tx"><span class="tt">${esc(me.email)}</span></span></div>`
    + (F.HAS_PASSKEY_API ? `<button class="cell" data-a="go" data-v="passkeys"><span class="tx"><span class="tt">Passkeys</span></span><span class="tr">${F.hasPasskey() ? 'Face ID aan' : 'Inloggen met Face ID'}</span>${CHEV}</button>` : '')
    + '<button class="cell red" data-a="logout">Uitloggen</button>'));
  return h;
}

function vMember() {
  const me = account(), m = fam && fam.members.find(x => x.user_id === ui.memberId);
  if (!m) return vFamily();
  const admin = isAdmin(), self = m.user_id === me.userId;
  let h = nav(back('family', 'Gezin'), esc(m.name || 'Lid')) + '<main>' + lt(esc(m.name || '(geen naam)'), self ? 'Dit ben jij' : '');
  h += sec('Naam', grp(`<label class="cell field"><span class="fl">Naam</span><input type="text" id="memberRename" value="${esc(m.name)}" ${admin || self ? '' : 'disabled'}></label>`));
  h += sec('Rol in het gezin', grp(`<div class="cell stack">${seg([['admin', 'Beheerder'], ['member', 'Lid'], ['child', 'Kind']], m.role, 'role', `data-id="${esc(m.user_id)}"`, !admin)}</div>`),
    'Beheerder: gezin, leden, uitnodigingen en apps beheren. Lid: gebruikt de apps die aan staan. Kind: alleen de apps die je hieronder aanzet.');
  const on = APPS.filter(app => fam.apps[app.id]);
  if (on.length) h += sec('Apps', grp(on.map(app => {
    const acc = hasAccess(m, app.id), roles = app.roles ? Object.entries(app.roles).filter(([k], i, arr) => arr.findIndex(x => x[1] === app.roles[k]) === i) : null;
    return `<div class="cell"><span class="ico" aria-hidden="true">${app.icon}</span><span class="tx"><span class="tt">${esc(app.name)}</span></span>${toggle(acc, 'access', `data-id="${esc(m.user_id)}" data-app="${app.id}"`, 'Toegang tot ' + app.name, !admin)}</div>`
      + (acc && roles ? `<div class="cell stack">${seg(roles, roles.find(([k]) => app.roles[k] === app.roles[appRole(m, app.id)])?.[0], 'approle', `data-id="${esc(m.user_id)}" data-app="${app.id}"`, !admin)}</div>` : '');
  }).join('')), 'Rollen per app, bijvoorbeeld in Egg-sellent: beheerder (instellingen en bestellen) of bezorger.');
  if (admin && !self) h += sec('', grp('<button class="cell red center" data-a="remove">Verwijder uit gezin</button>'));
  return h + '</main>';
}

function vPasskeys() {
  const list = ui.passkeys;
  let h = nav(back('family', 'Gezin'), 'Passkeys') + '<main>' + lt('Passkeys', 'Inloggen met Face ID of Touch ID');
  if (ui.passkeyErr) h += `<div class="banner mb">${esc(ui.passkeyErr)}</div>`;
  h += sec('Jouw passkeys', grp(list == null ? '<div class="cell"><span class="st">Laden…</span></div>'
    : list.length ? list.map(p => `<div class="cell"><span class="tx"><span class="tt">${esc(p.friendly_name || 'Passkey')}</span><span class="st">Aangemaakt ${esc(new Date(p.created_at).toLocaleDateString('nl-NL'))}</span></span><button class="link" style="color:var(--red)" data-a="pkdel" data-id="${esc(p.id)}">Verwijder</button></div>`).join('')
    : '<div class="cell"><span class="st">Nog geen passkey.</span></div>'), 'Een passkey staat in je iCloud-sleutelhanger en gaat mee naar een nieuwe iPhone.');
  h += `<div class="sec"><button class="btn big" data-a="pkadd">${FACE}Maak passkey op dit apparaat</button></div>`;
  return h + '</main>';
}

function vNews() {
  storage.set('hub', 'seenVersion', VERSION);
  let h = nav(back('home', 'Apps'), 'Wat is nieuw') + '<main>' + lt('Wat is nieuw', `Versie ${VERSION}`);
  for (const r of RELEASES) {
    const d = new Date(r.date + 'T12:00:00');
    h += sec(`${r.version} · ${d.getDate()} ${MONL[d.getMonth()]} ${d.getFullYear()}`, grp(`<div class="cell"><span class="tx"><span class="tt" style="font-weight:600">${esc(r.title)}</span></span></div>`
      + r.notes.map(n => `<div class="cell"><span class="tx"><span class="tt">${esc(n.text)}</span><span class="st">${esc(APP_NAMES[n.app] || n.app)}</span></span></div>`).join('')));
  }
  return h + '</main>';
}

const VIEWS = { news: vNews, home: vHome, login: vLogin, onboard: vOnboard, family: vFamily, member: vMember, passkeys: vPasskeys };
function render() {
  if (ui.view === 'login' && account()) ui.view = account().teamId ? 'home' : 'onboard';
  document.getElementById('app').innerHTML = (VIEWS[ui.view] || vHome)();
  onScroll();
}
function onScroll() { const n = document.getElementById('nav'); if (n) n.classList.toggle('scrolled', window.scrollY > 4); }
addEventListener('scroll', onScroll, { passive: true });

/* ---------- acties ---------- */
// Na wisselen van gezin: niet-verstuurde wijzigingen van Egg-sellent zouden verloren gaan.
const okToLeaveEggData = () => !F.pendingEggChanges() || confirm(`${F.pendingEggChanges()} wijziging(en) in Egg-sellent zijn nog niet verstuurd (geen internet?) en gaan verloren. Toch doorgaan?`);
const patchMemberApp = (uid, app, patch) => {
  const cur = memberApp(uid, app);
  return F.api('/rest/v1/team_member_apps?on_conflict=team_id,user_id,app', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { team_id: fam.id, user_id: uid, app, access: cur.access ?? null, role: cur.role ?? null, ...patch } });
};
const afterChange = async () => { await F.refreshFamilies(); await loadFamily(); render(); };

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el || el.disabled) return;
  const a = el.dataset.a, me = account();
  switch (a) {
    case 'go':
      go(el.dataset.v);
      if (el.dataset.v === 'family') run(null, async () => { await F.refreshFamilies(); await loadFamily(); render(); });
      if (el.dataset.v === 'passkeys') { ui.passkeys = null; F.passkeyList().then(l => { ui.passkeys = l; ui.passkeyErr = null; render(); }).catch(e => { ui.passkeys = []; ui.passkeyErr = F.passkeyError(e); render(); }); }
      break;
    case 'sendcode': run(el, async () => {
      const email = (val('loginEmail') || ui.loginEmail || '').toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Vul een geldig e-mailadres in.');
      await F.sendCode(email); ui.loginEmail = email; ui.loginSent = true; render();
      setTimeout(() => { const c = document.getElementById('loginCode'); if (c) c.focus(); }, 50);
      if (!DEV_CODE) toast('Code verstuurd. Kijk in je mail.');
    }); break;
    case 'verify': run(el, async () => {
      const code = val('loginCode').replace(/\s/g, '');
      if (!/^\d{6,10}$/.test(code)) throw new Error('Vul de code uit de mail in.');
      await F.verifyCode(ui.loginEmail, code); ui.loginSent = false;
      go(account().teamId ? 'home' : 'onboard'); loadFamily().catch(() => {});
    }); break;
    case 'otheremail': ui.loginSent = false; render(); break;
    case 'pklogin': run(el, async () => {
      try { await F.passkeyLogin(); } catch (e) { const m = F.passkeyError(e); if (m) throw new Error(m); return; }
      go(account().teamId ? 'home' : 'onboard');
    }); break;
    case 'pkadd': run(el, async () => {
      const name = /iPhone/.test(navigator.userAgent) ? 'iPhone' : /iPad/.test(navigator.userAgent) ? 'iPad' : /Mac/.test(navigator.userAgent) ? 'Mac' : 'Apparaat';
      try { await F.passkeyAdd(`${name} · ${new Date().toLocaleDateString('nl-NL')}`); } catch (e) { const m = F.passkeyError(e); if (m) throw new Error(m); return; }
      ui.passkeys = await F.passkeyList(); toast('Passkey aangemaakt. Voortaan inloggen met Face ID.'); render();
    }); break;
    case 'pkdel': if (confirm('Deze passkey verwijderen?')) run(el, async () => { await F.passkeyDelete(el.dataset.id); ui.passkeys = await F.passkeyList(); render(); }); break;
    case 'logout':
      if (!okToLeaveEggData() || !confirm('Uitloggen? Je gegevens blijven bewaard bij je gezin.')) return;
      run(el, async () => { await F.logout(); fam = null; go('home'); }); break;
    case 'newapp': { const id = el.dataset.app, s = new Set(ui.newApps || []); s.has(id) ? s.delete(id) : s.add(id); ui.newApps = [...s]; el.setAttribute('aria-checked', s.has(id)); break; }
    case 'create': run(el, async () => {
      const name = val('famName'); if (!name) throw new Error('Geef het gezin een naam.');
      if (!okToLeaveEggData()) return;
      await F.createFamily(name, val('memberName1'), ui.newApps || []); ui.newApps = [];
      await loadFamily(); go('family'); toast('Gezin gemaakt. Nodig nu de anderen uit.');
    }); break;
    case 'join': run(el, async () => {
      const code = val('joinCode').toUpperCase(); if (!code) throw new Error('Vul de code in.');
      if (!okToLeaveEggData()) return;
      await F.joinFamily(code, val('memberName2')); await loadFamily(); go('home'); toast(`Welkom bij ${account().teamName}!`);
    }); break;
    case 'choose': {
      const t = F.families().find(x => x.team_id === el.dataset.id); if (!t || !okToLeaveEggData()) return;
      F.chooseFamily(t); fam = null; go('home'); refresh(); break;
    }
    case 'leave':
      if (!confirm(`${me.teamName} verlaten? Je gegevens van dit gezin zijn daarna niet meer te zien.`) || !okToLeaveEggData()) return;
      run(el, async () => { await F.api(`/rest/v1/team_members?team_id=eq.${me.teamId}&user_id=eq.${me.userId}`, { method: 'DELETE' }); F.wipeUserData(); await F.refreshFamilies(); fam = null; go('onboard'); }); break;
    case 'inviterole': ui.inviteRole = el.dataset.v; ui.invite = null; render(); break;
    case 'invite': run(el, async () => { ui.invite = await F.api('/rest/v1/rpc/create_invite', { method: 'POST', body: { p_team: me.teamId, p_role: ui.inviteRole || 'member' } }); render(); }); break;
    case 'shareinvite': {
      const text = `Doe mee met ${me.teamName}! Open ${F.HUB_URL} op je iPhone in Safari, zet de app op je beginscherm, log in en vul deze code in: ${ui.invite}`;
      if (navigator.share) navigator.share({ text }).catch(() => {}); else navigator.clipboard.writeText(text).then(() => toast('Gekopieerd.')).catch(() => toast(text));
      break;
    }
    case 'appon': run(el, async () => {
      const app = el.dataset.app, on = !fam.apps[app];
      await F.api('/rest/v1/team_apps?on_conflict=team_id,app', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { team_id: fam.id, app, enabled: on, updated_at: new Date().toISOString() } });
      await afterChange();
    }); break;
    case 'member': ui.memberId = el.dataset.id; go('member'); break;
    case 'role': run(el, async () => { await F.api(`/rest/v1/team_members?team_id=eq.${fam.id}&user_id=eq.${el.dataset.id}`, { method: 'PATCH', body: { role: el.dataset.v } }); await afterChange(); }); break;
    case 'access': run(el, async () => {
      const m = fam.members.find(x => x.user_id === el.dataset.id), app = el.dataset.app, next = !hasAccess(m, app);
      await patchMemberApp(m.user_id, app, { access: next === (m.role !== 'child') ? null : next }); await afterChange();
    }); break;
    case 'approle': run(el, async () => { await patchMemberApp(el.dataset.id, el.dataset.app, { role: el.dataset.v }); await afterChange(); }); break;
    case 'remove': {
      const m = fam.members.find(x => x.user_id === ui.memberId);
      if (!confirm(`${m.name || 'Dit lid'} uit het gezin verwijderen?`)) return;
      run(el, async () => { await F.api(`/rest/v1/team_members?team_id=eq.${fam.id}&user_id=eq.${m.user_id}`, { method: 'DELETE' }); await loadFamily(); go('family'); }); break;
    }
    case 'theme': F.setTheme(el.dataset.v); render(); break;
  }
});
// Namen opslaan zodra het veld verlaten wordt.
document.addEventListener('change', ev => {
  const el = ev.target, me = account();
  if (el.id === 'famRename' && el.value.trim() && el.value.trim() !== me.teamName)
    run(null, async () => { await F.api(`/rest/v1/teams?id=eq.${me.teamId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { name: el.value.trim() } }); await afterChange(); toast('Naam gewijzigd.'); });
  if (el.id === 'memberRename' && fam)
    run(null, async () => { await F.api(`/rest/v1/team_members?team_id=eq.${fam.id}&user_id=eq.${ui.memberId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { name: el.value.trim() } }); await afterChange(); });
});
document.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter') return;
  if (ev.target.id === 'loginEmail') { ev.preventDefault(); document.querySelector('[data-a=sendcode]').click(); }
  if (ev.target.id === 'loginCode') { ev.preventDefault(); document.querySelector('[data-a=verify]').click(); }
});

/* ---------- start ---------- */
// ?login (vanuit een app die een login nodig heeft) opent direct het inlogscherm; ?view=family het gezinsscherm.
const q = new URLSearchParams(location.search);
if (q.has('login')) { ui.view = account() ? (account().teamId ? 'home' : 'onboard') : 'login'; history.replaceState(null, '', location.pathname); }
if (q.get('view') === 'family') { ui.view = 'family'; history.replaceState(null, '', location.pathname); }
render();
F.loginFromLink().then(ok => { if (ok) { go(account().teamId ? 'home' : 'onboard'); refresh(); } }).catch(e => toast(e.message, 'err'));
refresh();
addEventListener('pageshow', e => { if (e.persisted) render(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
