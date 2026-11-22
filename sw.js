// Service worker van de familie-app (hub + alle apps eronder): offline werken en updates.
// BIJ ELKE UPDATE: verhoog VERSION (en APP_VERSION in eggs/index.html als Egg-sellent verandert).
// Nieuw bestand toegevoegd? Zet het in ASSETS, anders werkt het niet offline.
const VERSION = '3.7.0';
const CACHE = 'familie-' + VERSION;
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './config.js', './icon-180.png', './icon-192.png', './icon-512.png',
  './shared/theme.css', './shared/ui.css', './shared/family.js', './shared/apps.js', './shared/releases.js', './shared/kb.js', './hub/app.js',
  './eggs/', './eggs/index.html',
  './training/', './training/index.html', './training/training.css', './training/app.js', './training/program.js',
  './training/programs.js', './training/sports/pilates/index.js', './training/sports/pilates/data.js', './training/sports/biocircuit/index.js',
  './recipes/', './recipes/index.html', './recipes/recipes.css', './recipes/app.js', './recipes/recipe.js', './recipes/import.js',
  './agenda/', './agenda/index.html', './agenda/agenda.css', './agenda/app.js', './agenda/plan.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' = langs de HTTP-cache van GitHub Pages, zodat een nieuwe versie echt nieuwe bestanden krijgt.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => (k.startsWith('eggselent-') || k.startsWith('familie-')) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// Cache-sleutel van een pagina: map → map/index.html, zonder ?… en #…
function pageKey(url) {
  const u = new URL(url);
  return u.origin + (u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname);
}

// Pagina's en config.js: eerst netwerk (max 3 sec), anders uit cache -> updates komen meteen door, offline blijft werken.
// Overige bestanden: eerst cache.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Lokaal ontwikkelen: altijd van het netwerk, zodat wijzigingen meteen zichtbaar zijn.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;

  const isConfig = new URL(req.url).pathname.endsWith('/config.js');
  if (req.mode === 'navigate' || isConfig) {
    const key = isConfig ? new URL('./config.js', self.registration.scope).href : pageKey(req.url);
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await Promise.race([
          fetch(req, { cache: 'no-cache' }),
          new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000)),
        ]);
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      } catch (err) {
        return (await cache.match(key)) || (await cache.match(key.replace(/index\.html$/, ''))) || Response.error();
      }
    })());
    return;
  }

  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

// Meldingen (web push), nu alleen van Egg-sellent: tonen, en bij tikken de app openen op de juiste plek.
// De push-functie op de server stuurde vroeger './' en './?v=order' (Egg-sellent stond toen op de root);
// die wijzen we om naar eggs/.
function notificationUrl(raw) {
  const scope = self.registration.scope;
  const u = new URL(raw || './', scope);
  if (u.href.split('?')[0] === scope) return new URL('eggs/' + u.search, scope).href;
  return u.href;
}
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Egg-sellent', {
    body: d.body || '', tag: d.tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './eggs/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = notificationUrl(e.notification.data && e.notification.data.url);
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
