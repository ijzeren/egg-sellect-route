#!/usr/bin/env node
// De Assistent: open vragen van gezinnen ophalen en beantwoorden (voor een geplande Claude-taak).
//
//   node scripts/runner.mjs list                    open vragen zonder antwoord van de Assistent (JSON)
//   node scripts/runner.mjs answer <id> <tekst>      antwoord plaatsen (tekst ook via stdin: answer <id> -)
//   --local                                          tegen de lokale Supabase (npx supabase start)
//
// Twee manieren om bij de database te komen (zelfde opzet als scripts/recipe-scores.mjs):
//   1. Runner-account (voor een routine in de cloud): RUNNER_EMAIL en RUNNER_PASSWORD in de omgeving; account met de
//      rol 'runner' in platform_roles. Kan alleen runner_open_questions() en runner_answer() gebruiken.
//   2. Zonder runner-account: via de Supabase CLI met je eigen login (`npx supabase login`). Voor de geplande taak op
//      deze Mac. De SQL hieronder doet precies hetzelfde als de runner-functies: alleen vraagtekst en app lezen (geen
//      namen of gezinnen), alleen een antwoord van de Assistent toevoegen.
// Werkwijze en toon van de antwoorden: docs/runner.md.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => a !== '--local');
const local = process.argv.includes('--local');
const fail = m => { console.error('✗ ' + m); process.exit(1); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// config.js zet window.EGGSELENT_CONFIG; hier zonder browser uitlezen.
const window = {};
new Function('window', readFileSync(join(root, 'config.js'), 'utf8'))(window);
const { RUNNER_EMAIL: email, RUNNER_PASSWORD: password } = process.env;

/* ---------- 1. runner-account (REST) ---------- */
function viaRunner() {
  const cfg = local ? window.EGGSELENT_CONFIG.local : window.EGGSELENT_CONFIG;
  const URL = cfg.supabaseUrl.replace(/\/+$/, ''), KEY = cfg.supabaseKey;
  let token = null;
  async function call(path, body) {
    const res = await fetch(URL + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
    const text = await res.text(); let d; try { d = text ? JSON.parse(text) : null; } catch { d = text; }
    if (!res.ok) fail(`${path}: ${(d && (d.message || d.msg || d.error_description || d.error)) || res.status}`);
    return d;
  }
  const login = async () => { if (!token) token = (await call('/auth/v1/token?grant_type=password', { email, password })).access_token; };
  return {
    list: async () => { await login(); return call('/rest/v1/rpc/runner_open_questions', {}); },
    answer: async (id, text) => { await login(); return call('/rest/v1/rpc/runner_answer', { p_question: id, p_text: text }); },
  };
}

/* ---------- 2. Supabase CLI met je eigen login ---------- */
function viaCli() {
  function ref() {
    const linked = join(root, 'supabase/.temp/linked-project.json');
    if (existsSync(linked)) { try { const r = JSON.parse(readFileSync(linked, 'utf8')).ref; if (r) return r; } catch (e) {} }
    const m = readFileSync(join(root, 'config.js'), 'utf8').match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
    if (m) return m[1];
    fail('Kan het productieproject niet vinden (supabase/.temp/linked-project.json of config.js).');
  }
  const target = local ? [] : [`--remote=${ref()}`];
  // write = true: de CLI vraagt bij schrijven op productie om bevestiging; die is gegeven door deze taak in te stellen.
  function query(sql, write) {
    let out;
    try { out = execFileSync('npx', ['supabase', 'db', 'query', ...target, ...(write ? (local ? [] : ['--yes']) : ['--read-only']), '--output-format', 'json', sql], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 }); }
    catch (e) { fail('Database niet bereikbaar. Ben je ingelogd? (npx supabase login)\n' + (e.stderr || e.message)); }
    const json = JSON.parse(out.slice(out.indexOf('{')));
    if (json._tag === 'Error' || json.error) fail('Database: ' + JSON.stringify(json.error || json));
    return json.rows || [];
  }
  const lit = s => { let tag = 'r' + randomBytes(4).toString('hex'); while (s.includes(`$${tag}$`)) tag += 'x'; return `$${tag}$${s}$${tag}$`; };
  return {
    // Zelfde als runner_open_questions(): alleen id, app, tekst, datum en aantal antwoorden.
    list: async () => query(`select q.id, q.app, q.text, q.created_at, (select count(*)::int from public.answers a where a.question_id = q.id) as member_answers
      from public.questions q where q.status = 'open'
        and not exists (select 1 from public.answers a where a.question_id = q.id and a.author = 'runner')
      order by q.created_at limit 50`, false),
    // Zelfde als runner_answer(): antwoord als 'Assistent', alleen als de vraag nog open is en nog geen antwoord van de Assistent heeft.
    answer: async (id, text) => {
      const rows = query(`with q as (select id, team_id from public.questions where id = '${id}' and status = 'open'
          and not exists (select 1 from public.answers a where a.question_id = '${id}' and a.author = 'runner')),
        ins as (insert into public.answers(question_id, team_id, user_id, author, name, text)
          select id, team_id, null, 'runner', 'Assistent', left(trim(${lit(text)}), 4000) from q returning id, question_id),
        upd as (update public.questions set updated_at = now() where id in (select question_id from ins) returning id)
        select id from ins`, true);
      return rows.length ? rows[0].id : null;
    },
  };
}

const db = email && password ? viaRunner() : viaCli();
const [cmd, id, ...rest] = args;
if (cmd === 'list') {
  console.log(JSON.stringify(await db.list(), null, 2));
} else if (cmd === 'answer') {
  if (!UUID.test(id || '')) fail('Geef het id van de vraag.');
  let text = rest.join(' ');
  if (text === '-') text = readFileSync(0, 'utf8');
  if (!text.trim()) fail('Geef de tekst van het antwoord.');
  const answerId = await db.answer(id, text.trim());
  console.log(answerId ? `✓ Antwoord geplaatst (${answerId}).` : '– Niet geplaatst: de vraag is niet meer open of heeft al een antwoord van de Assistent.');
} else {
  fail('Gebruik: list | answer <id> <tekst>');
}
