#!/usr/bin/env node
// Verhuur — eenmalige import van de oude administratie (Excel) in de app: boekingen, begroting en facturen.
//
//   node scripts/rentals-import.mjs <bestand.xlsx>                         droge run: samenvatting, schrijft niets
//   node scripts/rentals-import.mjs <bestand.xlsx> --list                  idem, met elke boeking en factuur (met namen)
//   node scripts/rentals-import.mjs <bestand.xlsx> --local  --house "Vacances au Bonhomme"            + controle tegen de database
//   node scripts/rentals-import.mjs <bestand.xlsx> --local  --house "…" --write                         lokaal schrijven
//   node scripts/rentals-import.mjs <bestand.xlsx> --remote --house "…" --write                         productie (Supabase CLI)
//
// Het bestand en de gegevens komen nooit in de repository (deze is openbaar): het script leest het bestand alleen
// lokaal en schrijft rechtstreeks naar de database. Alles krijgt een vaste sleutel (import_key), zodat de import
// opnieuw kan zonder dubbele regels; opnieuw draaien overschrijft wat eerder is geïmporteerd (niet wat in de app is
// ingevoerd). Boekingen die al met de hand in de app staan (zelfde huis, overlappende data) worden overgeslagen.
//
// Wat waarheen (zie docs/plan-rentals.md, "Importeren wat er nu is"):
//   Boekingen jjjj   → rental_bookings + rental_booking_amounts. Totaalprijs = huur (accommodation), Uitbetaling,
//                      Schoonmaak, Bedlinnen, Toeristenbelasting, Vaste kosten (other_costs), commissie
//                      (commission), Via (kanaal), Herkomst (land), Wie (naam). Status: Afgerond/Geboekt = geboekt.
//                      Direct zonder prijs = eigen gebruik (uitbetaling = bijdrage). Volwassenen staan er niet in:
//                      volwassenen = personen, met een notitie (de aangifte vraagt dan om na te kijken).
//                      Afgerond via Booking.com/Airbnb = uitbetaald (rental_booking_payouts zonder transactie, op de
//                      vertrekdatum), zodat het niet in "Nog niet uitbetaald" staat.
//   Kosten jjjj      → rental_budgets (bedrag per jaar per soort) en "Extra facturen" → rental_costs (Onvoorzien).
//                      Tabblad "Kosten" zonder jaar = 2024. Extra facturen zonder datum: in een voorbij jaar op
//                      31 december (datum onbekend), in het lopende jaar is het een post in de begroting (niet ingelezen).
//   Belastingdienst - Kosten → rental_costs: Renovatie = Investeringen en renovatie, Onderhoud = Onderhoud overig.
//   Niet ingelezen: Fioul (prijsverloop), Verhuurperiodes, Leningen, projecten (tuin, hottub, zwembad), overzichten.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readXlsx, excelDate } from './xlsx.mjs';
import { DEFAULT_CATEGORIES } from '../rentals/year.js';
import { defaultTaxBy, nights, round2 } from '../rentals/tax.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), flag = n => args.includes(n), opt = n => { const a = args.find(x => x.startsWith(n + '=')); if (a) return a.slice(n.length + 1); const i = args.indexOf(n); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
const file = args.find(a => a.endsWith('.xlsx'));
const fail = m => { console.error('✗ ' + m); process.exit(1); };
if (!file || !existsSync(file)) fail('Geef het .xlsx-bestand mee: node scripts/rentals-import.mjs <bestand.xlsx>');
const CURRENT = new Date().getFullYear();

/* ---------- lezen ---------- */
const S = readXlsx(file);
const col = n => { let s = ''; n++; while (n) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const num = v => { if (v === null || v === undefined || v === '') return null; const x = typeof v === 'number' ? v : Number(String(v).replace(/[€\s]/g, '').replace(',', '.')); return Number.isFinite(x) ? round2(x) : null; };
const txt = v => (v === null || v === undefined ? '' : String(v).trim());
const warnings = [];
const total = (list, f) => round2(list.reduce((s, x) => s + (f(x) || 0), 0));
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const SOURCE = v => { const s = txt(v).toLowerCase(); return s.includes('booking') ? 'booking' : s.includes('airbnb') ? 'airbnb' : s.includes('direct') ? 'direct' : s ? 'other' : null; };
const STATUS = { afgerond: 'booked', geboekt: 'booked', optie: 'option', verwacht: 'expected', geannuleerd: 'cancelled' };

const bookings = [];
for (const [name, cells] of Object.entries(S)) {
  const m = name.match(/^Boekingen (\d{4})$/); if (!m) continue;
  const year = +m[1], head = {};
  for (let c = 0; c < 40; c++) { const h = txt(cells.get(col(c) + '1')).toLowerCase(); if (h) head[h] = col(c); }
  const get = (r, ...keys) => { for (const k of keys) { const c = head[k] || Object.entries(head).find(([h]) => h.includes(k))?.[1]; if (c) return cells.get(c + r); } return null; };
  for (let r = 2; r < 400; r++) {
    const arrival = excelDate(get(r, 'van')), departure = excelDate(get(r, 'tot'));
    if (!arrival) continue;
    const where = `${name} rij ${r}`;
    if (!departure || departure <= arrival) { warn(where, 'geen geldige vertrekdatum, overgeslagen'); continue; }
    const st = txt(get(r, 'status')).toLowerCase();
    let status = st ? STATUS[st] : 'booked';
    if (!status) { warn(where, `onbekende status "${st}", gelezen als geboekt`); status = 'booked'; }
    let source = SOURCE(get(r, 'via'));
    // optie/verwacht zonder kanaal: een schatting in de begroting, nog geen echte boeking → kanaal "anders"
    if (!source) { if (status === 'option' || status === 'expected') source = 'other'; else { if (status !== 'cancelled') warn(where, 'kanaal (Via) ontbreekt, gelezen als direct'); source = 'direct'; } }
    const guests = Math.max(0, Math.min(50, Math.round(num(get(r, 'personen')) || 0)));
    const a = {
      guest_name: txt(get(r, 'wie')).slice(0, 120), accommodation: num(get(r, 'totaalprijs')), payout: num(get(r, 'uitbetaling')),
      cleaning: num(get(r, 'schoonmaak')), linen: num(get(r, 'bedlinnen')), tourist_tax: num(get(r, 'toeristenbelasting')),
      other_costs: num(get(r, 'vaste kosten')), commission: num(get(r, 'commissie')), night_price: null,
    };
    const notes = [];
    if (source === 'direct' && status !== 'cancelled' && !a.accommodation) {
      source = 'own'; a.accommodation = a.payout || null; a.payout = null; a.commission = null; a.other_costs = null; a.tourist_tax = null;
      notes.push('Eigen gebruik (in de spreadsheet: Direct zonder prijs).');
    }
    if (status !== 'cancelled' && !guests) warn(where, 'aantal personen ontbreekt');
    if (guests) notes.push('Volwassenen onbekend bij import: gelijk aan personen.');
    if (+arrival.slice(0, 4) !== year && +departure.slice(0, 4) !== year) warn(where, `datum ${arrival} valt buiten ${year}`);
    // Afgerond (of 2023, zonder status) = verblijf voorbij en uitbetaald; Geboekt = nog niet afgerond
    const done = st === 'afgerond' || (!st && status === 'booked');
    bookings.push({ where, year, done, source, status, arrival, departure, guests, adults: guests, country: txt(get(r, 'herkomst')).slice(0, 60),
      tax_by: defaultTaxBy(source), notes: notes.join(' '), a });
  }
}
// vaste sleutel: aankomst|vertrek|kanaal (+ volgnummer bij gelijke)
const seen = {};
for (const b of bookings.sort((x, y) => x.arrival.localeCompare(y.arrival) || x.where.localeCompare(y.where))) {
  const k = `xlsx:${b.arrival}|${b.departure}|${b.source}`; seen[k] = (seen[k] || 0) + 1; b.key = seen[k] > 1 ? `${k}|${seen[k]}` : k;
}
// dubbel in de spreadsheet (zelfde data, beide niet geannuleerd)?
for (const b of bookings) for (const x of bookings) if (x !== b && x.where > b.where && b.status !== 'cancelled' && x.status !== 'cancelled' && x.arrival < b.departure && b.arrival < x.departure) warn(`${b.where} en ${x.where}`, 'overlappende verblijven');

// begroting + extra facturen
const BUDGET_MAP = {
  'internet': 'Internet', 'elektriciteit': 'Elektra', 'olie/hout': 'Stookolie', 'onroerend goed belasting': 'Taxe foncière',
  '2e huis belasting': "Taxe d'habitation", 'verzekeringen': 'Verzekeringen', 'riool / overig': 'Riool', 'overig': 'Overig',
  'water': 'Water', 'verwarmingsketel controle': 'Ketelcontrole', 'inkomsten belasting': 'Inkomstenbelasting', 'tuinman': 'Tuinman',
  'schoorsteenveger': 'Schoorsteenveger', 'onvoorzien / extra': 'Onvoorzien', 'welkomstwijn': 'Overig', 'administratiekantoor': 'Administratiekantoor',
  'brandhout': 'Brandhout', 'stookolie': 'Stookolie',
};
const SKIP_BUDGET = ['verhuur makelaar', 'totaal'];
const budgets = [], costs = [];
for (const [name, cells] of Object.entries(S)) {
  const m = name.match(/^Kosten(?: (\d{4}))?$/); if (!m) continue;
  const year = m[1] ? +m[1] : 2024;
  if (!m[1]) warn(name, 'tabblad zonder jaar: gelezen als begroting 2024');
  let extra = 0;
  for (let r = 3; r < 120; r++) {
    const label = txt(cells.get('A' + r)), key = label.toLowerCase();
    if (key === 'extra facturen') { extra = r; break; }
    if (!label || key.startsWith('%') || key.startsWith('kosten nog')) continue;
    if (SKIP_BUDGET.includes(key)) continue;
    const yearly = num(cells.get('C' + r)) ?? (num(cells.get('B' + r)) !== null ? round2(num(cells.get('B' + r)) * 12) : null);
    if (yearly === null) continue;
    const cat = BUDGET_MAP[key];
    if (!cat) { warn(`${name} rij ${r}`, `begrotingspost "${label}" niet herkend, gelezen als Overig`); }
    budgets.push({ where: `${name} rij ${r}`, year, label, category: cat || 'Overig', amount: yearly });
  }
  if (extra) {
    const head = {};
    for (let c = 0; c < 10; c++) { const h = txt(cells.get(col(c) + (extra + 1))).toLowerCase(); if (h) head[h] = col(c); }
    for (let r = extra + 2; r < extra + 60; r++) {
      const g = k => (head[k] ? cells.get(head[k] + r) : null);
      if (txt(cells.get('B' + r)).toLowerCase() === 'totaal') break;
      const amount = num(g('bedrag')); if (!amount) continue;
      const date = excelDate(g('datum')), where = `${name} rij ${r}`;
      if (!date && year >= CURRENT) continue; // post in de begroting, nog geen factuur
      const paid = txt(g('voldaan')).toLowerCase();
      costs.push({ where, key: `xlsx:${name}|${r}`, category: 'Onvoorzien', date: date || `${year}-12-31`, amount, supplier: txt(g('bedrijf')).slice(0, 80),
        invoice_no: txt(g('factuurnummer')).slice(0, 60), description: [txt(g('omschrijving')), date ? '' : '(datum onbekend)'].filter(Boolean).join(' ').slice(0, 300),
        paid: !paid.startsWith('n') });
    }
  }
}
// Belastingdienst: alleen renovatie en onderhoud. "Verhuur" zijn facturen van de makelaar (zitten al in de boekingen:
// schoonmaak, bedlinnen, commissie); "Vaste lasten" zijn geschatte bedragen zonder datum (staan in de begroting).
const TAX = S['Belastingdienst - Kosten'], skipped = {};
if (TAX) for (let r = 2; r < 300; r++) {
  const amount = num(TAX.get('D' + r)), what = txt(TAX.get('B' + r)), sup = txt(TAX.get('A' + r)), where = `Belastingdienst - Kosten rij ${r}`;
  const date = excelDate(TAX.get('C' + r)), type = txt(TAX.get('E' + r)).toLowerCase();
  if (!type && !sup) continue; // totaalregel
  if (type === 'verhuur' || type === 'vaste lasten') { const k = type === 'verhuur' ? 'facturen van de makelaar (zitten al in de boekingen)' : 'geschatte vaste lasten zonder datum'; skipped[k] = skipped[k] || { n: 0, sum: 0 }; skipped[k].n++; skipped[k].sum = round2(skipped[k].sum + (amount || 0)); continue; }
  if (!amount) { warn(where, 'geen bedrag, overgeslagen'); continue; }
  const category = type.startsWith('renov') ? 'Investeringen en renovatie' : type.startsWith('onderh') ? 'Onderhoud overig' : 'Overig';
  if (category === 'Overig') warn(where, `onbekend type "${type}", gelezen als Overig`);
  costs.push({ where, key: `xlsx:Belastingdienst - Kosten|${r}`, category, date: date || '2023-01-01', amount, supplier: sup.slice(0, 80), invoice_no: '',
    description: [what, date ? '' : '(datum onbekend)'].filter(Boolean).join(' ').slice(0, 300), paid: true });
  if (!date) warn(where, 'geen datum: op 1 januari 2023 gezet');
}
for (const [k, v] of Object.entries(skipped)) warn('Belastingdienst - Kosten', `${v.n} ${k} niet ingelezen (${eur(v.sum)})`);
// dezelfde factuur op twee tabbladen: de versie met datum houden
for (const c of [...costs]) {
  const twin = costs.find(x => x !== c && x.amount === c.amount && x.date.slice(0, 4) === c.date.slice(0, 4) && x.where.split(' rij')[0] !== c.where.split(' rij')[0]);
  if (twin && c.description.includes('datum onbekend') && !twin.description.includes('datum onbekend')) {
    costs.splice(costs.indexOf(c), 1); warn(`${c.where}`, `zelfde factuur als ${twin.where} (${eur(c.amount)}): één keer ingelezen`);
  }
}
if (S.Fioul) warn('Fioul', 'prijsverloop stookolie, niet ingelezen');

// Kosten per boeking voor het huis (rental_houses.settings.costs), uit de spreadsheet zelf (niet uit de code):
// makelaarspercentage van het nieuwste tabblad Kosten, de meest gebruikte vaste kosten en het gemiddelde deel van de
// huur dat het platform uitbetaalt (nieuwste jaar). Wat al bij het huis is ingesteld, blijft staan.
const houseCosts = {};
{
  const sheets = Object.keys(S).filter(n => /^Kosten \d{4}$/.test(n)).sort(), last = S[sheets[sheets.length - 1]];
  if (last) for (let r = 1; r < 40; r++) if (txt(last.get('G' + r)).toLowerCase() === 'makelaar' && num(last.get('H' + r)) !== null) houseCosts.commission_percent = round2(num(last.get('H' + r)) * 100);
  const ly = Math.max(...bookings.map(b => b.year)), rent = bookings.filter(b => b.year === ly && b.status === 'booked' && b.source !== 'own');
  const freq = {}; for (const b of rent) if (b.a.other_costs !== null) freq[b.a.other_costs] = (freq[b.a.other_costs] || 0) + 1;
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]; if (top) houseCosts.other_costs = +top[0];
  const pl = rent.filter(b => (b.source === 'booking' || b.source === 'airbnb') && b.a.payout && b.a.accommodation);
  if (pl.length) houseCosts.payout_percent = Math.round(total(pl, b => b.a.payout) / total(pl, b => b.a.accommodation) * 100);
}

/* ---------- samenvatting ---------- */
function eur(x) { return x === null || x === undefined ? '–' : '€ ' + Number(x).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
const years = [...new Set(bookings.map(b => +b.arrival.slice(0, 4)))].sort();
console.log(`Bestand: ${file.split('/').pop()}\n`);
console.log('BOEKINGEN (jaar van aankomst)');
for (const y of years) {
  const l = bookings.filter(b => +b.arrival.slice(0, 4) === y), on = l.filter(b => b.status !== 'cancelled');
  const cnt = (k, list = l) => Object.entries(list.reduce((o, b) => ((o[b[k]] = (o[b[k]] || 0) + 1), o), {})).map(([a, n]) => `${a} ${n}`).join(', ');
  const rented = on.filter(b => b.source !== 'own' && b.status === 'booked');
  console.log(`  ${y}: ${l.length} regels — status: ${cnt('status')} — kanaal (niet geannuleerd): ${cnt('source', on)}`);
  console.log(`        verhuurd (geboekt): ${rented.length} verblijven, ${total(rented, nights)} nachten · huur ${eur(total(rented, b => b.a.accommodation))} · uitbetaling ${eur(total(rented, b => b.a.payout))}`);
  console.log(`        schoonmaak ${eur(total(rented, b => b.a.cleaning))} · bedlinnen ${eur(total(rented, b => b.a.linen))} · taxe ${eur(total(rented, b => b.a.tourist_tax))} · vaste kosten ${eur(total(rented, b => b.a.other_costs))} · makelaar ${eur(total(rented, b => b.a.commission))}`);
  const own = on.filter(b => b.source === 'own'); if (own.length) console.log(`        eigen gebruik: ${own.length} verblijven, ${total(own, nights)} nachten`);
}
console.log('\nBEGROTING (per jaar)');
for (const y of [...new Set(budgets.map(b => b.year))].sort()) {
  const l = budgets.filter(b => b.year === y);
  console.log(`  ${y}: ${eur(total(l, b => b.amount))} — ${l.map(b => `${b.category}${b.label.toLowerCase() !== b.category.toLowerCase() ? ` (${b.label.trim()})` : ''} ${eur(b.amount)}`).join(' · ')}`);
}
console.log(`\nKOSTEN PER BOEKING (instelling huis, als die nog leeg is): makelaar ${houseCosts.commission_percent ?? '–'}% + btw, vaste kosten ${eur(houseCosts.other_costs ?? null)}, uitbetaling ${houseCosts.payout_percent ?? '–'}% van de huur (schatting)`);
console.log('\nKOSTEN (facturen)');
for (const y of [...new Set(costs.map(c => c.date.slice(0, 4)))].sort()) {
  const l = costs.filter(c => c.date.slice(0, 4) === y), cats = [...new Set(l.map(c => c.category))];
  console.log(`  ${y}: ${l.length} facturen, ${eur(total(l, c => c.amount))} — ${cats.map(k => `${k} ${eur(total(l.filter(c => c.category === k), c => c.amount))}`).join(' · ')}`);
}
if (flag('--list')) {
  console.log('\nALLE BOEKINGEN');
  for (const b of bookings) console.log(`  ${b.arrival} → ${b.departure}  ${b.source.padEnd(7)} ${b.status.padEnd(9)} ${String(b.guests).padStart(2)} p  ${b.a.guest_name}  huur ${eur(b.a.accommodation)} uitb. ${eur(b.a.payout)}  [${b.where}]`);
  console.log('\nALLE FACTUREN');
  for (const c of costs) console.log(`  ${c.date}  ${c.category.padEnd(26)} ${eur(c.amount).padStart(12)}  ${c.supplier} ${c.description}  [${c.where}]`);
}
console.log(`\nLET OP (${warnings.length})`);
for (const w of warnings) console.log('  - ' + w);

/* ---------- database ---------- */
const local = flag('--local'), remoteArg = args.find(a => a === '--remote' || a.startsWith('--remote='));
if (!local && !remoteArg) { console.log('\nDroge run: niets geschreven. Met --local of --remote en --house "naam" volgt een controle tegen de database; met --write wordt er geschreven.'); process.exit(0); }
const houseName = opt('--house'); if (!houseName) fail('Geef het huis mee: --house "Vacances au Bonhomme"');
const q = s => `'${String(s).replace(/'/g, "''")}'`, n = x => (x === null || x === undefined ? 'null' : String(x));

function ref() {
  if (remoteArg && remoteArg.includes('=')) return remoteArg.split('=')[1];
  const linked = join(root, 'supabase/.temp/linked-project.json');
  if (existsSync(linked)) { const r = JSON.parse(readFileSync(linked, 'utf8')).ref; if (r) return r; }
  fail('Geen project gevonden: gebruik --remote=<ref> of npx supabase link');
}
function container() {
  const names = execFileSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).split('\n');
  return names.find(x => x.startsWith('supabase_db_')) || fail('De lokale Supabase draait niet (npx supabase start)');
}
function runSql(sql, { read = true } = {}) {
  if (local) {
    const wrapped = read ? `select coalesce(json_agg(t), '[]') from (${sql}) t` : sql;
    const out = execFileSync('docker', ['exec', '-i', container(), 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-tAq'], { input: wrapped, encoding: 'utf8', maxBuffer: 1 << 28 });
    return read ? JSON.parse(out.trim() || '[]') : out;
  }
  const dir = mkdtempSync(join(tmpdir(), 'rentals-import-')), f = join(dir, 'q.sql');
  try {
    writeFileSync(f, sql);
    const out = execFileSync('npx', ['supabase', 'db', 'query', `--remote=${ref()}`, ...(read ? ['--read-only'] : ['--yes']), '--output-format', 'json', '-f', f], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
    return JSON.parse(out.slice(out.indexOf('{'))).rows || [];
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const houses = runSql(`select id, team_id, name from public.rental_houses where not deleted and name = ${q(houseName)}`);
if (houses.length !== 1) fail(`Huis "${houseName}" ${houses.length ? 'staat er meer dan één keer in' : 'niet gevonden in de database. Maak het eerst aan in de app (Verhuur)'}.`);
const H = houses[0];
const existing = runSql(`select arrival::text, departure::text, source, status, import_key from public.rental_bookings where house_id = ${q(H.id)} and not deleted`);
const manual = existing.filter(x => !x.import_key && x.status !== 'cancelled');
const skip = new Set(bookings.filter(b => b.status !== 'cancelled' && manual.some(x => x.arrival < b.departure && b.arrival < x.departure)).map(b => b.key));
const already = new Set(existing.filter(x => x.import_key).map(x => x.import_key));
console.log(`\nDATABASE (${local ? 'lokaal' : 'productie'}): huis gevonden. Al in de app: ${existing.length} boekingen, waarvan ${already.size} uit een eerdere import.`);
if (skip.size) console.log(`  ${skip.size} boekingen overgeslagen: staan al met de hand in de app (overlappende data): ${[...skip].map(k => k.split('|').slice(0, 2).join(' → ').replace('xlsx:', '')).join(', ')}`);
const toWrite = bookings.filter(b => !skip.has(b.key));
console.log(`  Te schrijven: ${toWrite.length} boekingen (${toWrite.filter(b => already.has(b.key)).length} bijwerken), ${budgets.length} begrotingsposten, ${costs.length} facturen.`);
if (!flag('--write')) { console.log('\nControle klaar: niets geschreven. Voeg --write toe om te schrijven.'); process.exit(0); }

const T = q(H.team_id), HID = q(H.id);
const cat = name => `(select id from public.rental_cost_categories where house_id = ${HID} and not deleted and lower(name) = lower(${q(name)}) order by sort limit 1)`;
let sql = 'begin;\n';
sql += `update public.rental_houses set settings = jsonb_set(settings, '{costs}', ${q(JSON.stringify(houseCosts))}::jsonb || coalesce(settings->'costs', '{}'::jsonb)) where id = ${HID};\n`;
// kostensoorten die nog ontbreken (zelfde standaardset als de knop in de app)
for (const c of DEFAULT_CATEGORIES) {
  sql += `insert into public.rental_cost_categories (team_id, house_id, name, kind, from_booking, own_share, sort)
  select ${T}, ${HID}, ${q(c.name)}, ${q(c.kind)}, ${c.from_booking ? q(c.from_booking) : 'null'}, ${c.own_share}, ${c.sort}
  where not exists (select 1 from public.rental_cost_categories x where x.house_id = ${HID} and not x.deleted and (lower(x.name) = lower(${q(c.name)})${c.from_booking ? ` or x.from_booking = ${q(c.from_booking)}` : ''}));\n`;
}
for (const b of toWrite) {
  const a = b.a;
  sql += `with b as (insert into public.rental_bookings (team_id, house_id, source, status, arrival, departure, guests, adults, country, tax_by, notes, import_key)
  values (${T}, ${HID}, ${q(b.source)}, ${q(b.status)}, ${q(b.arrival)}, ${q(b.departure)}, ${b.guests}, ${b.adults}, ${q(b.country)}, ${q(b.tax_by)}, ${q(b.notes)}, ${q(b.key)})
  on conflict (house_id, import_key) do update set source = excluded.source, status = excluded.status, arrival = excluded.arrival, departure = excluded.departure,
    guests = excluded.guests, adults = excluded.adults, country = excluded.country, tax_by = excluded.tax_by, notes = excluded.notes, deleted = false returning id)
insert into public.rental_booking_amounts (booking_id, team_id, guest_name, accommodation, night_price, payout, cleaning, linen, tourist_tax, other_costs, commission)
  select id, ${T}, ${q(a.guest_name)}, ${n(a.accommodation)}, null, ${n(a.payout)}, ${n(a.cleaning)}, ${n(a.linen)}, ${n(a.tourist_tax)}, ${n(a.other_costs)}, ${n(a.commission)} from b
  on conflict (booking_id) do update set guest_name = excluded.guest_name, accommodation = excluded.accommodation, payout = excluded.payout, cleaning = excluded.cleaning,
    linen = excluded.linen, tourist_tax = excluded.tourist_tax, other_costs = excluded.other_costs, commission = excluded.commission;\n`;
}
// Afgeronde platformboekingen met een uitbetaling: als uitbetaald vastleggen (zonder banktransactie, datum = vertrek),
// zodat ze niet in "Nog niet uitbetaald" staan. Geboekt maar nog niet afgerond blijft open.
for (const b of toWrite.filter(b => b.done && b.a.payout > 0 && (b.source === 'booking' || b.source === 'airbnb'))) {
  sql += `insert into public.rental_booking_payouts (team_id, booking_id, transaction_id, amount, paid_on, matched_by)
  select ${T}, x.id, null, ${b.a.payout}, ${q(b.departure)}, 'manual' from public.rental_bookings x
  where x.house_id = ${HID} and x.import_key = ${q(b.key)} and not exists (select 1 from public.rental_booking_payouts p where p.booking_id = x.id and p.transaction_id is null);\n`;
}
// begroting: posten met dezelfde soort in hetzelfde jaar optellen
const bsum = {};
for (const b of budgets) { const k = `${b.year}|${b.category}`; bsum[k] = round2((bsum[k] || 0) + b.amount); }
for (const [k, amount] of Object.entries(bsum)) {
  const [year, name] = k.split('|');
  sql += `insert into public.rental_budgets (house_id, team_id, year, category_id, amount) select ${HID}, ${T}, ${year}, ${cat(name)}, ${amount}
  on conflict (house_id, year, category_id) do update set amount = excluded.amount;\n`;
}
for (const c of costs) {
  sql += `insert into public.rental_costs (team_id, house_id, category_id, date, amount, supplier, invoice_no, description, paid, import_key)
  select ${T}, ${HID}, ${cat(c.category)}, ${q(c.date)}, ${c.amount}, ${q(c.supplier)}, ${q(c.invoice_no)}, ${q(c.description)}, ${c.paid}, ${q(c.key)}
  on conflict (house_id, import_key) do update set category_id = excluded.category_id, date = excluded.date, amount = excluded.amount, supplier = excluded.supplier,
    invoice_no = excluded.invoice_no, description = excluded.description, paid = excluded.paid, deleted = false;\n`;
}
sql += 'commit;\n';
runSql(sql, { read: false });
const after = runSql(`select (select count(*) from public.rental_bookings where house_id = ${HID} and import_key is not null) as bookings,
  (select count(*) from public.rental_budgets where house_id = ${HID}) as budgets,
  (select count(*) from public.rental_booking_payouts p join public.rental_bookings x on x.id = p.booking_id where x.house_id = ${HID} and p.transaction_id is null) as paid, (select count(*) from public.rental_costs where house_id = ${HID} and import_key is not null) as costs`);
console.log(`\n✓ Geschreven. In de database nu: ${after[0].bookings} geïmporteerde boekingen (${after[0].paid} als uitbetaald), ${after[0].budgets} begrotingsposten, ${after[0].costs} geïmporteerde facturen.`);
