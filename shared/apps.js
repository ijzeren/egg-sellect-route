// Familie-app — de apps onder de hub. Een app toevoegen = één item in deze lijst (plus zijn eigen map).
//   id      vaste naam (Engels, ook gebruikt in opslagsleutels)
//   name    naam op de tegel
//   route   map vanaf de root (Engelse slug), bijv. 'eggs/'
//   icon    emoji op de tegel
//   status(ctx) → { line, sub } korte stand van zaken; ctx = { today, account, storage }
import * as P from '../training/program.js';
import { PROGRAMS } from '../training/programs.js';
import { ratingOf, fmtStars } from '../recipes/recipe.js';
import { dayItems, dueSoon, kindOf, externalItems } from '../agenda/plan.js';

const DSH = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const MON = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const short = s => { const d = P.pd(s); return `${DSH[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`; };
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

//   about   één zin voor het aanzetten van de app
//   roles   rollen binnen de app (optioneel); 'member' is de standaard voor wie geen gezinsbeheerder is
export const APPS = [
  {
    id: 'eggs',
    name: 'Egg-sellent',
    route: 'eggs/',
    icon: '🥚',
    about: 'Eierronde langs de deur: afspraken, planning en besteladvies.',
    roles: { admin: 'Beheerder', member: 'Bezorger', walker: 'Bezorger' },
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
    about: 'Pilates 30 en Bio-circuit: trainen op je vaste dagen, samen of apart.',
    // Toont de actieve trainingen van deze gebruiker (zie training/app.js: tracks per gezin, per programma).
    status({ today, account, storage }) {
      const scope = account && account.teamId ? account.teamId : 'local';
      const tracks = storage.get('training', `${scope}:tracks`, {}) || {};
      const mine = t => t && !t.deleted && (!account || !account.teamId || (t.participants || []).includes(account.userId));
      const list = [];
      for (const pg of PROGRAMS) {
        const t = tracks[storage.get('training', `${scope}:active:${pg.id}`)];
        if (!mine(t)) continue;
        const d = P.normalize(t.data);
        if (!d.log.length && !d.settings.days.length) continue;
        const s = pg.kind === 'circuit' ? P.circuitStatus(d, today) : P.status(d, pg.total, today);
        list.push({ ...s, line: `${pg.name}: ${s.line}` });
      }
      if (!list.length) return { line: 'Kies een programma', sub: 'Pilates 30 of Bio-circuit' };
      list.sort((a, b) => (b.today ? 1 : 0) - (a.today ? 1 : 0));
      return { line: list[0].line, sub: list[1] ? list[1].line : list[0].sub, today: list[0].today };
    },
  },
  {
    id: 'recipes',
    name: 'Gerechten',
    route: 'recipes/',
    icon: '🍲',
    about: 'Recepten van het gezin met bereidingsschema, sterren en een gezondheidsscore.',
    roles: { admin: 'Beheerder', member: 'Lid' },
    // Uit de kopie op de telefoon (recipes/app.js): favoriet van het gezin en aantal gerechten.
    status({ account, storage }) {
      const d = account && account.teamId ? storage.get('recipes', `${account.teamId}:data`) : null;
      const list = (d && d.recipes) || [];
      if (!list.length) return { line: 'Zet jullie favoriete gerechten erin', sub: '' };
      const best = list.map(x => ({ x, r: ratingOf(d.ratings, x.id) })).filter(o => o.r.count).sort((a, b) => b.r.avg - a.r.avg || b.r.count - a.r.count)[0];
      const sub = plural(list.length, 'gerecht', 'gerechten');
      return best ? { line: `Favoriet: ${best.x.title} ★ ${fmtStars(best.r.avg)}`, sub } : { line: 'Geef sterren aan je favorieten', sub };
    },
  },
  {
    id: 'agenda',
    name: 'Agenda',
    route: 'agenda/',
    icon: '📅',
    about: 'Schoolrooster, trainingen, wedstrijden en huiswerk van de kinderen in één weekoverzicht.',
    // Uit de kopie op de telefoon (agenda/app.js). Gekoppeld aan een persoon in de agenda? Dan alleen die planning.
    // Telt mee: eigen afspraken én wat uit de andere apps komt (eierronde, leveringen, trainingen). Trainingen uit de
    // kopie van Training als die er is: die is nieuwer als je net je trainingsdagen hebt veranderd.
    status({ today, account, storage }) {
      const d = account && account.teamId ? storage.get('agenda', `${account.teamId}:data`) : null;
      if (!d || !(d.people || []).length) return { line: 'Rooster, sport en huiswerk', sub: '' };
      const p = d.people.find(x => x.user_id && x.user_id === account.userId), pid = p ? p.id : null;
      const tr = Object.values(storage.get('training', `${account.teamId}:tracks`, {}) || {}).filter(t => t && t.data);
      const ext = tr.length
        ? (d.ext || []).filter(x => !(x.ext && x.ext.app === 'training')).concat(externalItems({ tracks: tr, programs: PROGRAMS, people: d.people }))
        : d.ext || [];
      const items = dayItems((d.items || []).concat(ext), today, pid), soon = dueSoon(d.tasks, pid, today);
      const hw = soon.length ? plural(soon.length, 'taak', 'taken') + ' huiswerk voor morgen' : '';
      if (!items.length) return { line: 'Vandaag niets gepland', sub: hw };
      const now = new Date(), hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const next = items.find(it => (it.end || it.start || '24:00') >= hm);
      const line = next ? `${next.meet || next.start || ''} ${next.icon || kindOf(next.kind)[2]} ${next.title}`.trim() : `Vandaag: ${plural(items.length, 'afspraak', 'afspraken')}`;
      return { line, sub: [plural(items.length, 'afspraak', 'afspraken') + ' vandaag', hw].filter(Boolean).join(' · '), today: !!next };
    },
  },
];
