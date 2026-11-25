// Financiën — een export uit de bank inlezen (zonder server, zonder bibliotheken; testbaar in node).
//   - Rabobank CSV ("Downloaden transacties" → CSV): kolommen op naam, één of meer rekeningen in één bestand
//   - CAMT.053 (XML, alle Nederlandse banken): één of meer afschriften (Stmt), elk met een rekening en boekingen
// parseFile(bytes | string) → { format, accounts: [{ iban, currency, balance, balanceOn, rows: [row] }] }
// row = { ext_id, booked_on, amount, currency, counterparty, counterparty_iban, description, code, balance_after }
//   amount in euro's (getal, negatief = af). counterparty_iban alleen om te hashen; het nummer zelf bewaren we niet.

/* ---------- tekst ---------- */
// Rabobank levert CSV soms in UTF-8, soms in Windows-1252 (é in "initiërende"). Eerst strikt UTF-8, anders 1252.
export function decode(bytes) {
  if (typeof bytes === 'string') return bytes.replace(/^﻿/, '');
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s;
  try { s = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { s = new TextDecoder('windows-1252').decode(u8); }
  return s.replace(/^﻿/, '');
}

export const normIban = s => String(s || '').replace(/\s+/g, '').toUpperCase();
// Een echt IBAN (geen BBAN, geen "0000000000"): landcode, controlecijfers, 10–30 tekens.
export const isIban = s => /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(normIban(s));
const clean = (s, max) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);

// "+1.234,56", "-2,50", "1234.56", "1,234.56" → euro's (getal met 2 decimalen) of NaN.
export function parseAmount(s) {
  let t = String(s ?? '').trim().replace(/\s|€/g, '');
  if (!t) return NaN;
  const neg = /^-|^−|-$/.test(t); t = t.replace(/^[+\-−]|[+\-]$/g, '');
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if (lc > ld) t = t.replace(/\./g, '').replace(',', '.'); else t = t.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
  const v = Math.round(parseFloat(t) * 100) / 100;
  return neg ? -v : v;
}
// "2026-11-24", "24-11-2026", "20261124", "24/11/2026" → "2026-11-24" of ''.
export function parseDate(s) {
  const t = String(s || '').trim();
  let m = t.match(/^(\d{4})-?(\d{2})-?(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return '';
}

/* ---------- CSV ---------- */
// RFC 4180: velden tussen aanhalingstekens mogen scheidingstekens, regeleinden en "" bevatten.
export function parseCsv(text, sep) {
  if (!sep) { const nl = text.indexOf('\n'), first = nl < 0 ? text : text.slice(0, nl); sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ','; }
  const out = []; let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(x => x !== '')) out.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some(x => x !== '')) out.push(row);
  return out;
}
const hkey = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
// Kolommen van de Rabobank-CSV (op naam, zodat een extra of verschoven kolom niets breekt).
const RABO = {
  iban: ['ibanbban', 'iban'], currency: ['munt'], seq: ['volgnr'], date: ['datum'], amount: ['bedrag'], balance: ['saldonatrn'],
  cpIban: ['tegenrekeningibanbban', 'tegenrekening'], cpName: ['naamtegenpartij'], cpUlt: ['naamuiteindelijkepartij'], cpInit: ['naaminitierendepartij'],
  code: ['code'], ref: ['transactiereferentie'], payRef: ['betalingskenmerk'], d1: ['omschrijving1'], d2: ['omschrijving2'], d3: ['omschrijving3'],
};

export function parseRabobankCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Het bestand is leeg.');
  const head = rows[0].map(hkey), col = {};
  for (const [k, names] of Object.entries(RABO)) col[k] = head.findIndex(h => names.includes(h));
  if (col.iban < 0 || col.date < 0 || col.amount < 0) {
    if (head.includes('creditcardnummer') || head.includes('productnaam')) throw new Error('Dit is een export van een creditcard. Die kan (nog) niet: kies een betaal- of spaarrekening.');
    throw new Error('Dit bestand herken ik niet. Kies in Rabo Online Bankieren bij Downloaden transacties het formaat CSV (of CAMT.053).');
  }
  const get = (r, k) => col[k] >= 0 ? String(r[col[k]] ?? '').trim() : '';
  const byIban = new Map(), bad = [];
  rows.slice(1).forEach((r, i) => {
    const iban = normIban(get(r, 'iban')), date = parseDate(get(r, 'date')), amount = parseAmount(get(r, 'amount'));
    if (!iban || !date || Number.isNaN(amount)) { bad.push(i + 2); return; }
    let a = byIban.get(iban);
    if (!a) { a = { iban, currency: get(r, 'currency') || 'EUR', rows: [], balance: null, balanceOn: null, _seq: -1 }; byIban.set(iban, a); }
    const seq = get(r, 'seq'), bal = parseAmount(get(r, 'balance'));
    const desc = [get(r, 'd1'), get(r, 'd2'), get(r, 'd3')].filter(Boolean).join(' ') || get(r, 'payRef');
    const cpIban = normIban(get(r, 'cpIban'));
    a.rows.push({
      ext_id: seq ? `rabo:${seq}` : `rabo-ref:${get(r, 'ref') || `${date}:${amount}:${i}`}`,
      booked_on: date, amount, currency: get(r, 'currency') || a.currency,
      counterparty: clean(get(r, 'cpName') || get(r, 'cpUlt') || get(r, 'cpInit'), 140),
      counterparty_iban: isIban(cpIban) ? cpIban : '',
      description: clean(desc, 500), code: clean(get(r, 'code'), 20),
      balance_after: Number.isNaN(bal) ? null : bal,
    });
    // saldo = na de laatste boeking (hoogste datum, dan hoogste volgnummer)
    const n = Number(seq) || 0;
    if (!Number.isNaN(bal) && (!a.balanceOn || date > a.balanceOn || (date === a.balanceOn && n >= a._seq))) { a.balance = bal; a.balanceOn = date; a._seq = n; }
  });
  const accounts = [...byIban.values()].map(({ _seq, ...a }) => a);
  if (!accounts.length) throw new Error('Geen transacties gevonden in dit bestand.');
  return { format: 'Rabobank CSV', accounts, skipped: bad.length };
}

/* ---------- XML (klein, genoeg voor CAMT.053) ---------- */
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unent = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m);
// → { name, kids: [node], text }; name zonder voorvoegsel (ns:Ntry → Ntry).
export function parseXml(src) {
  const s = src.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (m, t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  const root = { name: '#root', kids: [], text: '' }, stack = [root];
  for (const m of s.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>/]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g)) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) { top.text += unent(m[5]); continue; }
    const name = m[2].replace(/^.*:/, '');
    if (m[1]) { if (stack.length > 1 && top.name === name) stack.pop(); continue; }
    const node = { name, kids: [], text: '' };
    top.kids.push(node);
    if (!m[4]) stack.push(node);
  }
  return root;
}
const kids = (n, name) => (n ? n.kids.filter(k => k.name === name) : []);
// Eerste afstammeling langs een pad: at(n, 'Acct', 'Id', 'IBAN').
export function at(n, ...path) {
  for (const p of path) { if (!n) return null; n = n.kids.find(k => k.name === p) || null; }
  return n;
}
const txt = n => (n ? n.text.trim() : '');
const find = (n, name) => { if (!n) return null; for (const k of n.kids) { if (k.name === name) return k; const f = find(k, name); if (f) return f; } return null; };
const findAll = (n, name, out = []) => { if (!n) return out; for (const k of n.kids) { if (k.name === name) out.push(k); findAll(k, name, out); } return out; };

// Vaste sleutel voor een boeking zonder referentie van de bank: datum, bedrag, tegenpartij, omschrijving
// (+ volgnummer als dezelfde boeking vaker voorkomt). Zelfde bestand opnieuw inlezen geeft dezelfde sleutels.
function rowKey(r, seen) {
  const base = `${r.booked_on}|${r.amount}|${r.counterparty_iban}|${r.counterparty}|${r.description}`;
  let h = 0; for (let i = 0; i < base.length; i++) h = (Math.imul(31, h) + base.charCodeAt(i)) | 0;
  const k = `${r.booked_on}:${(h >>> 0).toString(36)}`, n = (seen.get(k) || 0) + 1; seen.set(k, n);
  return n > 1 ? `${k}:${n}` : k;
}

export function parseCamt053(text) {
  const doc = parseXml(text), stmts = findAll(doc, 'Stmt');
  if (!find(doc, 'BkToCstmrStmt') || !stmts.length) throw new Error('Dit XML-bestand is geen CAMT.053-afschrift.');
  const byIban = new Map();
  for (const st of stmts) {
    const iban = normIban(txt(at(st, 'Acct', 'Id', 'IBAN')) || txt(at(st, 'Acct', 'Id', 'Othr', 'Id')));
    if (!iban) continue;
    const ccy = txt(at(st, 'Acct', 'Ccy')) || 'EUR';
    let a = byIban.get(iban);
    if (!a) { a = { iban, currency: ccy, rows: [], balance: null, balanceOn: null, _seen: new Map() }; byIban.set(iban, a); }
    // eindsaldo van dit afschrift (CLBD = closing booked)
    for (const b of kids(st, 'Bal')) {
      const tp = txt(at(b, 'Tp', 'CdOrPrtry', 'Cd')) || txt(at(b, 'Tp', 'CdOrPrtry', 'Prtry'));
      if (tp !== 'CLBD') continue;
      const v = parseAmount(txt(at(b, 'Amt'))), sign = txt(at(b, 'CdtDbtInd')) === 'DBIT' ? -1 : 1, on = parseDate(txt(at(b, 'Dt', 'Dt')) || txt(at(b, 'Dt', 'DtTm')));
      if (!Number.isNaN(v) && on && (!a.balanceOn || on >= a.balanceOn)) { a.balance = sign * v; a.balanceOn = on; }
    }
    for (const e of kids(st, 'Ntry')) {
      if (txt(at(e, 'Sts', 'Cd')) === 'PDNG' || txt(at(e, 'Sts')) === 'PDNG') continue; // nog niet geboekt
      const out = txt(at(e, 'CdtDbtInd')) === 'DBIT', v = parseAmount(txt(at(e, 'Amt')));
      const date = parseDate(txt(at(e, 'BookgDt', 'Dt')) || txt(at(e, 'BookgDt', 'DtTm')) || txt(at(e, 'ValDt', 'Dt')));
      if (Number.isNaN(v) || !date) continue;
      const tx = at(e, 'NtryDtls', 'TxDtls'), rp = at(tx, 'RltdPties');
      const side = out ? 'Cdtr' : 'Dbtr';
      const party = at(rp, side), acct = at(rp, side + 'Acct');
      const name = txt(at(party, 'Pty', 'Nm')) || txt(at(party, 'Nm')) || txt(at(rp, 'Ultmt' + side, 'Pty', 'Nm')) || txt(at(rp, 'Ultmt' + side, 'Nm'));
      const cpIban = normIban(txt(at(acct, 'Id', 'IBAN')));
      const ustrd = kids(at(tx, 'RmtInf'), 'Ustrd').map(txt).filter(Boolean).join(' ') || txt(at(tx, 'RmtInf', 'Strd', 'CdtrRefInf', 'Ref'));
      const desc = ustrd || txt(at(tx, 'AddtlTxInf')) || txt(at(e, 'AddtlNtryInf'));
      const row = {
        ext_id: '', booked_on: date, amount: out ? -v : v, currency: ccy,
        counterparty: clean(name, 140), counterparty_iban: isIban(cpIban) ? cpIban : '',
        description: clean(desc, 500), code: clean(txt(at(e, 'BkTxCd', 'Prtry', 'Cd')) || txt(at(e, 'BkTxCd', 'Domn', 'Fmly', 'SubFmlyCd')), 20),
        balance_after: null,
      };
      const ref = txt(at(e, 'AcctSvcrRef')) || txt(at(tx, 'Refs', 'AcctSvcrRef')) || txt(at(e, 'NtryRef'));
      row.ext_id = ref ? `camt:${ref}`.slice(0, 120) : `camt-h:${rowKey(row, a._seen)}`;
      a.rows.push(row);
    }
  }
  // dezelfde referentie twee keer (afschriften die elkaar overlappen): één keer houden
  const accounts = [...byIban.values()].map(({ _seen, ...a }) => { const ids = new Set(); return { ...a, rows: a.rows.filter(r => !ids.has(r.ext_id) && ids.add(r.ext_id)) }; });
  if (!accounts.some(a => a.rows.length)) throw new Error('Geen boekingen gevonden in dit afschrift.');
  return { format: 'CAMT.053', accounts, skipped: 0 };
}

export function parseFile(bytes) {
  const text = decode(bytes), head = text.trimStart().slice(0, 400);
  if (head.startsWith('<')) return parseCamt053(text);
  if (/^%PDF/.test(head)) throw new Error('Een pdf kan niet. Kies bij Downloaden transacties het formaat CSV.');
  return parseRabobankCsv(text);
}

// Samenvatting voor het scherm: periode en aantal (zonder bedragen).
export function period(rows) {
  if (!rows.length) return { from: '', to: '', count: 0 };
  let from = rows[0].booked_on, to = from;
  for (const r of rows) { if (r.booked_on < from) from = r.booked_on; if (r.booked_on > to) to = r.booked_on; }
  return { from, to, count: rows.length };
}

// sha256 (hex) van gezin + rekeningnummer: zo herkennen we dezelfde rekening zonder het nummer op te slaan.
export async function ibanHash(team, iban) {
  const data = new TextEncoder().encode(`${team}:${normIban(iban)}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
