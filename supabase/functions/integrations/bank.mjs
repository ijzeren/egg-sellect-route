// Thuis — bankrekeningen via Enable Banking (PSD2), voor Financiën. Zonder netwerk en zonder database: testbaar met
// node (tests/bank.test.mjs). De Edge Function (index.ts) doet de aanroepen en het opslaan.
//   - elke aanroep naar Enable Banking draagt een JWT, ondertekend met de privésleutel van de app (RS256)
//   - transacties van de bank → rijen voor finance_transactions (zelfde vorm als finance/import.js)
//   - ontdubbelen: wat al via een export is ingelezen, komt niet nog een keer binnen (dropKnown, ook in import.js)
// Documentatie: https://enablebanking.com/docs/api/reference/

export const API = 'https://api.enablebanking.com';

/* ---------- ondertekenen ---------- */
const b64url = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64urlText = s => b64url(new TextEncoder().encode(s));
const derLen = n => (n < 128 ? [n] : n < 256 ? [0x81, n] : [0x82, n >> 8, n & 255]);
const der = (tag, body) => [tag, ...derLen(body.length), ...body];

// PEM → PKCS#8 (DER-bytes). Een oude PKCS#1-sleutel ("BEGIN RSA PRIVATE KEY") pakken we in.
export function pemToPkcs8(pem) {
  const text = String(pem || '').replace(/\\n/g, '\n');
  const m = text.match(/-----BEGIN ((?:RSA )?PRIVATE KEY)-----([\s\S]+?)-----END \1-----/);
  if (!m) throw new Error('Geen privésleutel (PEM) gevonden');
  const raw = Uint8Array.from(atob(m[2].replace(/\s+/g, '')), c => c.charCodeAt(0));
  if (m[1] === 'PRIVATE KEY') return raw;
  const alg = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
  return Uint8Array.from(der(0x30, [0x02, 0x01, 0x00, ...alg, ...der(0x04, [...raw])]));
}

const keys = new Map();
export async function signJwt(appId, pem, now = Date.now(), ttl = 3600) {
  if (!appId || !pem) throw new Error('Enable Banking is niet ingesteld');
  let key = keys.get(pem);
  if (!key) { key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']); keys.set(pem, key); }
  const iat = Math.floor(now / 1000);
  const head = b64urlText(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }));
  const body = b64urlText(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + Math.min(ttl, 86400) }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

/* ---------- hulpjes ---------- */
export const normIban = s => String(s || '').replace(/\s+/g, '').toUpperCase();
// Zelfde hash als finance/import.js: per gezin anders, zodat hij niets zegt buiten het gezin.
export async function ibanHash(team, iban) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${team}:${normIban(iban)}`));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
export const randomToken = (bytes = 32) => [...crypto.getRandomValues(new Uint8Array(bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const day = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5;
export const addDays = (s, n) => new Date((day(s) + n) * 864e5).toISOString().slice(0, 10);
// kleine, vaste hash voor een sleutel als de bank geen referentie geeft (cyrb53)
function shortHash(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ---------- toestemming ---------- */
// Tot wanneer vragen we toestemming: 180 dagen, of korter als de bank minder toestaat. RFC 3339 met tijdzone.
export function validUntil(now, maxSeconds) {
  const max = Number(maxSeconds) > 0 ? Number(maxSeconds) : 180 * 86400;
  const t = new Date(now + Math.min(180 * 86400, max) * 1000 - 3600 * 1000);
  return t.toISOString().replace('Z', '+00:00');
}
// De bank uit de lijst van Enable Banking (naam niet vastzetten: we zoeken op "Rabobank" in NL).
export function findAspsp(list, name = 'rabobank') {
  const all = (list && list.aspsps) || [];
  return all.find(a => a.country === 'NL' && String(a.name).toLowerCase() === name)
    || all.find(a => a.country === 'NL' && String(a.name).toLowerCase().includes(name) && !a.sandbox && !/business|zakelijk/i.test(a.name))
    || all.find(a => a.country === 'NL' && String(a.name).toLowerCase().includes(name)) || null;
}
// Rekeningen uit een nieuwe sessie: alleen met IBAN en uid.
export function sessionAccounts(session) {
  return ((session && session.accounts) || []).map(a => ({
    uid: a.uid, iban: normIban(a.account_id && a.account_id.iban), currency: /^[A-Z]{3}$/.test(a.currency || '') ? a.currency : 'EUR',
    kind: a.cash_account_type === 'SVGS' ? 'savings' : 'current', name: clean(a.name || a.product || a.details || '', 40),
  })).filter(a => a.uid && a.iban);
}

/* ---------- transacties ---------- */
// Eén transactie van de bank → rij (of null als hij nog niet geboekt is).
export function mapTransaction(t) {
  if (!t || (t.status && t.status !== 'BOOK')) return null;
  const amt = Number(t.transaction_amount && t.transaction_amount.amount);
  const booked = (t.booking_date || t.value_date || t.transaction_date || '').slice(0, 10);
  if (!Number.isFinite(amt) || !/^\d{4}-\d{2}-\d{2}$/.test(booked)) return null;
  const out = t.credit_debit_indicator === 'DBIT';
  const party = out ? t.creditor : t.debtor, acct = out ? t.creditor_account : t.debtor_account;
  const rem = Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : String(t.remittance_information || '');
  const bal = t.balance_after_transaction && Number(t.balance_after_transaction.amount);
  const code = t.bank_transaction_code || {};
  return {
    ref: clean(t.entry_reference || '', 100),
    booked_on: booked,
    amount: Math.round(Math.abs(amt) * 100) / 100 * (out ? -1 : 1),
    currency: /^[A-Z]{3}$/.test((t.transaction_amount || {}).currency || '') ? t.transaction_amount.currency : 'EUR',
    counterparty: clean(party && party.name, 140),
    counterparty_iban: normIban(acct && acct.iban),
    description: clean(rem || t.note || code.description || '', 500),
    code: clean(code.code || code.sub_code || '', 20),
    balance_after: Number.isFinite(bal) ? bal : null,
  };
}
// Alle transacties van één ophaalbeurt, met een vaste sleutel: eb:<referentie van de bank>, anders een hash van de
// inhoud (met volgnummer bij gelijke transacties op dezelfde dag).
export function mapTransactions(list) {
  const rows = [], seen = new Map();
  for (const t of list || []) {
    const r = mapTransaction(t); if (!r) continue;
    let ext;
    if (r.ref) ext = `eb:${r.ref}`;
    else {
      const base = `eb:h:${shortHash([r.booked_on, r.amount, r.counterparty, r.counterparty_iban, r.description].join('|'))}`;
      const n = (seen.get(base) || 0) + 1; seen.set(base, n); ext = n > 1 ? `${base}:${n}` : base;
    }
    const { ref, ...row } = r;
    if (!rows.some(x => x.ext_id === ext)) rows.push({ ext_id: ext, ...row });
  }
  return rows;
}
// Vanaf welke datum ophalen: een week overlap met wat er al is, en nooit verder terug dan de bank toestaat (89 dagen).
export function dateFrom(lastBooked, today, maxBack = 89) {
  const floor = addDays(today, -maxBack);
  if (!lastBooked) return floor;
  const f = addDays(lastBooked, -7);
  return f > floor ? f : floor;
}
// Saldo: het geboekte eindsaldo als de bank dat geeft, anders het beste wat er is.
export function pickBalance(resp, today) {
  const list = (resp && resp.balances) || [];
  for (const type of ['CLBD', 'ITBD', 'XPCD', 'CLAV', 'ITAV', 'OPBD', 'OTHR', 'INFO']) {
    const b = list.find(x => x.balance_type === type && Number.isFinite(Number(x.balance_amount && x.balance_amount.amount)));
    if (b) return { amount: Number(b.balance_amount.amount), on: (b.reference_date || (b.last_change_date_time || '').slice(0, 10) || today) };
  }
  return null;
}

// Ontdubbelen. Nieuw is een rij als (1) zijn sleutel er nog niet is en (2) er geen rij uit een andere bron is
// (export "rabo:"/"camt:" tegenover bank "eb:") met dezelfde datum en hetzelfde bedrag die nog niet "gebruikt" is.
// Zelfde code in finance/import.js (tests/bank.test.mjs controleert dat ze hetzelfde doen).
export function dropKnown(rows, existing) {
  const src = id => String(id).split(':')[0];
  const have = new Set((existing || []).map(e => e.ext_id));
  const pool = new Map();
  for (const e of existing || []) { const k = `${src(e.ext_id)}|${e.booked_on}|${Math.round(Number(e.amount) * 100)}`; pool.set(k, (pool.get(k) || 0) + 1); }
  const srcs = [...new Set((existing || []).map(e => src(e.ext_id)))];
  return (rows || []).filter(r => {
    if (have.has(r.ext_id)) return false;
    const c = Math.round(Number(r.amount) * 100);
    for (const s of srcs) {
      if (s === src(r.ext_id)) continue;
      const k = `${s}|${r.booked_on}|${c}`;
      if (pool.get(k) > 0) { pool.set(k, pool.get(k) - 1); return false; }
    }
    return true;
  });
}

/* ---------- fouten ---------- */
// Soort fout uit het antwoord van Enable Banking (op de foutcode, niet op de HTTP-status).
export function errorKind(status, body) {
  const e = String((body && body.error) || '');
  if (['EXPIRED_SESSION', 'REVOKED_SESSION', 'CLOSED_SESSION', 'SESSION_DOES_NOT_EXIST', 'ACCESS_DENIED', 'UNAUTHORIZED_ACCESS', 'ASPSP_ACCOUNT_NOT_ACCESSIBLE'].includes(e)) return 'consent';
  if (['EXPIRED_AUTHORIZATION_CODE', 'WRONG_AUTHORIZATION_CODE', 'ALREADY_AUTHORIZED', 'WRONG_SESSION_STATUS'].includes(e)) return 'code';
  if (e === 'ASPSP_RATE_LIMIT_EXCEEDED' || status === 429) return 'rate';
  if (e === 'ASPSP_PSU_ACTION_REQUIRED' || e === 'PSU_HEADER_NOT_PROVIDED') return 'psu';
  if (e === 'REDIRECT_URI_NOT_ALLOWED') return 'redirect';
  if (e === 'NO_ACCOUNTS_ADDED') return 'noaccounts';
  if (status === 401 || status === 403) return 'app';
  return 'other';
}
export const ERROR_TEXT = {
  consent: 'De toestemming bij de bank is verlopen of ingetrokken. Koppel de rekening opnieuw.',
  code: 'Het koppelen duurde te lang of is al afgerond. Probeer het opnieuw.',
  rate: 'De bank wil vandaag niet vaker. Morgen gaat het vanzelf weer.',
  psu: 'De bank wil dat je erbij bent. Tik op Nu bijwerken.',
  redirect: 'Dit adres staat niet als terugkeeradres bij Enable Banking. De beheerder van de app moet het toevoegen.',
  noaccounts: 'Er is geen rekening gekozen bij de bank. Probeer het opnieuw en kies je rekening(en).',
  app: 'De koppeling met Enable Banking is niet goed ingesteld (sleutel of app). Vraag de beheerder van de app.',
  other: 'De bank gaf een fout. De app probeert het later opnieuw.',
};
