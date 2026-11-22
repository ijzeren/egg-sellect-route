#!/usr/bin/env node
// De Assistent: open vragen van gezinnen ophalen en beantwoorden (voor een geplande Claude-routine).
//
//   node scripts/runner.mjs list                    open vragen zonder antwoord van de Assistent (JSON)
//   node scripts/runner.mjs answer <id> <tekst>      antwoord plaatsen (tekst ook via stdin: answer <id> -)
//   --local                                          tegen de lokale Supabase (npx supabase start)
//
// Inloggen met een eigen account met de rol 'runner' (tabel platform_roles). Dat account kan ALLEEN open
// vraagteksten lezen en antwoorden plaatsen; geen namen, gezinnen of andere gegevens. Gegevens via omgeving:
//   RUNNER_EMAIL, RUNNER_PASSWORD     (nooit in de repository zetten)
// Werkwijze en toon van de antwoorden: docs/runner.md.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2).filter(a => a !== '--local');
const local = process.argv.includes('--local');
const fail = m => { console.error('✗ ' + m); process.exit(1); };

// config.js zet window.EGGSELENT_CONFIG; hier zonder browser uitlezen.
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

const [cmd, id, ...rest] = args;
if (cmd === 'list') {
  console.log(JSON.stringify(await call('/rest/v1/rpc/runner_open_questions', {}, token), null, 2));
} else if (cmd === 'answer') {
  if (!/^[0-9a-f-]{36}$/.test(id || '')) fail('Geef het id van de vraag.');
  let text = rest.join(' ');
  if (text === '-') text = readFileSync(0, 'utf8');
  if (!text.trim()) fail('Geef de tekst van het antwoord.');
  const answerId = await call('/rest/v1/rpc/runner_answer', { p_question: id, p_text: text.trim() }, token);
  console.log(`✓ Antwoord geplaatst (${answerId}).`);
} else {
  fail('Gebruik: list | answer <id> <tekst>');
}
