// Service worker: zorgt dat de app offline werkt en updates binnenkomen.
// BIJ ELKE UPDATE: verhoog VERSION (en APP_VERSION in index.html).
const VERSION = '2.5.0';
const CACHE = 'eggselent-' + VERSION;
const ASSETS = ['./', './index.html', './manifest.webmanifest', './config.js', './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('eggselent-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

// Pagina zelf: eerst netwerk (max 3 sec), anders uit cache -> updates komen meteen door, offline blijft werken.
// Overige bestanden: eerst cache.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // De pagina en config.js horen bij elkaar: allebei eerst netwerk, zodat een nieuwe koppeling meteen doorkomt.
  const isConfig = new URL(req.url).pathname.endsWith('/config.js');
  if (req.mode === 'navigate' || isConfig) {
    const key = isConfig ? './config.js' : './index.html';
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
        return (await cache.match(key)) || (!isConfig && (await cache.match('./'))) || Response.error();
      }
    })());
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }))
  );
});

// Meldingen (web push): tonen, en bij tikken de app openen op de juiste plek.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Egg-sellent', {
    body: d.body || '', tag: d.tag, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) { if ('focus' in c) { if ('navigate' in c) c.navigate(url).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
