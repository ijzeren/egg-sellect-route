// Sport: Pilates — programma "Pilates 30" (30 lessen van 30 minuten).
import { E, WU, CD, WEEKS, DAYS } from './data.js';

export { E, WEEKS, DAYS };

export const PHASES = ['Warming-up', 'Hoofdtraining', 'Cooldown'];
export const LESSON_SECONDS = 1800;

// Oefeningen van les n (1-30): warming-up, hoofdtraining, cooldown. ph = fase, side = per kant.
export function planFor(n) {
  const d = DAYS[n - 1], w = d.w;
  const wu = WU[w >= 2 ? 3 : w + 1];
  const cd = d.rest ? CD.R : CD[w >= 2 ? 3 : w + 1];
  const mk = (a, ph) => a.map(x => ({ id: x[0], s: x[1], ph, side: !!E[x[0]].s }));
  return [...mk(wu, 0), ...mk(d.m, 1), ...mk(cd, 2)];
}

// De lessen heetten eerst dagen; bij vaste trainingsdagen is een "rustdag" een rustige les.
export const lessonTitle = n => DAYS[n - 1].t.replace(/^Rustdag: /, 'Rustige les: ');

export const PROGRAM = {
  id: 'pilates30',
  kind: 'lessons',
  sport: 'Pilates',
  name: 'Pilates 30',
  tagline: '30 lessen · 30 minuten · samen oefenen',
  total: DAYS.length,
  minutes: 30,
  icon: '🧘',
};
