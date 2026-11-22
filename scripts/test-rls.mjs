#!/usr/bin/env node
// Rechtentest (lokaal) op een kopie van productie: gezinsrollen, apps per gezin, toegang per lid, Training.
// Verwacht het gezin Dongstra met Marien (beheerder) en Lynn (lid, bezorger) en GEEN andere beheerders.
//
// Volledige migratietest (zoals gedaan voor v3.1/v3.2):
//   1. lokale database met het OUDE schema: zet tijdelijk het oude schema.sql in supabase/migrations en
//      `npx supabase db reset` (zet daarna de symlink naar ../schema.sql terug)
//   2. node scripts/test-local-users.mjs && node scripts/prod-naar-lokaal.mjs
//   3. schema.sql en migrate-family-dongstra.sql (twee keer) via psql in de container supabase_db_lynn-eggselent
//   4. node scripts/test-rls.mjs && node scripts/test-help.mjs   → alles ✓
// Let op: test-rls verandert tijdelijk rechten en zet ze terug; draai hem niet tegen productie.
import { execFileSync } from 'node:child_process';
const URL = 'http://127.0.0.1:54321', KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', T = '377c50d1-466a-4328-b3c5-4e9cfe56bcf6';
const sql = q => execFileSync('docker', ['exec', '-i', 'supabase_db_lynn-eggselent', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', q], { encoding: 'utf8' }).trim();
const who = Object.fromEntries(sql(`select m.name || '|' || u.email from team_members m join auth.users u on u.id = m.user_id where m.team_id = '${T}'`).split('\n').map(l => l.split('|')));
async function login(email) { const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'lokaal-123456' }) }); const d = await r.json(); return { tok: d.access_token, id: d.user.id }; }
const call = async (u, path, opts = {}) => { const r = await fetch(URL + path, { method: opts.method || 'GET', headers: { apikey: KEY, Authorization: 'Bearer ' + u.tok, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opts.headers || {}) }, body: opts.body ? JSON.stringify(opts.body) : undefined }); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { ok: r.ok, status: r.status, d }; };
const res = [];
const check = (name, cond) => res.push(`${cond ? '✓' : '✗'} ${name}`);
const M = await login(who.Marien), L = await login(who.Lynn);
const mt = await call(M, '/rest/v1/rpc/my_teams', { method: 'POST', body: {} }), lt = await call(L, '/rest/v1/rpc/my_teams', { method: 'POST', body: {} });
check('my_teams Marien: admin, eggs admin, training', mt.d[0].role === 'admin' && mt.d[0].apps.eggs.role === 'admin' && !!mt.d[0].apps.training);
check('my_teams Lynn: member, eggs walker, training member', lt.d[0].role === 'member' && lt.d[0].apps.eggs.role === 'walker' && lt.d[0].apps.training.role === 'member');
check('gezinsnaam = Familie Dongstra', mt.d[0].team_name === 'Familie Dongstra');
const ca = async u => (await call(u, `/rest/v1/addresses?team_id=eq.${T}&select=id`)).d.length;
check('Lynn ziet 145 adressen', await ca(L) === 145);
check('Lynn mag gezinsnaam niet wijzigen', !(await call(L, `/rest/v1/teams?id=eq.${T}`, { method: 'PATCH', body: { name: 'X' } })).ok || sql(`select name from teams where id='${T}'`) === 'Familie Dongstra');
const lw = await call(L, `/rest/v1/teams?id=eq.${T}`, { method: 'PATCH', body: { absence_script: 'lynn' } });
check('Lynn (bezorger) mag eierinstellingen niet wijzigen', !lw.ok || !lw.d.length);
const mw = await call(M, `/rest/v1/teams?id=eq.${T}`, { method: 'PATCH', body: { absence_script: sql(`select absence_script from teams where id='${T}'`) } });
check('Marien mag eierinstellingen wijzigen', mw.ok && mw.d.length === 1);
check('Lynn mag geen uitnodiging maken', !(await call(L, '/rest/v1/rpc/create_invite', { method: 'POST', body: { p_team: T } })).ok);
check('Lynn mag geen app aanzetten', !(await call(L, '/rest/v1/team_apps', { method: 'POST', body: { team_id: T, app: 'test' } })).ok);
check('Lynn mag haar rol niet ophogen', !(await call(L, `/rest/v1/team_members?team_id=eq.${T}&user_id=eq.${L.id}`, { method: 'PATCH', body: { role: 'admin' } })).ok);
check('Marien kan niet de laatste beheerder af', !(await call(M, `/rest/v1/team_members?team_id=eq.${T}&user_id=eq.${M.id}`, { method: 'PATCH', body: { role: 'member' } })).ok);
const tr = await call(L, '/rest/v1/training_tracks', { method: 'POST', body: { team_id: T, id: 'rls-test', program: 'pilates30', participants: [L.id, M.id], data: {} } });
check('Lynn mag een training aanmaken', tr.ok);
check('Marien ziet die training', (await call(M, `/rest/v1/training_tracks?id=eq.rls-test`)).d.length === 1);
// toegang per lid: Marien zet Egg-sellent uit voor Lynn
const off = await call(M, '/rest/v1/team_member_apps?on_conflict=team_id,user_id,app', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: { team_id: T, user_id: L.id, app: 'eggs', access: false, role: 'walker' } });
check('Marien zet Egg-sellent uit voor Lynn', off.ok);
check('Lynn ziet dan geen adressen', await ca(L) === 0);
check('my_teams Lynn zonder eggs', !(await call(L, '/rest/v1/rpc/my_teams', { method: 'POST', body: {} })).d[0].apps.eggs);
await call(M, '/rest/v1/team_member_apps?on_conflict=team_id,user_id,app', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: { team_id: T, user_id: L.id, app: 'eggs', access: null, role: 'walker' } });
check('na terugzetten weer 145 adressen', await ca(L) === 145);
// app uit voor het hele gezin
await call(M, `/rest/v1/team_apps?team_id=eq.${T}&app=eq.training`, { method: 'PATCH', body: { enabled: false } });
check('training uit → Lynn ziet geen trainingen', (await call(L, `/rest/v1/training_tracks?team_id=eq.${T}`)).d.length === 0);
await call(M, `/rest/v1/team_apps?team_id=eq.${T}&app=eq.training`, { method: 'PATCH', body: { enabled: true } });
await call(M, `/rest/v1/training_tracks?team_id=eq.${T}&id=eq.rls-test`, { method: 'DELETE' });
// kind
const inv = await call(M, '/rest/v1/rpc/create_invite', { method: 'POST', body: { p_team: T, p_role: 'child' } });
check('Marien maakt kind-uitnodiging', inv.ok && typeof inv.d === 'string');
const nt = await call(M, '/rest/v1/rpc/create_team', { method: 'POST', body: { p_name: 'Testgezin', p_member_name: 'M', p_apps: ['training'] } });
check('nieuw gezin met alleen training', nt.ok && sql(`select string_agg(app, ',') from team_apps where team_id='${nt.d}'`) === 'training');
sql(`delete from teams where id='${nt.d}'; delete from team_invites where team_id='${T}'`);
console.log(res.join('\n'));
