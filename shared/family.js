// Familie-app — gedeelde laag voor de hub en de apps eronder.
//
// - config: dezelfde Supabase als Egg-sellent (config.js in de root, `local` op localhost)
// - inloggen (code per mail, passkeys) en gezinnen: alleen in de hub; alle apps staan onder één
//   beginscherm-icoon en delen dus dezelfde opslag; de sessie staat in 'eggselent-sync-v1'.
// - opslag: naamruimte per app (family:<app>:<key>), alles in try/catch.
// - thema: dezelfde sleutel als Egg-sellent ('eggselent-theme'), zodat licht/donker overal gelijk is.
//
// Laden als ES-module: import { … } from '../shared/family.js'. config.js moet er als gewoon
// <script> vóór staan (zet window.EGGSELENT_CONFIG).

/* ---------- opslag ---------- */
export const storage = {
  get(app, key, fallback = null) {
    try { const v = localStorage.getItem(`family:${app}:${key}`); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
  set(app, key, value) {
    try { localStorage.setItem(`family:${app}:${key}`, JSON.stringify(value)); return true; } catch (e) { return false; }
  },
  remove(app, key) { try { localStorage.removeItem(`family:${app}:${key}`); } catch (e) {} },
  // Ruwe toegang tot sleutels van vóór de familie-app (bijv. die van Egg-sellent).
  raw(key, fallback = null) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; }
  },
};

/* ---------- config ---------- */
const IS_LOCAL_HOST = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(location.hostname);
const BASE = (typeof window !== 'undefined' && window.EGGSELENT_CONFIG) || {};
export const CFG = Object.assign({ supabaseUrl: '', supabaseKey: '' }, IS_LOCAL_HOST && BASE.local ? BASE.local : BASE, storage.raw('eggselent-config', {}));
CFG.supabaseUrl = (CFG.supabaseUrl || '').replace(/\/+$/, '');
export const CLOUD = !!(CFG.supabaseUrl && CFG.supabaseKey);
// Vaste inlogcode alleen als de app echt met een lokale Supabase praat; nooit tegen de online database.
export const DEV_CODE = CFG.devCode && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(CFG.supabaseUrl) ? String(CFG.devCode) : null;
// Adres van de hub (root van de familie-app), ook vanuit een app in een submap.
export const HUB_URL = new URL('../', import.meta.url).href;

/* ---------- sessie (gedeeld door hub en alle apps; sleutel stamt nog uit Egg-sellent) ---------- */
const SKEY = 'eggselent-sync-v1';
const readS = () => storage.raw(SKEY, {}) || {};

// Het gezin is in de database een "team" (tabellen teams / team_members / team_invites): één gezin, meerdere
// gebruikers, aansluiten met een code. Egg-sellent en Training horen bij het gezin.
// Gezinsrollen: admin (beheerder), member (lid), child (kind). Per app kan iemand toegang hebben of niet, en een
// eigen rol (Egg-sellent: admin = beheerder, walker = bezorger). Zie supabase/schema.sql → "Gezin: rollen, rechten en apps".
//
// { userId, email, teamId, teamName, role, memberName, apps } of null als er niemand (geldig) is ingelogd.
// teamId is null als de gebruiker (nog) geen gezin heeft gekozen. apps = { eggs: { role }, … } (alleen apps die
// voor deze gebruiker in dit gezin aan staan).
export function account() {
  const S = readS();
  if (!CLOUD || !S.session || S.session.expired || !S.userId) return null;
  const email = S.session.email || '';
  return {
    userId: S.userId, email,
    teamId: S.team ? S.team.id : null, teamName: S.team ? S.team.name : '',
    role: S.team ? S.team.role : null, apps: S.team ? S.team.apps || null : null,
    memberName: (S.team && S.team.memberName) || email.split('@')[0] || 'Ik',
  };
}
export const sessionExpired = () => { const S = readS(); return !!(S.session && S.session.expired); };
// Mag de gebruiker deze app gebruiken? Zonder login: ja (lokaal). Oude sessie zonder apps-lijst: ja (de server beslist).
export function canUse(app) {
  const a = account();
  if (!a || !a.teamId || !a.apps) return true;
  return !!a.apps[app];
}
export const ROLE_LABEL = { admin: 'Beheerder', member: 'Lid', child: 'Kind' };

let refreshing = null;
function refreshToken() {
  if (!refreshing) refreshing = (async () => {
    try {
      const S = readS();
      if (!S.session) throw Object.assign(new Error('Niet ingelogd'), { auth: true });
      const res = await fetch(CFG.supabaseUrl + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST', headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: S.session.refresh_token }),
      });
      const d = await res.json().catch(() => ({}));
      // Altijd opnieuw lezen vlak voor schrijven: Egg-sellent bewaart meer in hetzelfde object.
      const fresh = readS();
      if (!res.ok) {
        if (res.status >= 400 && res.status < 500 && fresh.session) { fresh.session.expired = true; localStorage.setItem(SKEY, JSON.stringify(fresh)); }
        throw Object.assign(new Error('Sessie verlopen, log opnieuw in'), { auth: true });
      }
      fresh.session = {
        access_token: d.access_token, refresh_token: d.refresh_token,
        expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
        email: d.user ? d.user.email : (fresh.session && fresh.session.email),
      };
      try { localStorage.setItem(SKEY, JSON.stringify(fresh)); } catch (e) {}
    } finally { refreshing = null; }
  })();
  return refreshing;
}

async function token() {
  const S = readS();
  if (!S.session || S.session.expired) throw Object.assign(new Error('Niet ingelogd'), { auth: true });
  if (S.session.expires_at * 1000 - 60000 < Date.now()) await refreshToken();
  return readS().session.access_token;
}

// Aanroep naar Supabase met het gedeelde account. Gooit een Error met .status / .auth.
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  if (!CLOUD) throw new Error('Geen koppeling met de server');
  const go = async () => fetch(CFG.supabaseUrl + path, {
    method,
    headers: Object.assign({ apikey: CFG.supabaseKey, 'Content-Type': 'application/json', Authorization: 'Bearer ' + await token() }, headers),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let res = await go();
  if (res.status === 401) { await refreshToken(); res = await go(); }
  const text = await res.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const m = data && (data.msg || data.error_description || data.message || data.error);
    throw Object.assign(new Error(m || 'Serverfout ' + res.status), { status: res.status });
  }
  return data;
}

/* ---------- inloggen (alleen in de hub) ---------- */
const writeS = fn => { const S = readS(); fn(S); try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} return S; };
async function publicApi(path, body) {
  const res = await fetch(CFG.supabaseUrl + path, { method: 'POST', headers: { apikey: CFG.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  const text = await res.text(); let d = null; try { d = text ? JSON.parse(text) : null; } catch (e) { d = text; }
  if (!res.ok) throw Object.assign(new Error((d && (d.msg || d.error_description || d.message || d.error)) || 'Serverfout ' + res.status), { status: res.status });
  return d;
}
function setSession(d) {
  writeS(S => {
    S.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), email: d.user ? d.user.email : (S.session && S.session.email) };
    if (d.user) S.newUserId = d.user.id;
  });
}
// redirect_to: bevat de mail een inloglink (standaardmail van Supabase), dan komt die terug in de hub.
export async function sendCode(email) {
  if (DEV_CODE) return; // lokaal: geen mail, de code is altijd DEV_CODE
  await publicApi('/auth/v1/otp?redirect_to=' + encodeURIComponent(HUB_URL), { email, create_user: true });
}
// Lokaal inloggen: achter de schermen een wachtwoord-account op de lokale Supabase (aangemaakt bij de eerste keer).
async function devLogin(email, token) {
  if (token !== DEV_CODE) throw new Error(`Lokaal is de code altijd ${DEV_CODE}.`);
  const body = { email, password: 'lokaal-' + DEV_CODE };
  const call = async path => { try { return await publicApi(path, body); } catch (e) { if (e instanceof TypeError) throw new Error('De lokale Supabase draait niet. Start hem met: npx supabase start'); throw e; } };
  try { setSession(await call('/auth/v1/token?grant_type=password')); return; } catch (e) { if (e.status !== 400) throw e; }
  const d = await call('/auth/v1/signup');
  if (!d || !d.access_token) throw new Error('De lokale Supabase vraagt om e-mailbevestiging. Zet in supabase/config.toml enable_confirmations = false.');
  setSession(d);
}
export async function verifyCode(email, token) {
  if (DEV_CODE) await devLogin(email, token);
  else setSession(await publicApi('/auth/v1/verify', { type: 'email', email, token }));
  await afterLogin();
}
// Inloggen via de link in de mail: Supabase stuurt terug naar de hub met #access_token=…
export async function loginFromLink() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get('access_token') && !h.get('error_description')) return false;
  history.replaceState(null, '', location.pathname);
  if (h.get('error_description')) throw new Error('Inloggen mislukt: ' + h.get('error_description'));
  let claims = {};
  try { claims = JSON.parse(atob(h.get('access_token').split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) {}
  setSession({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_at: +h.get('expires_at') || undefined, expires_in: +h.get('expires_in') || undefined, user: { id: claims.sub, email: claims.email } });
  await afterLogin();
  return true;
}

// Alles wat bij een gebruiker hoort van deze telefoon halen (bij uitloggen of als iemand anders inlogt).
export function wipeUserData() {
  for (const k of ['eggselent-data-v1', 'eggselent-hash-v1', 'eggselent-ui-v1']) { try { localStorage.removeItem(k); } catch (e) {} }
  try { for (const k of Object.keys(localStorage)) if (k.startsWith('family:')) localStorage.removeItem(k); } catch (e) {}
  writeS(S => Object.assign(S, { outbox: {}, lastPull: null, settingsU: null, lastSync: null, digestHash: null, eggTeamId: null, team: null, push: null, pushPrefs: null }));
}
// Nog niet verstuurde wijzigingen van Egg-sellent (gaan verloren bij uitloggen of wisselen van gezin).
export const pendingEggChanges = () => Object.keys(readS().outbox || {}).length;

async function afterLogin() {
  const S = readS();
  if (S.userId && S.userId !== S.newUserId) wipeUserData(); // iemand anders op deze telefoon
  writeS(S => { S.userId = S.newUserId; delete S.newUserId; delete S.session.expired; });
  await refreshFamilies();
  const S2 = readS();
  if (!S2.team && S2.teams.length) chooseFamily(S2.teams.find(t => t.team_id === S2.lastTeamId) || S2.teams[0]);
}

/* ---------- gezinnen ---------- */
const toTeam = t => ({ id: t.team_id, name: t.team_name, role: t.role, memberName: t.member_name, apps: t.apps || {} });
export const families = () => readS().teams || [];
// Gezinnen, rollen en apps opnieuw ophalen (bij openen van de hub).
export async function refreshFamilies() {
  const teams = await api('/rest/v1/rpc/my_teams', { method: 'POST', body: {} });
  writeS(S => {
    S.teams = teams || [];
    if (S.team) { const t = S.teams.find(x => x.team_id === S.team.id); S.team = t ? toTeam(t) : null; }
  });
}
// Gezin kiezen. Egg-sellent merkt zelf dat het gezin anders is en haalt dan de gegevens van het nieuwe gezin op.
export function chooseFamily(t) { writeS(S => { S.team = toTeam(t); S.lastTeamId = t.team_id; }); }
export async function createFamily(name, memberName, apps) {
  const id = await api('/rest/v1/rpc/create_team', { method: 'POST', body: { p_name: name, p_member_name: memberName, p_apps: apps } });
  await refreshFamilies();
  chooseFamily(families().find(t => t.team_id === id));
  return id;
}
export async function joinFamily(code, memberName) {
  const id = await api('/rest/v1/rpc/join_team', { method: 'POST', body: { p_code: code, p_member_name: memberName } });
  await refreshFamilies();
  chooseFamily(families().find(t => t.team_id === id));
  return id;
}
export async function logout() {
  const S = readS();
  // meldingen van Egg-sellent op deze telefoon stoppen
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub) { await api('/rest/v1/push_subscriptions?endpoint=eq.' + encodeURIComponent(sub.endpoint), { method: 'DELETE' }).catch(() => {}); await sub.unsubscribe(); }
  } catch (e) {}
  const tok = S.session && S.session.access_token;
  if (tok) fetch(CFG.supabaseUrl + '/auth/v1/logout', { method: 'POST', headers: { apikey: CFG.supabaseKey, Authorization: 'Bearer ' + tok } }).catch(() => {});
  wipeUserData();
  writeS(S => Object.assign(S, { session: null, userId: null, teams: [], team: null }));
}

/* ---------- passkeys (Face ID / Touch ID) via Supabase Auth ---------- */
export const HAS_PASSKEY_API = typeof window !== 'undefined' && !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
const b64uToBuf = s => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
const bufToB64u = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const pkCreateOpts = o => ({ ...o, challenge: b64uToBuf(o.challenge), user: { ...o.user, id: b64uToBuf(o.user.id) }, excludeCredentials: (o.excludeCredentials || []).map(c => ({ ...c, id: b64uToBuf(c.id) })) });
const pkGetOpts = o => ({ ...o, challenge: b64uToBuf(o.challenge), allowCredentials: (o.allowCredentials || []).map(c => ({ ...c, id: b64uToBuf(c.id) })) });
function pkCredJSON(c) {
  const r = c.response, out = { id: c.id, rawId: bufToB64u(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {}, response: { clientDataJSON: bufToB64u(r.clientDataJSON) } };
  if (c.authenticatorAttachment) out.authenticatorAttachment = c.authenticatorAttachment;
  if (r.attestationObject) { out.response.attestationObject = bufToB64u(r.attestationObject); if (r.getTransports) out.response.transports = r.getTransports(); }
  else { out.response.authenticatorData = bufToB64u(r.authenticatorData); out.response.signature = bufToB64u(r.signature); out.response.userHandle = r.userHandle ? bufToB64u(r.userHandle) : null; }
  return out;
}
export function passkeyError(e) {
  if (e && (e.name === 'NotAllowedError' || e.name === 'AbortError')) return null; // geannuleerd: geen melding
  if (e && e.status === 404) return 'Inloggen met passkeys staat (nog) niet aan voor deze app.';
  if (e && e.name === 'InvalidStateError') return 'Er bestaat al een passkey voor dit account op dit apparaat.';
  return (e && e.message) || 'Passkey mislukt.';
}
export const hasPasskey = () => !!readS().hasPasskey;
export async function passkeyLogin() {
  const o = await publicApi('/auth/v1/passkeys/authentication/options', {});
  const cred = await navigator.credentials.get({ publicKey: pkGetOpts(o.options) });
  setSession(await publicApi('/auth/v1/passkeys/authentication/verify', { challenge_id: o.challenge_id, credential: pkCredJSON(cred) }));
  await afterLogin();
}
export async function passkeyAdd(label) {
  const o = await api('/auth/v1/passkeys/registration/options', { method: 'POST', body: {} });
  const cred = await navigator.credentials.create({ publicKey: pkCreateOpts(o.options) });
  const r = await api('/auth/v1/passkeys/registration/verify', { method: 'POST', body: { challenge_id: o.challenge_id, credential: pkCredJSON(cred) } });
  if (r && r.id && label) { try { await api('/auth/v1/passkeys/' + r.id, { method: 'PATCH', body: { friendly_name: label } }); } catch (e) {} }
  writeS(S => { S.hasPasskey = true; });
}
export async function passkeyList() { const l = await api('/auth/v1/passkeys'); writeS(S => { S.hasPasskey = (l || []).length > 0; }); return l || []; }
export const passkeyDelete = id => api('/auth/v1/passkeys/' + id, { method: 'DELETE' });

/* ---------- thema (algemene instelling, per telefoon) ---------- */
const THEME_KEY = 'eggselent-theme';
export function getTheme() { try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; } }
export function setTheme(t) { try { localStorage.setItem(THEME_KEY, t); } catch (e) {} applyTheme(); }
export function applyTheme() {
  let t = 'auto';
  try { t = localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) {}
  const root = document.documentElement;
  if (t === 'light' || t === 'dark') root.dataset.theme = t; else delete root.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach(m => m.setAttribute('content', dark ? '#000000' : '#F2F2F7'));
}

/* ---------- kleine hulpjes ---------- */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Service worker staat op de root en bedient alle apps. base = pad naar de root ('./' of '../').
export function registerSW(base) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register(base + 'sw.js', { scope: base }).then(reg => {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    // Nieuwe versie klaar: stil activeren zodra de app naar de achtergrond gaat.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden' && reg.waiting) reg.waiting.postMessage('skipWaiting');
    });
  }).catch(() => {});
}
