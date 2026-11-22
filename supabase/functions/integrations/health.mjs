// Gezondheid: wat een opdracht (Opdrachten/Shortcuts) op de iPhone stuurt, omzetten naar dagwaarden.
// Gedeeld door de Edge Function `integrations` (modus ingest) en tests/health.test.mjs; geen afhankelijkheden.
//
// De opdracht stuurt JSON, bijv. { "steps": "8.123", "weight": "72,4 kg", "date": "2026-11-22" }.
// - Waarden mogen getal, tekst (met eenheid, Nederlandse komma of duizendtallen-punt) of een lijst zijn. Opdrachten
//   zet meerdere gezondheidsmonsters in een tekstveld onder elkaar: stappen worden dan opgeteld, van gewicht telt de
//   eerste (de opdracht sorteert nieuwste eerst).
// - date is optioneel (jjjj-mm-dd); zonder datum geldt vandaag (Nederlandse tijd). Hooguit 31 dagen terug, niet vooruit.
// - Per soort mag een eigen datum mee: weight_date / steps_date (ook gewicht_datum, weightDate). Zo komt een weging van
//   eergisteren op eergisteren, ook als de opdracht elke dag draait. ISO 8601 met tijd mag ("2026-11-20T07:12:00+01:00").
// - Een leeg veld (geen meting in Gezondheid) wordt stil overgeslagen; dat is geen fout.
// - Onmogelijke waarden (gewicht buiten 20–400 kg, meer dan 200.000 stappen op een dag) worden overgeslagen.

export const KINDS = { weight: { unit: 'kg', min: 20, max: 400 }, steps: { unit: 'stappen', min: 0, max: 200000 } };
const DATE_KEY = /^(weight|gewicht|bodymass|body_mass|steps|stappen|stepcount|step_count)(_?date|_datum)$/;
const ALIASES = { weight: 'weight', gewicht: 'weight', bodymass: 'weight', body_mass: 'weight', steps: 'steps', stappen: 'steps', stepcount: 'steps', step_count: 'steps' };

// "72,4 kg" → 72.4; "8.123" → 8123 (stappen: hele getallen); "160 lb" → 72.57
export function parseNumber(raw, kind) {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? '').trim().toLowerCase();
  if (!s) return null;
  const lb = /\b(lb|lbs|pound)/.test(s), st = /\bst\b/.test(s);
  s = s.replace(/[^\d.,\-]/g, '');
  if (!/\d/.test(s)) return null;
  if (kind === 'steps') {
    // duizendtallen (8.123 / 8,123 / 12.345.678) of een decimaal getal (8123.0 / 8123,4)
    if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return +s.replace(/[.,]/g, '');
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) ? Math.round(v) : null;
  }
  // gewicht: komma of punt als decimaalteken; duizendtallen komen niet voor
  if (/^\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else s = s.replace(/,/g, '');
  let v = parseFloat(s);
  if (!Number.isFinite(v)) return null;
  if (lb) v = v * 0.45359237;
  if (st) v = v * 6.35029318;
  return Math.round(v * 100) / 100;
}

// Een veld kan een lijst zijn (array, of tekst met één waarde per regel).
function values(raw) {
  if (Array.isArray(raw)) return raw.flatMap(values);
  if (raw && typeof raw === 'object') { const v = raw.value ?? raw.quantity ?? raw.qty; return v == null ? [raw] : values(v); }
  if (typeof raw === 'string' && /\n/.test(raw)) return raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return raw == null || (typeof raw === 'string' && !raw.trim()) ? [] : [raw];
}

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// body → { day, samples: [{ kind, value, unit }], ignored: [veldnamen], problems: [tekst] }
const NAME = { steps: 'stappen', weight: 'gewicht' };
// Wat er binnenkwam, kort, voor de foutmelding (alleen de eigenaar ziet die): "tekst" of {velden}.
const shown = v => { const t = typeof v === 'string' ? `"${v}"` : JSON.stringify(v) ?? String(v); return t.length > 60 ? t.slice(0, 57) + '…' : t; };
const keyOf = k => k.toLowerCase().replace(/[\s-]+/g, '_');

// Datumtekst → { day } of { problem } of { tooOld }. Eerste waarde van een lijst telt.
function readDay(raw, today, what) {
  const first = values(raw)[0];
  const d = typeof first === 'string' ? first.trim().slice(0, 10) : '';
  if (!d) return {};
  if (!isDate(d)) return { problem: `Onbekende datum${what}; vandaag gebruikt.` };
  if (d > today) return { problem: `Datum${what} in de toekomst; vandaag gebruikt.` };
  if (d < addDays(today, -31)) return { tooOld: true, problem: `Datum${what} langer dan een maand geleden; niet opgeslagen.` };
  return { day: d };
}

// body → { day, samples: [{ kind, value, unit, day }], ignored: [veldnamen], empty: [soorten], problems: [tekst] }
export function parseHealthBody(body, today, allowed = ['weight', 'steps']) {
  const out = { day: today, samples: [], ignored: [], empty: [], problems: [] };
  if (!body || typeof body !== 'object' || Array.isArray(body)) { out.problems.push('Geen gegevens ontvangen.'); return out; }
  const all = readDay(body.date, today, '');
  if (all.problem) out.problems.push(all.tooOld ? 'Datum langer dan een maand geleden; niets opgeslagen.' : all.problem);
  if (all.tooOld) return out;
  if (all.day) out.day = all.day;
  // eigen datum per soort (weight_date, stappen_datum, …)
  const own = {};
  for (const [key, raw] of Object.entries(body)) {
    const m = DATE_KEY.exec(keyOf(key));
    if (m) own[ALIASES[m[1]]] = raw;
  }
  for (const [key, raw] of Object.entries(body)) {
    const k0 = keyOf(key);
    if (key === 'date' || DATE_KEY.test(k0)) continue;
    const kind = ALIASES[k0];
    if (!kind || !allowed.includes(kind)) { out.ignored.push(key); continue; }
    const list = values(raw);
    if (!list.length) { out.empty.push(kind); continue; }
    const nums = list.map(v => parseNumber(v, kind)).filter(v => v != null);
    if (!nums.length) { out.problems.push(`Geen getal gevonden voor ${NAME[kind]} (ontvangen: ${shown(list[0])}).`); continue; }
    const value = kind === 'steps' ? nums.reduce((a, b) => a + b, 0) : nums[0];
    const k = KINDS[kind];
    if (value < k.min || value > k.max) { out.problems.push(`${kind === 'steps' ? 'Stappen' : 'Gewicht'} lijkt niet te kloppen (${value}); niet opgeslagen.`); continue; }
    let day = out.day;
    if (own[kind] != null) {
      const r = readDay(own[kind], today, ` van ${NAME[kind]}`);
      if (r.problem) out.problems.push(r.problem);
      if (r.tooOld) continue;
      if (r.day) day = r.day;
    }
    out.samples.push({ kind, value, unit: k.unit, day });
  }
  return out;
}
