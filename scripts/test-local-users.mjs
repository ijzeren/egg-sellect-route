#!/usr/bin/env node
// Test (lokaal): maakt lokale Supabase-gebruikers met dezelfde e-mailadressen als de gezinsleden in productie,
// zodat scripts/prod-naar-lokaal.mjs ze kan koppelen. Wachtwoord = 'lokaal-123456' (devLogin-conventie).
// Leest productie alleen-lezen via de Supabase CLI; drukt geen e-mailadressen af.
//   node scripts/test-local-users.mjs
// Volledige migratietest: zie de kop van scripts/test-rls.mjs.
import { execFileSync } from 'node:child_process';
const root = new URL('..', import.meta.url).pathname;
const out = execFileSync('npx', ['supabase', 'db', 'query', '--remote=istqegonfkfrkyddfajd', '--read-only', '--output-format', 'json',
  "select lower(u.email) as email from public.team_members tm join auth.users u on u.id = tm.user_id"], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const rows = JSON.parse(out.slice(out.indexOf('{'))).rows;
const key = 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH';
let n = 0;
for (const { email } of rows) {
  const r = await fetch('http://127.0.0.1:54321/auth/v1/signup', { method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'lokaal-123456' }) });
  if (r.ok) n++; else console.log('signup', r.status, (await r.text()).slice(0, 120));
}
console.log(`lokale gebruikers aangemaakt: ${n} van ${rows.length}`);
