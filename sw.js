// Service worker: deja la app disponible sin conexión.
const CACHE = 'mercancia-saas-v4';
const ASSETS = ['.', 'index.html', 'manifest.webmanifest', 'vendor/supabase.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-180.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para recibir actualizaciones), caché como respaldo offline.
// cache:'no-store' es la parte importante: sin esto, el propio navegador
// puede devolver una respuesta HTTP cacheada (de GitHub Pages) sin siquiera
// tocar la red, y entonces "red primero" termina sirviendo una versión vieja
// igual — ya nos pasó una vez con un cambio que no se veía reflejado.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // no tocar las llamadas a Supabase (auth, datos, tiempo real)
  if (new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
