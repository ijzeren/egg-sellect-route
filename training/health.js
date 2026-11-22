// Training — gezondheid (gewicht en stappen van de iPhone) samenvatten voor het scherm. Zonder scherm, dus te testen.
// Rijen uit health_samples: { user_id, kind: 'weight'|'steps', day: 'jjjj-mm-dd', value }.
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// → { weight: { value, day, delta } | null, steps: { today, avg, week: [{ day, value|null }] }, empty }
export function summary(rows, userId, today) {
  const mine = (rows || []).filter(r => r.user_id === userId);
  const w = mine.filter(r => r.kind === 'weight').sort((a, b) => a.day.localeCompare(b.day));
  let weight = null;
  if (w.length) {
    const last = w[w.length - 1], ref = addDays(last.day, -30);
    // vergelijken met de meting die het dichtst bij een maand eerder ligt (en minstens twee weken eerder)
    const older = w.filter(r => r.day <= addDays(last.day, -14));
    const base = older.length ? older.reduce((a, b) => Math.abs(Date.parse(a.day) - Date.parse(ref)) <= Math.abs(Date.parse(b.day) - Date.parse(ref)) ? a : b) : null;
    weight = { value: +last.value, day: last.day, delta: base ? Math.round((last.value - base.value) * 10) / 10 : null };
  }
  const st = new Map(mine.filter(r => r.kind === 'steps').map(r => [r.day, +r.value]));
  const week = Array.from({ length: 7 }, (_, i) => { const day = addDays(today, i - 6); return { day, value: st.has(day) ? st.get(day) : null }; });
  const vals = week.map(x => x.value).filter(v => v != null);
  return { weight, steps: { today: st.has(today) ? st.get(today) : null, avg: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null, week }, empty: !w.length && !st.size };
}

export const fmtKg = v => `${String(Math.round(v * 10) / 10).replace('.', ',')} kg`;
export const fmtSteps = v => Math.round(v).toLocaleString('nl-NL');
