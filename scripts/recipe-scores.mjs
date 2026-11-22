#!/usr/bin/env node
// De Assistent: gezondheidsscore van gerechten bepalen (voor een geplande Claude-routine).
//
//   node scripts/recipe-scores.mjs list                               gerechten zonder score (JSON)
//   node scripts/recipe-scores.mjs score <id> <updated_at> <1-10> -    score opslaan; uitleg via stdin
//   --local                                                           tegen de lokale Supabase (npx supabase start)
//
// Zelfde runner-account als scripts/runner.mjs (rol 'runner' in platform_roles), via de omgeving:
//   RUNNER_EMAIL, RUNNER_PASSWORD     (nooit in de repository zetten)
// Het account ziet alleen titel, soort, porties, ingrediënten en stappen; geen namen of gezinnen.
// Is een gerecht na `list` nog gewijzigd, dan weigert de database de score (updated_at klopt niet meer);
// de volgende run pakt het opnieuw op. Werkwijze en maatstaf: docs/recipe-scores.md.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => a !== '--local');
const local = process.argv.includes('--local');
const fail = m => { console.error('✗ ' + m); process.exit(1); };

const window = {};
new Function('window', readFileSync(join(root, 'config.js'), 'utf8'))(window);
const cfg = local ? window.EGGSELENT_CONFIG.local : window.EGGSELENT_CONFIG;
const URL = cfg.supabaseUrl.replace(/\/+$/, ''), KEY = cfg.supabaseKey;
const { RUNNER_EMAIL: email, RUNNER_PASSWORD: password } = process.env;
if (!email || !password) fail('Zet RUNNER_EMAIL en RUNNER_PASSWORD in de omgeving.');

async function call(path, body, token) {
  const res = await fetch(URL + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
  const text = await res.text(); let d; try { d = text ? JSON.parse(text) : null; } catch { d = text; }
  if (!res.ok) fail(`${path}: ${(d && (d.message || d.msg || d.error_description || d.error)) || res.status}`);
  return d;
}
const { access_token: token } = await call('/auth/v1/token?grant_type=password', { email, password });

const [cmd, id, updatedAt, score, ...rest] = args;
if (cmd === 'list') {
  console.log(JSON.stringify(await call('/rest/v1/rpc/runner_unscored_recipes', {}, token), null, 2));
} else if (cmd === 'score') {
  if (!/^[0-9a-f-]{36}$/.test(id || '')) fail('Geef het id van het gerecht.');
  if (!updatedAt || isNaN(Date.parse(updatedAt))) fail('Geef updated_at zoals list die gaf.');
  const n = Number(score);
  if (!Number.isInteger(n) || n < 1 || n > 10) fail('Score moet een geheel getal van 1 tot 10 zijn.');
  let notes = rest.join(' ');
  if (notes === '-') notes = readFileSync(0, 'utf8');
  if (!notes.trim()) fail('Geef een korte uitleg bij de score.');
  const ok = await call('/rest/v1/rpc/runner_score_recipe', { p_recipe: id, p_updated_at: updatedAt, p_score: n, p_notes: notes.trim() }, token);
  console.log(ok ? `✓ Score ${n} opgeslagen.` : '– Niet opgeslagen: het gerecht is intussen gewijzigd of verwijderd. Volgende run opnieuw.');
} else {
  fail('Gebruik: list | score <id> <updated_at> <1-10> -');
}
