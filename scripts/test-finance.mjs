#!/usr/bin/env node
// Rechtentest Financiën (lokaal, op een kopie van productie): wie ziet welke rekening.
// Verwacht het gezin Dongstra met Marien (beheerder) en Lynn (lid). Zet Financiën tijdelijk aan en ruimt alles op.
// Draai hem nooit tegen productie.
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
const hadApp = sql(`select count(*) from team_apps where team_id='${T}' and app='finance'`) === '1';
sql(`delete from finance_accounts where team_id='${T}'; delete from finance_categories where team_id='${T}'; insert into team_apps(team_id, app) values ('${T}', 'finance') on conflict do nothing`);
try {
  const s1 = await call(L, '/rest/v1/rpc/finance_setup', { method: 'POST', body: { p_team: T } });
  check('standaardsoorten aangemaakt (24)', s1.d === 24);
  check('tweede keer: niets dubbel', (await call(M, '/rest/v1/rpc/finance_setup', { method: 'POST', body: { p_team: T } })).d === 0);
  const cats = (await call(M, `/rest/v1/finance_categories?team_id=eq.${T}&select=id,name`)).d;
  const food = cats.find(c => c.name === 'Boodschappen').id;

  const la = await call(L, '/rest/v1/finance_accounts', { method: 'POST', body: { team_id: T, name: 'Lynn', iban_last4: '0001', iban_hash: h('a') } });
  check('Lynn maakt een rekening (insert … returning werkt)', la.ok && la.d[0].user_id === L.id);
  const lid = la.d[0].id;
  check('Marien (beheerder) ziet Lynns privérekening niet', (await call(M, `/rest/v1/finance_accounts?id=eq.${lid}`)).d.length === 0);
  const tx = await call(L, '/rest/v1/finance_transactions', { method: 'POST', body: { team_id: T, account_id: lid, ext_id: 'x1', booked_on: '2026-01-02', amount: -12.5, counterparty: 'Winkel', category_id: food, category_by: 'manual' } });
  check('Lynn leest een transactie in', tx.ok);
  check('Marien ziet die transactie niet', (await call(M, `/rest/v1/finance_transactions?account_id=eq.${lid}`)).d.length === 0);
  const dup = await call(L, `/rest/v1/finance_transactions?on_conflict=account_id,ext_id`, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=representation' }, body: [{ team_id: T, account_id: lid, ext_id: 'x1', booked_on: '2026-01-02', amount: -99, counterparty: 'Anders' }, { team_id: T, account_id: lid, ext_id: 'x2', booked_on: '2026-01-03', amount: 5, counterparty: '' }] });
  check('opnieuw inlezen: alleen het nieuwe erbij, oude blijft', dup.ok && dup.d.length === 1 && sql(`select amount || '|' || category_by from finance_transactions where account_id='${lid}' and ext_id='x1'`) === '-12.50|manual');
  const up = await call(L, `/rest/v1/finance_transactions?account_id=eq.${lid}&ext_id=eq.x1`, { method: 'PATCH', body: { amount: 1000, excluded: true } });
  check('bedrag uit de bank is niet te wijzigen, "telt niet mee" wel', up.ok && up.d[0].amount === -12.5 && up.d[0].excluded === true);
  check('Marien mag niets inlezen op Lynns rekening', !(await call(M, '/rest/v1/finance_transactions', { method: 'POST', body: { team_id: T, account_id: lid, ext_id: 'm1', booked_on: '2026-01-02', amount: 1 } })).ok);

  check('Lynn deelt haar rekening', (await call(L, `/rest/v1/finance_accounts?id=eq.${lid}`, { method: 'PATCH', body: { shared: true } })).d[0].shared === true);
  check('Marien (beheerder) ziet hem nu', (await call(M, `/rest/v1/finance_accounts?id=eq.${lid}`)).d.length === 1);
  check('… en de transacties', (await call(M, `/rest/v1/finance_transactions?account_id=eq.${lid}`)).d.length === 2);
  check('Marien mag nu wel inlezen en indelen', (await call(M, '/rest/v1/finance_transactions', { method: 'POST', body: { team_id: T, account_id: lid, ext_id: 'm1', booked_on: '2026-01-04', amount: 1 } })).ok);
  const rn = await call(M, `/rest/v1/finance_accounts?id=eq.${lid}`, { method: 'PATCH', body: { name: 'Van Marien' } });
  check('Marien mag naam en delen niet wijzigen', !rn.ok && sql(`select name from finance_accounts where id='${lid}'`) === 'Lynn');
  check('Marien mag het saldo bijwerken', (await call(M, `/rest/v1/finance_accounts?id=eq.${lid}`, { method: 'PATCH', body: { balance: 10, balance_on: '2026-01-04' } })).ok);
  check('Marien mag Lynns rekening niet verwijderen', (await call(M, `/rest/v1/finance_accounts?id=eq.${lid}`, { method: 'DELETE' })).d.length === 0 && sql(`select count(*) from finance_accounts where id='${lid}'`) === '1');

  const ma = await call(M, '/rest/v1/finance_accounts', { method: 'POST', body: { team_id: T, name: 'Marien', iban_last4: '0002', iban_hash: h('b'), shared: true } });
  check('Marien maakt een gedeelde rekening', ma.ok);
  check('Lynn (lid) ziet een gedeelde rekening van een ander niet', (await call(L, `/rest/v1/finance_accounts?id=eq.${ma.d[0].id}`)).d.length === 0);
  const same = await call(M, '/rest/v1/finance_accounts', { method: 'POST', body: { team_id: T, name: 'Dubbel', iban_hash: h('a') } });
  check('dezelfde rekening twee keer in één gezin: 409', same.status === 409);
  check('niemand kan een rekening op naam van een ander maken', !(await call(M, '/rest/v1/finance_accounts', { method: 'POST', body: { team_id: T, user_id: L.id, name: 'X', iban_hash: h('c') } })).ok);
  check('soort uit een ander gezin weigeren', !(await call(L, `/rest/v1/finance_transactions?account_id=eq.${lid}&ext_id=eq.x2`, { method: 'PATCH', body: { category_id: '00000000-0000-0000-0000-000000000000' } })).ok);

  await call(M, `/rest/v1/team_apps?team_id=eq.${T}&app=eq.finance`, { method: 'PATCH', body: { enabled: false } });
  check('app uit → Lynn ziet niets meer', (await call(L, `/rest/v1/finance_accounts?team_id=eq.${T}`)).d.length === 0);
  await call(M, `/rest/v1/team_apps?team_id=eq.${T}&app=eq.finance`, { method: 'PATCH', body: { enabled: true } });
  check('verwijderen wist de transacties', (await call(L, `/rest/v1/finance_accounts?id=eq.${lid}`, { method: 'DELETE' })).ok && sql(`select count(*) from finance_transactions where account_id='${lid}'`) === '0');
} finally {
  sql(`delete from finance_accounts where team_id='${T}'; delete from finance_rules where team_id='${T}'; delete from finance_categories where team_id='${T}'`);
  if (!hadApp) sql(`delete from team_apps where team_id='${T}' and app='finance'`);
}
console.log(res.join('\n'));
if (res.some(r => r.startsWith('✗'))) process.exit(1);
