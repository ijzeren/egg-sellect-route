#!/usr/bin/env node
// Rechtentest (lokaal) voor het hoofdbeheer: apps voor iedereen aan/uit, gezinnen uitschakelen/verwijderen,
// hoofdbeheerders. Verwacht de lokale kopie van productie met Marien als hoofdbeheerder en Lynn als lid
// (zie scripts/test-rls.mjs). Maakt een tijdelijk testgezin aan en verwijdert het weer.
import { execFileSync } from 'node:child_process';
const URL = 'http://127.0.0.1:54321', KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', T = '377c50d1-466a-4328-b3c5-4e9cfe56bcf6';
const sql = q => execFileSync('docker', ['exec', '-i', 'supabase_db_lynn-eggselent', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', q], { encoding: 'utf8' }).trim();
const who = Object.fromEntries(sql(`select m.name || '|' || u.email from team_members m join auth.users u on u.id = m.user_id where m.team_id = '${T}'`).split('\n').map(l => l.split('|')));
async function login(email) { const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'lokaal-123456' }) }); const d = await r.json(); return { tok: d.access_token, id: d.user.id }; }
const call = async (u, path, body, method) => { const r = await fetch(URL + path, { method: method || (body ? 'POST' : 'GET'), headers: { apikey: KEY, 'Content-Type': 'application/json', ...(u ? { Authorization: 'Bearer ' + u.tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { ok: r.ok, d }; };
const rpc = (u, f, b) => call(u, '/rest/v1/rpc/' + f, b || {});
const out = [], check = (n, c) => out.push(`${c ? '✓' : '✗'} ${n}`);
const M = await login(who.Marien), L = await login(who.Lynn);

const fams = await rpc(M, 'platform_families');
check('hoofdbeheerder ziet gezinnen met aantallen', fams.ok && fams.d.some(f => f.team_id === T && f.members === 2));
check('overzicht bevat geen namen of e-mailadressen van leden', fams.ok && !JSON.stringify(fams.d).includes('@') && !JSON.stringify(fams.d).includes('Lynn'));
check('lid kan het overzicht niet zien', !(await rpc(L, 'platform_families')).ok);
check('lid kan geen app voor iedereen uitzetten', !(await rpc(L, 'platform_set_app', { p_app: 'training', p_enabled: false })).ok);
check('lid kan platform_apps niet direct wijzigen', !(await call(L, '/rest/v1/platform_apps', { app: 'training', enabled: false })).ok);

// app voor iedereen uit
check('hoofdbeheerder zet Training uit voor iedereen', (await rpc(M, 'platform_set_app', { p_app: 'training', p_enabled: false })).ok);
check('Training verdwijnt uit my_teams van Lynn', !(await rpc(L, 'my_teams')).d[0].apps.training);
check('Egg-sellent blijft', !!(await rpc(L, 'my_teams')).d[0].apps.eggs);
check('platform_apps ook zonder login te lezen', (await call(null, '/rest/v1/platform_apps?select=app,enabled')).d.some(a => a.app === 'training' && !a.enabled));
await rpc(M, 'platform_set_app', { p_app: 'training', p_enabled: true });
check('Training weer aan', !!(await rpc(L, 'my_teams')).d[0].apps.training);

// gezin uitschakelen
check('hoofdbeheerder schakelt gezin uit', (await rpc(M, 'platform_set_family_disabled', { p_team: T, p_disabled: true })).ok);
const lt = (await rpc(L, 'my_teams')).d[0];
check('Lynn ziet gezin als uitgeschakeld, zonder apps', lt.disabled === true && Object.keys(lt.apps).length === 0);
check('Lynn ziet dan geen adressen', (await call(L, `/rest/v1/addresses?team_id=eq.${T}&select=id`)).d.length === 0);
await rpc(M, 'platform_set_family_disabled', { p_team: T, p_disabled: false });
check('na inschakelen weer 145 adressen', (await call(L, `/rest/v1/addresses?team_id=eq.${T}&select=id`)).d.length === 145);

// gezin verwijderen (tijdelijk testgezin van Lynn, met Marien erbij als lid)
const tid = (await rpc(L, 'create_team', { p_name: 'Tijdelijk testgezin', p_member_name: 'L', p_apps: ['training'] })).d;
sql(`insert into team_members(team_id, user_id, role, name) values ('${tid}', '${M.id}', 'member', 'M')`);
check('verkeerde bevestiging weigert verwijderen', !(await rpc(M, 'platform_delete_family', { p_team: tid, p_confirm: 'iets anders' })).ok);
check('lid kan geen gezin verwijderen via beheer', !(await rpc(L, 'platform_delete_family', { p_team: tid, p_confirm: 'Tijdelijk testgezin' })).ok);
const del = await rpc(M, 'platform_delete_family', { p_team: tid, p_confirm: 'Tijdelijk testgezin' });
check('hoofdbeheerder verwijdert gezin (met beheerder en lid)', del.ok && sql(`select count(*) from teams where id='${tid}'`) === '0' && sql(`select count(*) from team_members where team_id='${tid}'`) === '0');

// hoofdbeheerders
const roles = await rpc(M, 'platform_role_list');
check('rollenlijst toont alleen rolhouders', roles.ok && roles.d.length >= 1 && roles.d.every(r => ['admin', 'runner'].includes(r.role)));
check('laatste hoofdbeheerder kan niet weg', !(await rpc(M, 'platform_role_remove', { p_user: M.id, p_role: 'admin' })).ok);
check('onbekend e-mailadres geeft nette fout', !(await rpc(M, 'platform_role_add', { p_email: 'bestaat-niet@familie.test', p_role: 'admin' })).ok);
check('lid kan geen hoofdbeheerder toevoegen', !(await rpc(L, 'platform_role_add', { p_email: who.Lynn, p_role: 'admin' })).ok);
check('lid kan rollen niet direct invoegen', !(await call(L, '/rest/v1/platform_roles', { user_id: L.id, role: 'admin' })).ok);
console.log(out.join('\n'));
