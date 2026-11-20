#!/usr/bin/env node
// Egg-sellent — productiegegevens ophalen naar de lokale Supabase (development).
//
//   node scripts/prod-naar-lokaal.mjs                 alle teams uit productie
//   node scripts/prod-naar-lokaal.mjs jij@voorbeeld.nl   en maak deze lokale gebruiker(s) ook beheerder
//
// Wat het doet:
//   1. Leest productie ALLEEN-LEZEN via de Supabase CLI (je eigen `npx supabase login`;
//      geen databasewachtwoord of geheime sleutel nodig, productie wordt nooit gewijzigd).
//   2. Haalt lokaal de teams met dezelfde id's weg (met alles erbij) en zet de kopie erin:
//      teams, adressen, bezoeken, afwezigheid, bestellingen, voorraad. Ook verwijderde regels,
//      zodat de historie precies hetzelfde is.
//   3. Koppelt de teamleden op e-mailadres aan dezelfde lokale gebruikers (rol en naam blijven).
//      Lokale gebruikers ontstaan door één keer lokaal in te loggen (code 123456).
// Niet gekopieerd: uitnodigingen, meldingen (push), en gebruikersaccounts.
// Andere lokale teams (zoals testteams) blijven ongemoeid.
//
// Let op: de kopie bevat echte namen, adressen en e-mailadressen. Ze komt alleen in de lokale
// database; het tijdelijke bestand wordt na afloop verwijderd.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TABLES = ['teams', 'addresses', 'visits', 'absences', 'orders', 'stock_events'];
const extra = process.argv.slice(2).map(e => e.trim().toLowerCase()).filter(Boolean);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, ...opts });
const fail = msg => { console.error('✗ ' + msg); process.exit(1); };

// project-ref van productie
function projectRef(){
  const linked = join(root, 'supabase/.temp/linked-project.json');
  if (existsSync(linked)) { try { const r = JSON.parse(readFileSync(linked, 'utf8')).ref; if (r) return r; } catch (e) {} }
  const m = readFileSync(join(root, 'config.js'), 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  if (m) return m[1];
  fail('Kan het productieproject niet vinden (supabase/.temp/linked-project.json of config.js).');
}
// lokale database-container
function localDb(){
  let names = '';
  try { names = run('docker', ['ps', '--format', '{{.Names}}']); } catch (e) { fail('Docker draait niet. Start Docker en daarna: npx supabase start'); }
  const name = names.split('\n').find(n => /^supabase_db_/.test(n));
  if (!name) fail('De lokale Supabase draait niet. Start hem met: npx supabase start');
  return name;
}
// één query op productie, alleen-lezen, resultaat als rijen
function remote(ref, sql){
  let out;
  try { out = run('npx', ['supabase', 'db', 'query', `--remote=${ref}`, '--read-only', '--output-format', 'json', sql], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { fail('Productie lezen mislukt. Ben je ingelogd? (npx supabase login)\n' + (e.stderr || e.message)); }
  const json = JSON.parse(out.slice(out.indexOf('{')));
  if (json._tag === 'Error' || json.error) fail('Productie lezen mislukt: ' + JSON.stringify(json.error || json));
  return json.rows || [];
}
const asJson = v => typeof v === 'string' ? JSON.parse(v) : v;
const psql = (db, sql) => run('docker', ['exec', '-i', db, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-tA'], { input: sql });

const ref = projectRef(), db = localDb();
console.log(`Productie (${ref}) lezen, alleen-lezen…`);
const data = {};
for (const t of TABLES) {
  data[t] = asJson(remote(ref, `select coalesce(json_agg(t), '[]'::json) as data from public.${t} t`)[0].data) || [];
  console.log(`  ${t.padEnd(13)} ${data[t].length}`);
}
const members = asJson(remote(ref, `select coalesce(json_agg(x), '[]'::json) as data from (select tm.team_id, lower(u.email) as email, tm.role, tm.name from public.team_members tm join auth.users u on u.id = tm.user_id) x`)[0].data) || [];
console.log(`  ${'teamleden'.padEnd(13)} ${members.length}`);
const teamIds = data.teams.map(t => t.id);
if (!teamIds.length) fail('Geen teams gevonden in productie.');

// lokale kolommen per tabel: alleen kolommen die lokaal én in productie bestaan
const cols = {};
for (const line of psql(db, `select table_name || ':' || string_agg(column_name, ',') from information_schema.columns where table_schema = 'public' and table_name in (${TABLES.map(t => `'${t}'`).join(',')}) group by table_name;`).trim().split('\n')) {
  const [t, c] = line.split(':'); cols[t] = new Set(c.split(','));
}
// dollar-quote die niet in de gegevens voorkomt
const all = JSON.stringify(data) + JSON.stringify(members);
let tag = 'egg'; while (all.includes(`$${tag}$`)) tag += 'x';
const lit = v => `$${tag}$${JSON.stringify(v)}$${tag}$`;

let sql = 'begin;\n';
sql += `delete from public.teams where id in (${teamIds.map(id => `'${id}'`).join(',')});\n`; // met alles erbij (on delete cascade)
for (const t of TABLES) {
  if (!data[t].length) continue;
  const keys = Object.keys(data[t][0]).filter(k => cols[t] && cols[t].has(k));
  const list = keys.map(k => `"${k}"`).join(', ');
  sql += `insert into public.${t} (${list}) select ${list} from json_populate_recordset(null::public.${t}, ${lit(data[t])});\n`;
}
// leden koppelen op e-mail
sql += `create temp table prod_leden (team_id uuid, email text, role text, name text);
insert into prod_leden select * from json_populate_recordset(null::prod_leden, ${lit(members)});
insert into public.team_members (team_id, user_id, role, name)
  select l.team_id, u.id, l.role, l.name from prod_leden l join auth.users u on lower(u.email) = l.email
  on conflict (team_id, user_id) do update set role = excluded.role, name = excluded.name;\n`;
if (extra.length) sql += `insert into public.team_members (team_id, user_id, role, name)
  select t.id, u.id, 'admin', '' from public.teams t, auth.users u where t.id in (${teamIds.map(id => `'${id}'`).join(',')}) and lower(u.email) in (${extra.map(e => `'${e.replace(/'/g, "''")}'`).join(',')})
  on conflict (team_id, user_id) do update set role = 'admin';\n`;
sql += `select 'gekoppeld:' || count(*) from public.team_members where team_id in (${teamIds.map(id => `'${id}'`).join(',')});\ncommit;\n`;

const dir = mkdtempSync(join(tmpdir(), 'egg-prod-'));
try {
  const file = join(dir, 'kopie.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  console.log('In de lokale database zetten…');
  const out = psql(db, readFileSync(file, 'utf8'));
  const linked = (out.match(/gekoppeld:(\d+)/) || [])[1] || '0';
  const missing = members.length ? `${members.length} in productie` : '';
  console.log(`✓ Klaar. ${data.teams.length} team(s) gekopieerd; ${linked} lokale gebruiker(s) gekoppeld (${missing}).`);
  if (linked === '0') console.log('  Nog niemand gekoppeld: log lokaal één keer in met hetzelfde e-mailadres (code 123456) en draai dit opnieuw,\n  of geef je lokale e-mailadres mee: node scripts/prod-naar-lokaal.mjs jij@voorbeeld.nl');
  console.log('  In de app: Instellingen → Team → Jouw teams → kies het team. Daarna haalt de app alles op.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
