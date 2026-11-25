#!/usr/bin/env node
// Rechtentest uitbetalingen Financiën → Verhuur (lokaal, op een kopie van productie): wie mag koppelen en wie ziet wat.
// Verwacht het gezin Dongstra met Marien (beheerder) en Lynn (lid). Zet Financiën en Verhuur tijdelijk aan en ruimt
// alles op. Draai hem nooit tegen productie.
import { execFileSync } from 'node:child_process';
const URL = 'http://127.0.0.1:54321', KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', T = '377c50d1-466a-4328-b3c5-4e9cfe56bcf6';
const sql = q => execFileSync('docker', ['exec', '-i', 'supabase_db_lynn-eggselent', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', q], { encoding: 'utf8' }).trim();
const who = Object.fromEntries(sql(`select m.name || '|' || u.email from team_members m join auth.users u on u.id = m.user_id where m.team_id = '${T}'`).split('\n').map(l => l.split('|')));
async function login(email) { const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'lokaal-123456' }) }); const d = await r.json(); return { tok: d.access_token, id: d.user.id }; }
const call = async (u, path, opts = {}) => { const r = await fetch(URL + path, { method: opts.method || 'GET', headers: { apikey: KEY, Authorization: 'Bearer ' + u.tok, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { ok: r.ok, status: r.status, d }; };
const res = [];
const check = (name, cond) => res.push(`${cond ? '✓' : '✗'} ${name}`);
const h = c => c.repeat(64);
const M = await login(who.Marien), L = await login(who.Lynn);
const had = Object.fromEntries(['finance', 'rentals'].map(a => [a, sql(`select count(*) from team_apps where team_id='${T}' and app='${a}'`) === '1']));
const clean = () => sql(`delete from rental_houses where team_id='${T}'; delete from finance_accounts where team_id='${T}'; delete from finance_categories where team_id='${T}'; delete from team_member_apps where team_id='${T}' and app='rentals'`);
clean();
sql(`insert into team_apps(team_id, app) values ('${T}', 'finance'), ('${T}', 'rentals') on conflict do nothing`);
try {
  // rekeningen: van Marien en van Lynn, allebei privé
  const ma = (await call(M, '/rest/v1/finance_accounts', { method: 'POST', body: { team_id: T, name: 'M', iban_last4: '0001', iban_hash: h('a') } })).d[0];
  const la = (await call(L, '/rest/v1/finance_accounts', { method: 'POST', body: { team_id: T, name: 'L', iban_last4: '0002', iban_hash: h('b') } })).d[0];
  const tx = async (u, acc, ext, amount, cp) => (await call(u, '/rest/v1/finance_transactions', { method: 'POST', body: { team_id: T, account_id: acc, ext_id: ext, booked_on: '2026-07-13', amount, counterparty: cp } })).d[0];
  const mt = await tx(M, ma.id, 'm1', 812.4, 'Airbnb'), mneg = await tx(M, ma.id, 'm2', -10, 'Airbnb'), lt = await tx(L, la.id, 'l1', 500, 'Booking.com');
  // Verhuur: huis en twee boekingen (Marien is gezinsbeheerder, dus beheerder van Verhuur)
  const house = (await call(M, '/rest/v1/rental_houses', { method: 'POST', body: { team_id: T, name: 'Huis' } })).d[0];
  const bk = async (source, arrival, departure) => (await call(M, '/rest/v1/rental_bookings', { method: 'POST', body: { team_id: T, house_id: house.id, source, arrival, departure, guests: 2, adults: 2 } })).d[0];
  const b1 = await bk('airbnb', '2026-07-12', '2026-07-19'), b2 = await bk('booking', '2026-07-01', '2026-07-05');
  const link = (u, body) => call(u, '/rest/v1/rental_booking_payouts', { method: 'POST', body: { team_id: T, paid_on: '2000-01-01', ...body } });

  const p1 = await link(M, { booking_id: b1.id, transaction_id: mt.id, amount: 812.4 });
  check('beheerder Verhuur koppelt een eigen bijschrijving', p1.ok);
  check('datum komt van de transactie', p1.ok && p1.d[0].paid_on === '2026-07-13');
  check('samen meer dan de transactie: geweigerd', !(await link(M, { booking_id: b2.id, transaction_id: mt.id, amount: 1 })).ok);
  check('afschrijving koppelen: geweigerd', !(await link(M, { booking_id: b2.id, transaction_id: mneg.id, amount: 5 })).ok);
  check('boeking uit een ander gezin: geweigerd', !(await link(M, { booking_id: '00000000-0000-0000-0000-000000000000', transaction_id: mt.id, amount: 1 })).ok);
  check('Marien mag Lynns privétransactie niet koppelen', !(await link(M, { booking_id: b2.id, transaction_id: lt.id, amount: 500 })).ok);
  check('Lynn (kijker in Verhuur) ziet geen uitbetalingen', (await call(L, `/rest/v1/rental_booking_payouts?team_id=eq.${T}`)).d.length === 0);
  check('Lynn (kijker) mag niet koppelen', !(await link(L, { booking_id: b2.id, transaction_id: lt.id, amount: 500 })).ok);

  sql(`insert into team_member_apps(team_id, user_id, app, role) values ('${T}', '${L.id}', 'rentals', 'admin') on conflict (team_id, user_id, app) do update set role = 'admin'`);
  const seen = (await call(L, `/rest/v1/rental_booking_payouts?team_id=eq.${T}`)).d;
  check('Lynn (beheerder Verhuur) ziet datum en bedrag van Mariens uitbetaling', seen.length === 1 && seen[0].amount === 812.4);
  check('… maar niet de transactie zelf', (await call(L, `/rest/v1/finance_transactions?id=eq.${mt.id}`)).d.length === 0);
  check('Lynn koppelt haar eigen bijschrijving', (await link(L, { booking_id: b2.id, transaction_id: lt.id, amount: 500 })).ok);
  check('Lynn mag Mariens koppeling niet weghalen', (await call(L, `/rest/v1/rental_booking_payouts?transaction_id=eq.${mt.id}`, { method: 'DELETE' })).d.length === 0 && sql(`select count(*) from rental_booking_payouts where transaction_id='${mt.id}'`) === '1');
  check('Lynn mag Mariens koppeling niet wijzigen', (await call(L, `/rest/v1/rental_booking_payouts?transaction_id=eq.${mt.id}`, { method: 'PATCH', body: { amount: 1 } })).d.length === 0);
  check('dezelfde boeking twee keer aan één transactie: geweigerd', !(await link(L, { booking_id: b2.id, transaction_id: lt.id, amount: 1 })).ok);

  await call(M, `/rest/v1/finance_accounts?id=eq.${ma.id}`, { method: 'DELETE' });
  check('rekening weg: uitbetaling blijft bij de boeking', sql(`select coalesce(transaction_id::text, 'leeg') || '|' || amount from rental_booking_payouts where booking_id='${b1.id}'`) === 'leeg|812.40');
  check('losse uitbetaling kan een beheerder weghalen', (await call(L, `/rest/v1/rental_booking_payouts?booking_id=eq.${b1.id}`, { method: 'DELETE' })).d.length === 1);
  await call(M, `/rest/v1/rental_bookings?id=eq.${b2.id}`, { method: 'DELETE' });
  check('boeking weg: koppeling weg', sql(`select count(*) from rental_booking_payouts where booking_id='${b2.id}'`) === '0');
} finally {
  clean();
  for (const [a, was] of Object.entries(had)) if (!was) sql(`delete from team_apps where team_id='${T}' and app='${a}'`);
}
console.log(res.join('\n'));
if (res.some(r => r.startsWith('✗'))) process.exit(1);
