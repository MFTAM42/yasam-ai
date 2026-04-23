// Yaşam.AI — Service Worker (network-first HTML, cache-first assets)
const CACHE = 'yasamai-v48';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // Tek tek ekle — biri 404 olsa bile install başarısız olmasın
      Promise.all(CORE.map((u) => c.add(u).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Ana sayfayı güncellemek için (client'tan mesaj gelirse SW hemen yenilensin)
self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

// Bildirime tıklayınca uygulamayı aç (veya fokusla)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type:'window', includeUncontrolled:true }).then((clients) => {
      for (const c of clients) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Harici kaynaklar (AI API, Google, EmailJS, CDN vs.) — SW'ye dokunma
  if (url.origin !== location.origin) return;

  const isHTML =
    e.request.mode === 'navigate' ||
    e.request.destination === 'document' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('/');

  if (isHTML) {
    // NETWORK-FIRST: HTML her zaman güncel gelsin, offline'da cache fallback
    e.respondWith(
      fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => caches.match(e.request).then((m) => m || caches.match('./index.html')))
    );
    return;
  }

  // Diğer asset'ler (ikon, manifest, JSON) — cache-first ama arka planda tazele
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const netFetch = fetch(e.request).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      }).catch(() => cached);
      return cached || netFetch;
    })
  );
});
