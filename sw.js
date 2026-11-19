// Cache hors-ligne : l'app fonctionne sans réseau après le premier chargement.
const CACHE = 'monbudget-v3';
const FILES = ['./', 'index.html', 'app.js', 'parsers.js', 'insights.js', 'fx.js', 'bank.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-512.png'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // jamais de cache pour l'API bancaire
  // réseau d'abord (pour les mises à jour), cache sinon
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
