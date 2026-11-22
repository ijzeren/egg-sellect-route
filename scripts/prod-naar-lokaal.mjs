#!/usr/bin/env node
// Familie-app — productiegegevens ophalen naar de lokale Supabase (development).
//
//   node scripts/prod-naar-lokaal.mjs                     alle gezinnen uit productie
//   node scripts/prod-naar-lokaal.mjs jij@voorbeeld.nl    en maak deze lokale gebruiker(s) ook beheerder (met alle apps)
//
// Wat het doet:
//   1. Leest productie ALLEEN-LEZEN via de Supabase CLI (je eigen `npx supabase login`;
//      geen databasewachtwoord of geheime sleutel nodig, productie wordt nooit gewijzigd).
//   2. Zoekt zelf alle tabellen van een gezin op (kolom team_id die naar teams verwijst) en zet ze
//      in de goede volgorde neer: gezinnen, leden, apps per gezin en per lid, eieren (adressen,
//      bezoeken, voorraad …), training, gerechten, agenda, vragen. Ook verwijderde regels, zodat de
//      historie precies hetzelfde is. Een eerdere kopie van dezelfde gezinnen gaat eerst weg.
//      Ook de FAQ en de apps voor alle gezinnen (platform_apps) worden overgenomen.
//   3. Verwijzingen naar gebruikers worden op e-mailadres gekoppeld aan dezelfde lokale gebruiker.
//      Bestaat die lokaal niet: leeg gelaten, of de regel wordt overgeslagen als het veld verplicht is
//      (zoals lidmaatschap of sterren bij een gerecht). Lokale gebruikers ontstaan door één keer lokaal
//      in te loggen (code 123456).
// Niet gekopieerd: accounts, hoofdbeheerders, uitnodigingen en meldingen (SKIP hieronder).
// Andere lokale gezinnen (zoals testgezinnen) blijven ongemoeid.
//
// Let op: de kopie bevat echte namen, adressen en e-mailadressen. Ze komt alleen in de lokale
// database; het tijdelijke bestand wordt na afloop verwijderd.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Tabellen met team_id die bewust NIET worden gekopieerd (tests/copy-script.test.mjs bewaakt dat elke
// tabel van een gezin óf gekopieerd óf hier genoemd wordt).
export const SKIP = ['push_subscriptions', 'team_digest', 'team_invites'];
// Algemene tabellen (zonder gezin) die wel worden overgenomen.
export const GLOBAL = { platform_apps: 'app', faq: 'id' };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const extra = process.argv.slice(2).map(e => e.trim().toLowerCase()).filter(Boolean);
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, ...opts });
const fail = msg => { console.error('✗ ' + msg); process.exit(1); };
const q = s => `'${String(s).replace(/'/g, "''")}'`;

function projectRef(){
  const linked = join(root, 'supabase/.temp/linked-project.json');
  if (existsSync(linked)) { try { const r = JSON.parse(readFileSync(linked, 'utf8')).ref; if (r) return r; } catch (e) {} }
  const m = readFileSync(join(root, 'config.js'), 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
  if (m) return m[1];
  fail('Kan het productieproject niet vinden (supabase/.temp/linked-project.json of config.js).');
}
function localDb(){
  let names = '';
  try { names = run('docker', ['ps', '--format', '{{.Names}}']); } catch (e) { fail('Docker draait niet. Start Docker en daarna: npx supabase start'); }
  const name = names.split('\n').find(n => /^supabase_db_/.test(n));
  if (!name) fail('De lokale Supabase draait niet. Start hem met: npx supabase start');
  return name;
}
// één query op productie, alleen-lezen; geeft rijen, of null als de query mislukt en optional is
function remote(ref, sql, optional){
  let out;
  try { out = run('npx', ['supabase', 'db', 'query', `--remote=${ref}`, '--read-only', '--output-format', 'json', sql], { stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { if (optional) return null; fail('Productie lezen mislukt. Ben je ingelogd? (npx supabase login)\n' + (e.stderr || e.message)); }
  const json = JSON.parse(out.slice(out.indexOf('{')));
  if (json._tag === 'Error' || json.error) { if (optional) return null; fail('Productie lezen mislukt: ' + JSON.stringify(json.error || json)); }
  return json.rows || [];
}
const asJson = v => typeof v === 'string' ? JSON.parse(v) : v;
const psql = (db, sql) => run('docker', ['exec', '-i', db, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-F', '\t'], { input: sql });
const rows = (db, sql) => psql(db, sql).trim().split('\n').filter(Boolean).map(l => l.split('\t'));

const ref = projectRef(), db = localDb();

// --- lokale structuur: kolommen, verwijzingen, tabellen van een gezin in de goede volgorde
const cols = {};
for (const [t, c] of rows(db, `select table_name, column_name from information_schema.columns where table_schema = 'public'`)) (cols[t] ||= new Set()).add(c);
const fks = rows(db, `select conrelid::regclass::text, a.attname, confrelid::regclass::text, (not a.attnotnull)::text
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace`).map(([t, col, to, nullable]) => ({ t: t.replace(/^public\./, ''), col, to: to.replace(/^public\./, ''), nullable: nullable === 'true' }));
const teamTables = [...new Set(fks.filter(f => f.col === 'team_id' && (f.to === 'teams' || f.to === 'team_members')).map(f => f.t))].filter(t => !SKIP.includes(t));
// volgorde: een tabel pas na de tabellen waar hij naar verwijst
const FIRST = ['team_members', 'team_apps', 'team_member_apps']; // leden en apps eerst
const order = ['teams'], left = new Set(teamTables);
while (left.size) {
  const ready = [...left].filter(t => fks.filter(f => f.t === t && f.to !== t && left.has(f.to)).length === 0)
    .sort((a, b) => (FIRST.includes(a) ? FIRST.indexOf(a) : 99) - (FIRST.includes(b) ? FIRST.indexOf(b) : 99) || a.localeCompare(b));
  if (!ready.length) fail('Kringverwijzing tussen tabellen: ' + [...left].join(', '));
  for (const t of ready) { order.push(t); left.delete(t); }
}
// kolommen die naar een gebruiker verwijzen (auth.users, of user_id via team_members)
const userCols = {};
for (const f of fks) if (f.to === 'auth.users' || (f.to === 'team_members' && f.col === 'user_id')) (userCols[f.t] ||= []).push({ col: f.col, nullable: f.nullable });

// --- productie lezen
console.log(`Productie (${ref}) lezen, alleen-lezen…`);
const data = {};
for (const t of [...order, ...Object.keys(GLOBAL)]) {
  if (!cols[t]) continue;
  const r = remote(ref, `select coalesce(json_agg(t), '[]'::json) as data from public.${t} t`, true);
  if (!r) { console.log(`  ${t.padEnd(18)} ontbreekt in productie, overgeslagen`); continue; }
  data[t] = asJson(r[0].data) || [];
  console.log(`  ${t.padEnd(18)} ${data[t].length}`);
}
const teamIds = (data.teams || []).map(t => t.id);
if (!teamIds.length) fail('Geen gezinnen gevonden in productie.');

// --- gebruikers koppelen op e-mail
const prodUsers = asJson(remote(ref, `select coalesce(json_agg(x), '[]'::json) as data from (select id, lower(email) as email from auth.users) x`)[0].data) || [];
const prodEmail = new Map(prodUsers.map(u => [u.id, u.email]));
const localId = new Map(rows(db, `select lower(email), id from auth.users where email is not null`));
// ook gebruikers in lijsten en JSON (deelnemers van een training, lopers in de app-instellingen …)
const idMap = new Map([...prodEmail].map(([id, em]) => [id, localId.get(em)]).filter(([, l]) => l));
const deepMap = v => Array.isArray(v) ? v.map(deepMap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepMap(x)])) : typeof v === 'string' && idMap.has(v) ? idMap.get(v) : v;
const dropped = {};
for (const [t, list] of Object.entries(data)) {
  const uc = userCols[t] || [], fk = new Set(uc.map(c => c.col));
  data[t] = list.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fk.has(k) ? v : deepMap(v)]))).filter(r => {
    for (const { col, nullable } of uc) {
      if (r[col] == null) continue;
      const id = localId.get(prodEmail.get(r[col]));
      if (id) r[col] = id;
      else if (nullable) r[col] = null;
      else { dropped[t] = (dropped[t] || 0) + 1; return false; }
    }
    return true;
  });
}

// --- SQL opbouwen
const all = JSON.stringify(data);
let tag = 'fam'; while (all.includes(`$${tag}$`)) tag += 'x';
const lit = v => `$${tag}$${JSON.stringify(v)}$${tag}$`;
const insert = (t, list, conflict) => {
  if (!list || !list.length) return '';
  const keys = Object.keys(list[0]).filter(k => cols[t].has(k)), names = keys.map(k => `"${k}"`).join(', ');
  const upd = conflict ? ` on conflict (${conflict}) do update set ${keys.filter(k => k !== conflict).map(k => `"${k}" = excluded."${k}"`).join(', ')}` : '';
  return `insert into public.${t} (${names}) select ${names} from json_populate_recordset(null::public.${t}, ${lit(list)})${upd};\n`;
};
const ids = teamIds.map(q).join(',');
let sql = 'begin;\n';
sql += `delete from public.teams where id in (${ids});\n`; // met alles erbij (on delete cascade)
// controles en tijdstempels van de app uit tijdens het neerzetten: de gegevens komen uit productie
sql += `set local session_replication_role = replica;\n`;
for (const t of order) sql += insert(t, data[t]);
if (data.faq) sql += `delete from public.faq;\n` + insert('faq', data.faq);
if (data.platform_apps) sql += insert('platform_apps', data.platform_apps, GLOBAL.platform_apps);
if (extra.length) {
  const em = extra.map(q).join(',');
  sql += `insert into public.team_members (team_id, user_id, role, name)
  select t.id, u.id, 'admin', '' from public.teams t, auth.users u where t.id in (${ids}) and lower(u.email) in (${em})
  on conflict (team_id, user_id) do update set role = 'admin';\n`;
  if (cols.team_member_apps && cols.team_apps) sql += `insert into public.team_member_apps (team_id, user_id, app, access, role)
  select ta.team_id, u.id, ta.app, true, 'admin' from public.team_apps ta, auth.users u where ta.team_id in (${ids}) and lower(u.email) in (${em})
  on conflict (team_id, user_id, app) do update set access = true, role = 'admin';\n`;
}
sql += `set local session_replication_role = origin;\n`;
sql += `select 'gekoppeld:' || count(*) from public.team_members where team_id in (${ids});\ncommit;\n`;

const dir = mkdtempSync(join(tmpdir(), 'fam-prod-'));
try {
  const file = join(dir, 'kopie.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  console.log('In de lokale database zetten…');
  let out;
  try { out = psql(db, readFileSync(file, 'utf8')); }
  catch (e) { fail('Lokaal neerzetten mislukt (er is niets veranderd):\n' + String(e.stderr || e.message).trim()); }
  const linked = (out.match(/gekoppeld:(\d+)/) || [])[1] || '0';
  console.log(`✓ Klaar. ${teamIds.length} gezin(nen) gekopieerd; ${linked} lokale gebruiker(s) gekoppeld (${(data.team_members || []).length + (dropped.team_members || 0)} leden in productie).`);
  const skipped = Object.entries(dropped).map(([t, n]) => `${t} ${n}`);
  if (skipped.length) console.log(`  Overgeslagen (gebruiker bestaat lokaal niet): ${skipped.join(', ')}. Log lokaal één keer in met dat e-mailadres en draai dit opnieuw.`);
  if (linked === '0') console.log('  Nog niemand gekoppeld: geef je lokale e-mailadres mee: node scripts/prod-naar-lokaal.mjs jij@voorbeeld.nl');
  console.log('  Open daarna de app lokaal en kies het gezin.');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
