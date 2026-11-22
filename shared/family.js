// Familie-app — gedeelde laag voor de hub en de apps eronder.
//
// - config: dezelfde Supabase als Egg-sellent (config.js in de root, `local` op localhost)
// - sessie: het account waarmee in Egg-sellent is ingelogd. Alle apps staan onder één
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

/* ---------- sessie (gedeeld met Egg-sellent) ---------- */
const SKEY = 'eggselent-sync-v1';
const readS = () => storage.raw(SKEY, {}) || {};

// Het gezin is in de database een "team" (tabellen teams / team_members / team_invites): één gezin, meerdere
// gebruikers, aansluiten met een code. Egg-sellent en Training horen bij het gezin.
// { userId, email, teamId, teamName, memberName } of null als er niemand (geldig) is ingelogd.
// teamId is null als de gebruiker (nog) geen gezin heeft gekozen.
export function account() {
  const S = readS();
  if (!CLOUD || !S.session || S.session.expired || !S.userId) return null;
  const email = S.session.email || '';
  return {
    userId: S.userId, email,
    teamId: S.team ? S.team.id : null, teamName: S.team ? S.team.name : '',
    memberName: (S.team && S.team.memberName) || email.split('@')[0] || 'Ik',
  };
}

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
        throw Object.assign(new Error('Sessie verlopen, log opnieuw in via Egg-sellent'), { auth: true });
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

/* ---------- thema ---------- */
const THEME_KEY = 'eggselent-theme';
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
