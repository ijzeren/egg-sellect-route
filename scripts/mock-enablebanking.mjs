#!/usr/bin/env node
// Nepbank: doet zich voor als Enable Banking, om de bankkoppeling van Financiën lokaal te testen zonder echte bank.
//
//   node scripts/mock-enablebanking.mjs <map>      start op poort 8799 en schrijft <map>/functions.env
//   npx supabase functions serve integrations --no-verify-jwt --env-file <map>/functions.env
//
// Maakt bij het starten een sleutelpaar; de privésleutel komt alleen in <map>/functions.env (gebruik je scratchpad,
// niet de repository). Controleert de handtekening van elke aanroep, zoals Enable Banking doet.
// Nepgegevens: twee rekeningen (NL00RABO…01 betaal, …02 spaar), transacties van de laatste 60 dagen.
import { createServer } from 'node:http';
import { generateKeyPairSync, createVerify, randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('Gebruik: node scripts/mock-enablebanking.mjs <map voor functions.env>'); process.exit(1); }
const PORT = 8799, APP = 'mock-app-id';
const TEAM = process.env.TEAM || '377c50d1-466a-4328-b3c5-4e9cfe56bcf6';
const REDIRECT = process.env.REDIRECT || 'http://localhost:8765/finance/';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'functions.env'), [
  `EB_API_URL=http://host.docker.internal:${PORT}`, `EB_APP_ID=${APP}`, `EB_PRIVATE_KEY="${privateKey.trim().replace(/\n/g, '\\n')}"`,
  `EB_TEAM_IDS=${TEAM}`, `EB_REDIRECT_URLS=${REDIRECT}`, 'INTEGRATIONS_ALLOW_HTTP=1', '',
].join('\n'));

const auths = new Map(), codes = new Map(), sessions = new Map();
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const iso = d => d.toISOString().slice(0, 10);
const daysAgo = n => iso(new Date(Date.now() - n * 864e5));
function transactions(uid) {
  const out = [];
  if (uid === 'uid-1') {
    for (let i = 1; i <= 60; i++) out.push({ entry_reference: `R${i}`, status: 'BOOK', credit_debit_indicator: 'DBIT', booking_date: daysAgo(i), transaction_amount: { currency: 'EUR', amount: (10 + (i % 7) * 3.15).toFixed(2) }, creditor: { name: i % 3 ? 'Albert Heijn 1234' : 'Jumbo Utrecht' }, remittance_information: ['Betaalautomaat'] });
    out.push({ entry_reference: 'P1', status: 'BOOK', credit_debit_indicator: 'CRDT', booking_date: daysAgo(5), transaction_amount: { currency: 'EUR', amount: '812.40' }, debtor: { name: 'Airbnb Payments Luxembourg S.A.' }, remittance_information: ['Payout'] });
    out.push({ entry_reference: 'S1', status: 'BOOK', credit_debit_indicator: 'DBIT', booking_date: daysAgo(3), transaction_amount: { currency: 'EUR', amount: '500.00' }, creditor: { name: 'Eigen spaarrekening' }, creditor_account: { iban: 'NL00RABO0000000002' }, remittance_information: ['Sparen'] });
    out.push({ entry_reference: 'X1', status: 'PDNG', credit_debit_indicator: 'DBIT', booking_date: daysAgo(0), transaction_amount: { currency: 'EUR', amount: '9.99' }, creditor: { name: 'Nog niet geboekt' } });
  } else out.push({ entry_reference: 'S1', status: 'BOOK', credit_debit_indicator: 'CRDT', booking_date: daysAgo(3), transaction_amount: { currency: 'EUR', amount: '500.00' }, debtor: { name: 'Eigen betaalrekening' }, debtor_account: { iban: 'NL00RABO0000000001' } });
  return out;
}
function verified(req) {
  const m = (req.headers.authorization || '').match(/^Bearer (.+)\.(.+)\.(.+)$/);
  if (!m) return false;
  const head = JSON.parse(Buffer.from(m[1], 'base64url')), body = JSON.parse(Buffer.from(m[2], 'base64url'));
  const v = createVerify('RSA-SHA256'); v.update(`${m[1]}.${m[2]}`);
  const now = Date.now() / 1000;
  return head.alg === 'RS256' && head.kid === APP && body.iss === 'enablebanking.com' && body.aud === 'api.enablebanking.com' && body.exp > now && body.exp - body.iat <= 86400 && v.verify(publicKey, Buffer.from(m[3], 'base64url'));
}
const send = (res, status, body, type = 'application/json') => { res.writeHead(status, { 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = ''; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : null;
  log(req.method, url.pathname, req.headers['psu-ip-address'] ? '(gebruiker erbij)' : '');
  // de "bank": inlogscherm met één knop
  if (url.pathname === '/bank') {
    const a = auths.get(url.searchParams.get('id'));
    if (!a) return send(res, 404, 'Onbekend', 'text/plain');
    const code = randomUUID(); codes.set(code, a);
    const back = `${a.redirect_url}?state=${a.state}&code=${code}`, no = `${a.redirect_url}?state=${a.state}&error=access_denied`;
    return send(res, 200, `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><h1>Nepbank</h1><p>Rekeningen: ••0001, ••0002</p><p><a id="ok" href="${back}">Toestemming geven</a></p><p><a id="no" href="${no}">Weigeren</a></p>`, 'text/html');
  }
  if (!verified(req)) return send(res, 401, { message: 'Bad JWT', error: 'UNAUTHORIZED_ACCESS' });
  if (url.pathname === '/aspsps') return send(res, 200, { aspsps: [{ name: 'ING', country: 'NL' }, { name: 'Rabobank', country: 'NL', maximum_consent_validity: 15552000, required_psu_headers: [], sandbox: false }] });
  if (url.pathname === '/auth' && req.method === 'POST') {
    if (body.redirect_url !== REDIRECT) return send(res, 400, { message: 'Redirect not allowed', error: 'REDIRECT_URI_NOT_ALLOWED' });
    const id = randomUUID(); auths.set(id, body);
    return send(res, 200, { url: `http://localhost:${PORT}/bank?id=${id}`, authorization_id: id });
  }
  if (url.pathname === '/sessions' && req.method === 'POST') {
    const a = codes.get(body.code); codes.delete(body.code);
    if (!a) return send(res, 400, { message: 'Wrong code', error: 'WRONG_AUTHORIZATION_CODE' });
    const sid = randomUUID(); sessions.set(sid, true);
    return send(res, 200, { session_id: sid, access: { valid_until: a.access.valid_until }, aspsp: a.aspsp, psu_type: 'personal', accounts: [
      { uid: 'uid-1', account_id: { iban: 'NL00RABO0000000001' }, name: 'Nep betaalrekening', currency: 'EUR', cash_account_type: 'CACC' },
      { uid: 'uid-2', account_id: { iban: 'NL00RABO0000000002' }, name: 'Nep spaarrekening', currency: 'EUR', cash_account_type: 'SVGS' },
    ] });
  }
  let m = url.pathname.match(/^\/sessions\/(.+)$/);
  if (m && req.method === 'DELETE') { sessions.delete(m[1]); return send(res, 200, { message: 'OK' }); }
  m = url.pathname.match(/^\/accounts\/(uid-\d)\/(transactions|balances)$/);
  if (m && m[2] === 'balances') return send(res, 200, { balances: [{ name: 'Booked', balance_type: 'CLBD', balance_amount: { currency: 'EUR', amount: m[1] === 'uid-1' ? '1234.56' : '10500.00' }, reference_date: daysAgo(1) }] });
  if (m) {
    const from = url.searchParams.get('date_from') || '0000';
    const all = transactions(m[1]).filter(t => t.booking_date >= from), page = +(url.searchParams.get('continuation_key') || 0);
    return send(res, 200, { transactions: all.slice(page * 25, page * 25 + 25), continuation_key: all.length > (page + 1) * 25 ? String(page + 1) : null });
  }
  send(res, 404, { message: 'Not found' });
}).listen(PORT, () => log(`Nepbank op http://localhost:${PORT}; ${join(dir, 'functions.env')} geschreven`));
