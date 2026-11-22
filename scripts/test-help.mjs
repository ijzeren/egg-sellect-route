#!/usr/bin/env node
// Rechtentest (lokaal) voor Hulp: vragen, antwoorden, goedkeuren en FAQ, als gezinslid (Lynn).
// Verwacht minstens één vraag in het gezin Dongstra (stel er een in de hub). Zie scripts/test-rls.mjs.
import { execFileSync } from 'node:child_process';
const URL = 'http://127.0.0.1:54321', KEY = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH', T = '377c50d1-466a-4328-b3c5-4e9cfe56bcf6';
const sql = q => execFileSync('docker', ['exec', '-i', 'supabase_db_lynn-eggselent', 'psql', '-U', 'postgres', '-d', 'postgres', '-tA', '-c', q], { encoding: 'utf8' }).trim();
const lynnEmail = sql(`select u.email from team_members m join auth.users u on u.id=m.user_id where m.team_id='${T}' and m.name='Lynn'`);
const r = await fetch(URL + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: lynnEmail, password: 'lokaal-123456' }) });
const L = await r.json();
const call = async (path, opts = {}) => { const x = await fetch(URL + path, { method: opts.method || 'GET', headers: { apikey: KEY, Authorization: 'Bearer ' + L.access_token, 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: opts.body ? JSON.stringify(opts.body) : undefined }); return { ok: x.ok, d: await x.json().catch(() => null) }; };
const out = [];
const check = (n, c) => out.push(`${c ? '✓' : '✗'} ${n}`);
check('Lynn ziet de vraag van haar gezin', (await call(`/rest/v1/questions?team_id=eq.${T}`)).d.length === 1);
check('Lynn kan geen FAQ publiceren', !(await call('/rest/v1/faq', { method: 'POST', body: { question: 'x', answer: 'y' } })).ok);
check('Lynn kan faq_candidates niet zien', !(await call('/rest/v1/rpc/faq_candidates', { method: 'POST', body: {} })).ok);
check('Lynn kan geen antwoord als Assistent plaatsen', !(await call('/rest/v1/answers', { method: 'POST', body: { question_id: sql(`select id from questions limit 1`), team_id: T, user_id: L.user.id, author: 'runner', text: 'x' } })).ok);
check('Lynn kan geen goedgekeurd antwoord invoegen', !(await call('/rest/v1/answers', { method: 'POST', body: { question_id: sql(`select id from questions limit 1`), team_id: T, user_id: L.user.id, text: 'x', accepted: true } })).ok);
const fs = await call(`/rest/v1/questions?id=eq.${sql('select id from questions limit 1')}`, { method: 'PATCH', body: { faq_status: null } });
check('faq_status niet te wijzigen door leden', !fs.ok);
const ans = await call('/rest/v1/answers', { method: 'POST', body: { question_id: sql(`select id from questions limit 1`), team_id: T, user_id: L.user.id, name: 'Lynn', text: 'Klopt, ik doe het ook zo.' } });
check('Lynn kan antwoorden', ans.ok);
check('Lynn (niet vrager, geen beheerder) kan niet goedkeuren', !(await call('/rest/v1/rpc/accept_answer', { method: 'POST', body: { p_answer: ans.d[0].id } })).ok);
await call(`/rest/v1/answers?id=eq.${ans.d[0].id}`, { method: 'DELETE' });
console.log(out.join('\n'));
