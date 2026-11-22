// Familie-app — de apps onder de hub. Een app toevoegen = één item in deze lijst (plus zijn eigen map).
//   id      vaste naam (Engels, ook gebruikt in opslagsleutels)
//   name    naam op de tegel
//   route   map vanaf de root (Engelse slug), bijv. 'eggs/'
//   icon    emoji op de tegel
//   status(ctx) → { line, sub } korte stand van zaken; ctx = { today, account, storage }
import * as P from '../training/program.js';
import { PROGRAM as PILATES } from '../training/sports/pilates/index.js';

const DSH = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MON = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const short = s => { const d = P.pd(s); return `${DSH[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export const APPS = [
  {
    id: 'eggs',
    name: 'Egg-sellent',
    route: 'eggs/',
    icon: '🥚',
    status({ today, storage }) {
      const db = storage.raw('eggselent-data-v1');
      const sync = storage.raw('eggselent-sync-v1', {}) || {};
      if (!db || !Array.isArray(db.addresses)) return { line: 'Eierronde, afspraken en besteladvies', sub: '' };
      const active = db.addresses.filter(a => !a.excluded).length;
      const team = sync.team ? sync.team.name : '';
      const sub = [team, plural(active, 'adres', 'adressen')].filter(Boolean).join(' · ');
      const walk = (db.settings && db.settings.walkDays) || [], off = new Set(db.absences || []);
      const isWalk = d => walk.includes(P.dow(d)) && !off.has(d);
      if (isWalk(today)) {
        const n = (db.visits || []).filter(v => v.date === today).length;
        return { line: n ? `Ronde vandaag · ${plural(n, 'adres', 'adressen')} gedaan` : 'Vandaag ronde', sub, today: true };
      }
      for (let i = 1; i <= 28; i++) { const d = P.addDays(today, i); if (isWalk(d)) return { line: `Volgende ronde: ${short(d)}`, sub }; }
      return { line: 'Geen ronde gepland', sub };
    },
  },
  {
    id: 'training',
    name: 'Training',
    route: 'training/',
    icon: '🧘',
    // Toont de actieve training van deze gebruiker (zie training/app.js: tracks per gezin).
    status({ today, account, storage }) {
      const scope = account && account.teamId ? account.teamId : 'local';
      const tracks = storage.get('training', `${scope}:tracks`, {}) || {};
      const t = tracks[storage.get('training', `${scope}:active:${PILATES.id}`)];
      if (!t || t.deleted) return { line: `${PILATES.name}: kies je trainingsdagen`, sub: 'Samen of apart trainen' };
      const s = P.status(P.normalize(t.data), PILATES.total, today);
      return { line: `${PILATES.name}: ${s.line}`, sub: s.sub, today: s.today };
    },
  },
];
