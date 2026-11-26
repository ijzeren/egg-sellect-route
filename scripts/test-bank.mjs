#!/usr/bin/env node
// Rechtentest bankkoppeling Financiën (lokaal, op een kopie van productie): wie ziet de koppeling en de geheimen.
// Verwacht het gezin Dongstra met Marien (beheerder) en Lynn (lid). Ruimt alles op. Draai hem nooit tegen productie.
// Het koppelen zelf test je met de nepbank: scripts/mock-enablebanking.mjs.
import { execFileSync } from 'node:child_process';
const URL = 'http://127.0.0.1:54321', KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', T = '377c50d1-466a-4328-b3c5-4e9cfe56bcf6';
const sql = q => execFileSync('docker', ['exec', '-i', 'supabase_db_lynn-eggselent', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', q], { encoding: 'utf8' }).trim();
const who = Object.fromEntries(sql(`select m.name || '|' || u.email from team_members m join auth.users u on u.id = m.user_id where m.team_id = '${T}'`).split('\n').map(l => l.split('|')));
async function login(email) { const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'lokaal-123456' }) }); const d = await r.json(); return { tok: d.access_token, id: d.user.id }; }
const call = async (u, path, opts = {}) => { const r = await fetch(URL + path, { method: opts.method || 'GET', headers: { apikey: KEY, Authorization: 'Bearer ' + u.tok, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: opts.body ? JSON.stringify(opts.body) : undefined }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { ok: r.ok, status: r.status, d }; };
const res = [];
const check = (name, cond) => res.push(`${cond ? '✓' : '✗'} ${name}`);
const M = await login(who.Marien), L = await login(who.Lynn);
const had = sql(`select count(*) from team_apps where team_id='${T}' and app='finance'`) === '1';
const clean = () => sql(`delete from integrations where team_id='${T}' and type='bank'; delete from finance_accounts where team_id='${T}' and iban_hash in ('${'c'.repeat(64)}', '${'d'.repeat(64)}')`);
clean();
sql(`insert into team_apps(team_id, app) values ('${T}', 'finance') on conflict do nothing`);
try {
  // zoals de server het na het koppelen achterlaat (service role)
  const it = sql(`insert into integrations(team_id, user_id, type, label, config, status) values ('${T}', '${M.id}', 'bank', 'Rabobank', '{"valid_until":"2027-05-24T00:00:00+00:00","pending":"${'e'.repeat(64)}"}', 'ok') returning id`).split('\n')[0];
  sql(`insert into integration_secrets(integration_id, secret) values ('${it}', 'sessie-geheim')`);
  const acc = sql(`insert into finance_accounts(team_id, user_id, name, iban_last4, iban_hash, integration_id, shared) values ('${T}', '${M.id}', 'Bank', '0001', '${'c'.repeat(64)}', '${it}', true) returning id`).split('\n')[0];
  sql(`insert into finance_bank_accounts(integration_id, account_id, uid) values ('${it}', '${acc}', 'uid-1')`);

  check('Marien ziet zijn bankkoppeling', (await call(M, `/rest/v1/integrations?id=eq.${it}`)).d.length === 1);
  check('Lynn ziet Mariens bankkoppeling niet', (await call(L, `/rest/v1/integrations?id=eq.${it}`)).d.length === 0);
  const runs = sql(`insert into integration_runs(integration_id, team_id, ok, added) values ('${it}', '${T}', true, 3) returning id`);
  check('… en ook het logboek niet', runs && (await call(L, `/rest/v1/integration_runs?integration_id=eq.${it}`)).d.length === 0);
  check('niemand leest de sessie bij de bank', !(await call(M, `/rest/v1/integration_secrets?integration_id=eq.${it}`)).ok);
  check('niemand leest de koppeling rekening ↔ bank', !(await call(M, `/rest/v1/finance_bank_accounts?integration_id=eq.${it}`)).ok);
  check('niemand maakt zelf een bankkoppeling', !(await call(M, '/rest/v1/integrations', { method: 'POST', body: { team_id: T, user_id: M.id, type: 'bank', label: 'X' } })).ok);
  await call(M, `/rest/v1/finance_accounts?id=eq.${acc}`, { method: 'PATCH', body: { integration_id: null, name: 'Bank 2' } });
  check('de koppeling op de rekening zet alleen de server', sql(`select (integration_id is not null) || '|' || name from finance_accounts where id='${acc}'`) === 'true|Bank 2');
  check('Lynn (lid) ziet de rekening niet, ook al is hij gedeeld', (await call(L, `/rest/v1/finance_accounts?id=eq.${acc}`)).d.length === 0);
  const ownA = sql(`insert into finance_accounts(team_id, user_id, name, iban_last4, iban_hash) values ('${T}', '${L.id}', 'L', '0002', '${'d'.repeat(64)}') returning id`).split('\n')[0];
  check('Lynn kan op haar eigen rekening geen koppeling zetten', (await call(L, `/rest/v1/finance_accounts?id=eq.${ownA}`, { method: 'PATCH', body: { integration_id: it } })).ok && sql(`select integration_id is null from finance_accounts where id='${ownA}'`) === 't');
  // lid verlaat het gezin: bankkoppeling weg (in een transactie die we terugdraaien)
  const left = sql(`begin; delete from team_members where team_id='${T}' and user_id='${M.id}'; select count(*) from integrations where id='${it}'; rollback;`);
  check('wie het gezin verlaat, verliest de bankkoppeling', left.split('\n').includes('0'));
  sql(`delete from integrations where id='${it}'`);
  check('ontkoppelen: rekening en transacties blijven, koppeling leeg', sql(`select (integration_id is null)::text from finance_accounts where id='${acc}'`) === 'true' && sql(`select count(*) from finance_bank_accounts where account_id='${acc}'`) === '0');
} finally {
  clean();
  if (!had) sql(`delete from team_apps where team_id='${T}' and app='finance'`);
}
console.log(res.join('\n'));
if (res.some(r => r.startsWith('✗'))) process.exit(1);
