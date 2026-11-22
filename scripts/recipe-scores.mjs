#!/usr/bin/env node
// De Assistent: gezondheidsscore van gerechten bepalen (voor een geplande Claude-routine).
//
//   node scripts/recipe-scores.mjs list                               gerechten zonder score (JSON)
//   node scripts/recipe-scores.mjs score <id> <updated_at> <1-10> -    score opslaan; uitleg via stdin
//   --local                                                           tegen de lokale Supabase (npx supabase start)
//
// Twee manieren om bij de database te komen:
//   1. Runner-account (voorkeur, ook voor een routine in de cloud): RUNNER_EMAIL en RUNNER_PASSWORD in de omgeving,
//      zelfde account als scripts/runner.mjs (rol 'runner' in platform_roles). Kan alleen runner_unscored_recipes()
//      en runner_score_recipe() gebruiken.
//   2. Zonder runner-account: via de Supabase CLI met je eigen login (`npx supabase login`), zoals
//      scripts/prod-naar-lokaal.mjs. Voor een geplande taak op deze Mac. De SQL hieronder doet precies hetzelfde als
//      de runner-functies: alleen titel, soort, porties, ingrediënten en stappen lezen, alleen de scorekolommen schrijven.
// In beide gevallen: is een gerecht na `list` nog gewijzigd (updated_at klopt niet meer), dan wordt de score niet
// opgeslagen; de volgende run pakt het opnieuw op. Werkwijze en maatstaf: docs/recipe-scores.md.
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
    list: async () => { await login(); return call('/rest/v1/rpc/runner_unscored_recipes', {}); },
    score: async (id, updatedAt, n, notes) => { await login(); return call('/rest/v1/rpc/runner_score_recipe', { p_recipe: id, p_updated_at: updatedAt, p_score: n, p_notes: notes }); },
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
    list: async () => query(`select id, title, category, servings, ingredients, steps, updated_at from public.recipes
      where health_score is null and status = 'ready' and not deleted order by created_at limit 50`, false)
      .map(r => ({ ...r, ingredients: typeof r.ingredients === 'string' ? JSON.parse(r.ingredients) : r.ingredients, steps: typeof r.steps === 'string' ? JSON.parse(r.steps) : r.steps })),
    score: async (id, updatedAt, n, notes) => query(`update public.recipes set health_score = ${n}, health_notes = left(trim(${lit(notes)}), 1000), health_scored_at = now()
      where id = '${id}' and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${lit(updatedAt)}::timestamptz) and not deleted returning id`, true).length > 0,
  };
}

const db = email && password ? viaRunner() : viaCli();
const [cmd, id, updatedAt, score, ...rest] = args;
if (cmd === 'list') {
  console.log(JSON.stringify(await db.list(), null, 2));
} else if (cmd === 'score') {
  if (!UUID.test(id || '')) fail('Geef het id van het gerecht.');
  if (!updatedAt || isNaN(Date.parse(updatedAt))) fail('Geef updated_at zoals list die gaf.');
  const n = Number(score);
  if (!Number.isInteger(n) || n < 1 || n > 10) fail('Score moet een geheel getal van 1 tot 10 zijn.');
  let notes = rest.join(' ');
  if (notes === '-') notes = readFileSync(0, 'utf8');
  if (!notes.trim()) fail('Geef een korte uitleg bij de score.');
  const ok = await db.score(id, updatedAt, n, notes.trim());
  console.log(ok ? `✓ Score ${n} opgeslagen.` : '– Niet opgeslagen: het gerecht is intussen gewijzigd of verwijderd. Volgende run opnieuw.');
} else {
  fail('Gebruik: list | score <id> <updated_at> <1-10> -');
}
