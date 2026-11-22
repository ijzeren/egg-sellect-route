#!/usr/bin/env node
// De Assistent: geïmporteerde gerechten verrijken (voor een geplande Claude-routine).
//
//   node scripts/recipe-enrich.mjs list                          geïmporteerde gerechten met hun originele upload (JSON)
//   node scripts/recipe-enrich.mjs save <id> <updated_at> -      verrijkt gerecht opslaan; JSON via stdin:
//        { "title", "intro", "category", "servings", "ingredients": ["…"], "steps": [{ "text", "min", "par" }] }
//   --local                                                      tegen de lokale Supabase (npx supabase start)
//
// Opslaan zet de status op 'ready' (klaar) en wist de originele upload; daarna bepaalt scripts/recipe-scores.mjs de
// gezondheidsscore. Is het gerecht na `list` nog gewijzigd (updated_at klopt niet meer), dan wordt niets opgeslagen.
// Twee manieren om bij de database te komen, zoals scripts/recipe-scores.mjs: runner-account (RUNNER_EMAIL/RUNNER_PASSWORD,
// alleen runner_import_recipes/runner_enrich_recipe) of de Supabase CLI-login op deze Mac (dezelfde bewerkingen in SQL).
// Werkwijze: docs/recipe-enrich.md.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clean, CATEGORIES } from '../recipes/recipe.js';

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
    list: async () => { await login(); return call('/rest/v1/rpc/runner_import_recipes', {}); },
    save: async (id, updatedAt, r) => {
      await login();
      return call('/rest/v1/rpc/runner_enrich_recipe', { p_recipe: id, p_updated_at: updatedAt, p_title: r.title, p_intro: r.intro, p_category: r.category, p_servings: r.servings, p_ingredients: r.ingredients, p_steps: r.steps });
    },
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
    const flags = write ? (local ? [] : ['--yes']) : ['--read-only'];
    try { out = execFileSync('npx', ['supabase', 'db', 'query', ...target, ...flags, '--output-format', 'json', sql], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 }); }
    catch (e) { fail('Database niet bereikbaar. Ben je ingelogd? (npx supabase login)\n' + (e.stderr || e.message)); }
    const json = JSON.parse(out.slice(out.indexOf('{')));
    if (json._tag === 'Error' || json.error) fail('Database: ' + JSON.stringify(json.error || json));
    return json.rows || [];
  }
  // Tekst veilig in SQL: dollar-quoting met een willekeurige tag die niet in de tekst voorkomt.
  const lit = v => { const s = String(v); let tag = 'r' + randomBytes(4).toString('hex'); while (s.includes('$' + tag + '$')) tag += 'x'; return '$' + tag + '$' + s + '$' + tag + '$'; };
  const js = v => (typeof v === 'string' ? JSON.parse(v) : v);
  return {
    list: async () => query(`select id, title, intro, category, servings, ingredients, steps, source, source_name, updated_at from public.recipes
      where status = 'import' and not deleted order by created_at limit 20`, false).map(r => ({ ...r, ingredients: js(r.ingredients), steps: js(r.steps) })),
    save: async (id, updatedAt, r) => query(`update public.recipes set title = ${lit(r.title)}, intro = ${lit(r.intro)}, category = ${lit(r.category)},
      servings = ${Number(r.servings)}, ingredients = ${lit(JSON.stringify(r.ingredients))}::jsonb, steps = ${lit(JSON.stringify(r.steps))}::jsonb,
      status = 'ready', source = null, source_name = null
      where id = '${id}' and status = 'import' and not deleted
        and date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', ${lit(updatedAt)}::timestamptz) returning id`, true).length > 0,
  };
}

const db = email && password ? viaRunner() : viaCli();
const [cmd, id, updatedAt, dash] = args;
if (cmd === 'list') {
  console.log(JSON.stringify(await db.list(), null, 2));
} else if (cmd === 'save') {
  if (!UUID.test(id || '')) fail('Geef het id van het gerecht.');
  if (!updatedAt || isNaN(Date.parse(updatedAt))) fail('Geef updated_at zoals list die gaf.');
  if (dash !== '-') fail('Geef het verrijkte gerecht als JSON via stdin (save <id> <updated_at> -).');
  let input;
  try { input = JSON.parse(readFileSync(0, 'utf8')); } catch (e) { fail('Geen geldige JSON: ' + e.message); }
  if (!CATEGORIES.some(c => c[0] === input.category)) fail(`Soort moet een van deze zijn: ${CATEGORIES.map(c => c[0]).join(', ')}.`);
  const r = clean(input);
  if (!r.title) fail('Titel ontbreekt.');
  if (!r.ingredients.length) fail('Ingrediënten ontbreken.');
  if (!r.steps.length) fail('Stappen ontbreken.');
  const ok = await db.save(id, updatedAt, r);
  console.log(ok ? `✓ "${r.title}" verrijkt en klaar; de upload is gewist.` : '– Niet opgeslagen: het gerecht is intussen gewijzigd, verwijderd of al klaar. Volgende run opnieuw.');
} else {
  fail('Gebruik: list | save <id> <updated_at> -');
}
