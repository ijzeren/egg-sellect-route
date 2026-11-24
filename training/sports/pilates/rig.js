// Pilates — bewegend lijnfiguurtje (zijaanzicht), zonder plaatjes: werkt offline en past bij licht en donker.
// Een houding is een handvol hoeken in graden (0 = rechts, 90 = omlaag, -90 = omhoog, 180 = links):
//   t  romp (heup → schouder)      c  kromming van de rug (+ = bol naar de rugkant)
//   n  hoofd (schouder → hoofd)    a  arm [bovenarm, onderarm]   A  arm achter (standaard = a)
//   l  been [bovenbeen, onderbeen, voet, schaal]   L  been achter (standaard = l); schaal < 1 = been naar je toe
// Een figuur: { k: [houding, …] } loopt rond door de houdingen; { anchor } houdt dat punt stil (standaard de heup);
// { fx: ['core', …] } kleurt waar je het voelt. Grond = het laagste punt (hoofd telt niet mee).
const LEN = { t: 26, n: 9, r: 5.5, ua: 15, fa: 14, th: 22, sh: 21, ft: 5 };
const GROUND = 86, SW = 4.6;
const rad = d => d * Math.PI / 180;
const dir = (d, l) => [Math.cos(rad(d)) * l, Math.sin(rad(d)) * l];
const add = (p, v) => [p[0] + v[0], p[1] + v[1]];

// Waar je het voelt: punt op de romp (0 = heup, 1 = schouder) of op een gewricht.
const FX = { core: ['t', .3], ribs: ['t', .6], back: ['t', .5], chest: ['t', .75], neck: ['j', 'S'], shoulder: ['j', 'S'],
  glute: ['j', 'Hp'], hip: ['j', 'Hp'], thigh: ['l', .5], hamstring: ['l', .5], arm: ['j', 'E'] };

// Houding aanvullen met standaardwaarden, zodat mengen per getal kan.
function full(p) {
  if (p._full) return p;
  const arm = x => { x = x || [90, 90]; return [x[0], x[1] == null ? x[0] : x[1]]; };
  const leg = x => { x = x || [90, 90]; return [x[0], x[1] == null ? x[0] : x[1], x[2] == null ? 0 : x[2], x[3] == null ? 1 : x[3]]; };
  return { _full: 1, t: p.t, c: p.c || 0, n: p.n == null ? p.t : p.n, a: arm(p.a), A: arm(p.A || p.a), l: leg(p.l), L: leg(p.L || p.l) };
}

function joints(p) {
  p = full(p);
  const Hp = [0, 0], S = add(Hp, dir(p.t, LEN.t));
  const mid = [(Hp[0] + S[0]) / 2, (Hp[1] + S[1]) / 2], nv = dir(p.t + 90, 1);
  const C = [mid[0] + nv[0] * p.c * 3, mid[1] + nv[1] * p.c * 3];
  const head = add(S, dir(p.n, LEN.n));
  const arm = a => { const E = add(S, dir(a[0], LEN.ua)); return [E, add(E, dir(a[1], LEN.fa))]; };
  const leg = l => { const K = add(Hp, dir(l[0], LEN.th * l[3])), F = add(K, dir(l[1], LEN.sh * l[3])); return [K, F, add(F, dir(l[2], LEN.ft))]; };
  const [E, Hd] = arm(p.a), [E2, Hd2] = arm(p.A), [K, F, T] = leg(p.l), [K2, F2, T2] = leg(p.L);
  return { Hp, S, C, head, E, Hd, E2, Hd2, K, F, T, K2, F2, T2 };
}

// Hoeken via de korte weg mengen; kromming en schaal lineair.
const mixA = (a, b, f) => { const d = ((b - a + 540) % 360) - 180; return a + d * f; };
const lin = (a, b, f) => a + (b - a) * f;
function mix(p, q, f) {
  p = full(p); q = full(q);
  const m = (x, y, lastLin) => x.map((v, i) => lastLin && i === 3 ? lin(v, y[i], f) : mixA(v, y[i], f));
  return { _full: 1, t: mixA(p.t, q.t, f), c: lin(p.c, q.c, f), n: mixA(p.n, q.n, f), a: m(p.a, q.a), A: m(p.A, q.A), l: m(p.l, q.l, 1), L: m(p.L, q.L, 1) };
}

const PTS = ['Hp', 'S', 'E', 'Hd', 'E2', 'Hd2', 'K', 'F', 'T', 'K2', 'F2', 'T2'];
function place(j, ax) {
  // grond: laagste punt (zonder hoofd) op de mat; anker: vast x-punt
  let low = -1e9; for (const k of PTS) low = Math.max(low, j[k][1]);
  const dx = ax == null ? 0 : ax, dy = GROUND - SW / 2 - low;
  const o = {}; for (const k of Object.keys(j)) o[k] = [j[k][0] + dx, j[k][1] + dy]; return o;
}

// Ease in-out met een korte stilstand op elke houding.
const ease = f => { f = Math.min(1, Math.max(0, (f - .15) / .7)); return f < .5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2; };
export function poseAt(fig, time) {
  const k = fig.k, n = k.length;
  if (n === 1) return k[0];
  const per = (fig.ms || 1800), x = (time / per) % n, i = Math.floor(x);
  return mix(k[i], k[(i + 1) % n], ease(x - i));
}

// Vast kader per figuur, uit alle houdingen samen (zodat het figuur niet verspringt of verschaalt).
function frame(fig) {
  if (fig._f) return fig._f;
  const anchor = fig.anchor || 'Hp', a0 = joints(fig.k[0])[anchor][0];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9;
  const n = fig.k.length, steps = n === 1 ? 1 : n * 8;
  for (let s = 0; s < steps; s++) {
    const p = n === 1 ? fig.k[0] : mix(fig.k[Math.floor(s / 8)], fig.k[(Math.floor(s / 8) + 1) % n], (s % 8) / 8);
    const j = joints(p), pl = place(j, a0 - j[anchor][0]);
    for (const k of PTS) { x0 = Math.min(x0, pl[k][0] - SW); x1 = Math.max(x1, pl[k][0] + SW); y0 = Math.min(y0, pl[k][1] - SW); }
    x0 = Math.min(x0, pl.head[0] - LEN.r - 2); x1 = Math.max(x1, pl.head[0] + LEN.r + 2); y0 = Math.min(y0, pl.head[1] - LEN.r - 2);
  }
  // minimaal 110 × 50, zodat kleine figuren niet opgeblazen worden
  const w = Math.max(110, x1 - x0 + 8), cx = (x0 + x1) / 2, top = Math.min(y0 - 4, GROUND + 4 - 50);
  return (fig._f = { anchor, a0, x: cx - w / 2, y: top, w, h: GROUND + 4 - top });
}

const f1 = v => Math.round(v * 10) / 10;
const P = p => f1(p[0]) + ' ' + f1(p[1]);
function draw(fig, p) {
  const fr = frame(fig), j0 = joints(p), m = place(j0, fr.a0 - j0[fr.anchor][0]);
  const back = `M${P(m.S)}L${P(m.E2)}L${P(m.Hd2)}M${P(m.Hp)}L${P(m.K2)}L${P(m.F2)}L${P(m.T2)}`;
  const body = `M${P(m.Hp)}Q${P(m.C)} ${P(m.S)}M${P(m.S)}L${P(m.E)}L${P(m.Hd)}M${P(m.Hp)}L${P(m.K)}L${P(m.F)}L${P(m.T)}`;
  const fx = (fig.fx || []).map(name => {
    const [kind, v] = FX[name] || ['t', .4];
    if (kind === 'j') return m[v];
    if (kind === 'l') return [m.Hp[0] + (m.K[0] - m.Hp[0]) * v, m.Hp[1] + (m.K[1] - m.Hp[1]) * v];
    const u = v, a = m.Hp, c = m.C, b = m.S;
    return [(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]];
  });
  return { back, body, head: m.head, fx };
}

export function figureSVG(fig, { mirror = false, label = '', id = '' } = {}) {
  const fr = frame(fig), d = draw(fig, fig.k[0]);
  const g = mirror ? ` transform="translate(${f1(2 * fr.x + fr.w)} 0) scale(-1 1)"` : '';
  return `<svg class="fig"${id ? ` data-fig="${id}"` : ''} viewBox="${f1(fr.x)} ${f1(fr.y)} ${f1(fr.w)} ${f1(fr.h)}" ${label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"'} focusable="false">`
    + `<rect class="mat" x="${f1(fr.x + 2)}" y="${GROUND}" width="${f1(fr.w - 4)}" height="3" rx="1.5"/><g${g}>`
    + d.fx.map(q => `<circle class="fx" cx="${f1(q[0])}" cy="${f1(q[1])}" r="8"/>`).join('')
    + `<path class="far" d="${d.back}" stroke-width="${SW}"/><path class="near" d="${d.body}" stroke-width="${SW}"/><circle class="hd" cx="${f1(d.head[0])}" cy="${f1(d.head[1])}" r="${LEN.r}"/></g></svg>`;
}

// Eén lus voor alle figuren op het scherm. Stopt vanzelf als er geen figuren meer zijn.
let running = false;
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
export function animateFigures(lookup) {
  if (running || reduce()) return; running = true;
  const t0 = performance.now();
  const step = now => {
    const els = document.querySelectorAll('svg.fig[data-fig]');
    if (!els.length) { running = false; return; }
    els.forEach(el => {
      if (!el.getBoundingClientRect().height) return;   // dichtgeklapt
      const fig = lookup(el.dataset.fig); if (!fig || fig.k.length < 2) return;
      const d = draw(fig, poseAt(fig, now - t0));
      el.querySelector('.far').setAttribute('d', d.back);
      el.querySelector('.near').setAttribute('d', d.body);
      const h = el.querySelector('.hd'); h.setAttribute('cx', f1(d.head[0])); h.setAttribute('cy', f1(d.head[1]));
      el.querySelectorAll('.fx').forEach((c, i) => { if (d.fx[i]) { c.setAttribute('cx', f1(d.fx[i][0])); c.setAttribute('cy', f1(d.fx[i][1])); } });
    });
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
