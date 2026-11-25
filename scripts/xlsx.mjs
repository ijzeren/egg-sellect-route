// Klein Excel-leesprogramma (.xlsx) zonder extra pakketten: zip uitpakken met zlib, daarna de XML van de tabbladen.
// Geeft per tabblad een Map 'A1' → waarde (getal of tekst). Formules: de laatst berekende waarde uit het bestand.
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

function unzip(buf) {
  let e = buf.length - 22;
  while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Geen geldig .xlsx-bestand (zip)');
  const files = {}, n = buf.readUInt16LE(e + 10);
  let p = buf.readUInt32LE(e + 16);
  for (let i = 0; i < n; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nl), start = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = method === 0 ? raw : inflateRawSync(raw);
    p += 46 + nl + xl + cl;
  }
  return files;
}

const unxml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, '&');
const texts = s => [...s.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(m => unxml(m[1])).join('');

// → { 'Tabbladnaam': Map('A1' → waarde) }
export function readXlsx(path) {
  const f = unzip(readFileSync(path)), str = k => (f[k] ? f[k].toString('utf8') : '');
  const shared = [...str('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => texts(m[1]));
  const rels = Object.fromEntries([...str('xl/_rels/workbook.xml.rels').matchAll(/<Relationship [^>]*>/g)].map(m => [m[0].match(/Id="([^"]+)"/)[1], m[0].match(/Target="([^"]+)"/)[1]]));
  const out = {};
  for (const m of str('xl/workbook.xml').matchAll(/<sheet [^>]*>/g)) {
    const name = unxml(m[0].match(/name="([^"]+)"/)[1]), rid = m[0].match(/r:id="([^"]+)"/)[1];
    const target = rels[rid].replace(/^\/?(xl\/)?/, 'xl/'), cells = new Map();
    for (const c of str(target).matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, body = ''] = c, t = (attrs.match(/t="([^"]+)"/) || [])[1], v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = null;
      if (t === 's') val = v === undefined ? null : shared[+v];
      else if (t === 'inlineStr') val = texts(body);
      else if (t === 'str' || t === 'e') val = v === undefined ? null : unxml(v);
      else if (t === 'b') val = v === '1';
      else if (v !== undefined) val = Number(v);
      if (val !== null && val !== '') cells.set(ref, val);
    }
    out[name] = cells;
  }
  return out;
}

// Excel-datum (dagnummer) → 'jjjj-mm-dd'
export const excelDate = n => (typeof n === 'number' && n > 20000 && n < 80000 ? new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5).toISOString().slice(0, 10) : null);
