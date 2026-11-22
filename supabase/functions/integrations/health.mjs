// Gezondheid: wat een opdracht (Opdrachten/Shortcuts) op de iPhone stuurt, omzetten naar dagwaarden.
// Gedeeld door de Edge Function `integrations` (modus ingest) en tests/health.test.mjs; geen afhankelijkheden.
//
// De opdracht stuurt JSON, bijv. { "steps": "8.123", "weight": "72,4 kg", "date": "2026-11-22" }.
// - Waarden mogen getal, tekst (met eenheid, Nederlandse komma of duizendtallen-punt) of een lijst zijn. Opdrachten
//   zet meerdere gezondheidsmonsters in een tekstveld onder elkaar: stappen worden dan opgeteld, van gewicht telt de
//   eerste (de opdracht sorteert nieuwste eerst).
// - date is optioneel (jjjj-mm-dd); zonder datum geldt vandaag (Nederlandse tijd). Hooguit 31 dagen terug, niet vooruit.
// - Onmogelijke waarden (gewicht buiten 20–400 kg, meer dan 200.000 stappen op een dag) worden overgeslagen.

export const KINDS = { weight: { unit: 'kg', min: 20, max: 400 }, steps: { unit: 'stappen', min: 0, max: 200000 } };
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
  if (raw && typeof raw === 'object') return values(raw.value ?? raw.quantity ?? raw.qty ?? null);
  if (typeof raw === 'string' && /\n/.test(raw)) return raw.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  return raw == null || raw === '' ? [] : [raw];
}

const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// body → { day, samples: [{ kind, value, unit }], ignored: [veldnamen], problems: [tekst] }
export function parseHealthBody(body, today, allowed = ['weight', 'steps']) {
  const out = { day: today, samples: [], ignored: [], problems: [] };
  if (!body || typeof body !== 'object' || Array.isArray(body)) { out.problems.push('Geen gegevens ontvangen.'); return out; }
  const d = typeof body.date === 'string' ? body.date.trim().slice(0, 10) : '';
  if (d) {
    if (!isDate(d)) out.problems.push('Onbekende datum; vandaag gebruikt.');
    else if (d > today) out.problems.push('Datum in de toekomst; vandaag gebruikt.');
    else if (d < addDays(today, -31)) { out.problems.push('Datum langer dan een maand geleden; niets opgeslagen.'); return out; }
    else out.day = d;
  }
  for (const [key, raw] of Object.entries(body)) {
    if (key === 'date') continue;
    const kind = ALIASES[key.toLowerCase().replace(/\s+/g, '_')];
    if (!kind) { out.ignored.push(key); continue; }
    if (!allowed.includes(kind)) { out.ignored.push(key); continue; }
    const nums = values(raw).map(v => parseNumber(v, kind)).filter(v => v != null);
    if (!nums.length) { out.problems.push(`Geen getal gevonden voor ${kind === 'steps' ? 'stappen' : 'gewicht'}.`); continue; }
    const value = kind === 'steps' ? nums.reduce((a, b) => a + b, 0) : nums[0];
    const k = KINDS[kind];
    if (value < k.min || value > k.max) { out.problems.push(`${kind === 'steps' ? 'Stappen' : 'Gewicht'} lijkt niet te kloppen (${value}); niet opgeslagen.`); continue; }
    out.samples.push({ kind, value, unit: k.unit });
  }
  return out;
}
