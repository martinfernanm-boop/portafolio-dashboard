const CACHE_NAME = 'portafolio-v2';
const STATIC_ASSETS = [
  '/portafolio-dashboard/',
  '/portafolio-dashboard/index.html',
  '/portafolio-dashboard/manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // GAS, Yahoo, FMP, Groq, Binance → siempre red (datos dinámicos, no cachear)
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('finance.yahoo.com') ||
    url.hostname.includes('financialmodelingprep.com') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('binance.com') ||
    url.hostname.includes('corsproxy.io') ||
    url.hostname.includes('generativelanguage.googleapis.com')
  ) {
    return;
  }

  // Documento (index.html) → network-first para recibir updates al instante,
  // cache como fallback offline
  if (e.request.mode === 'navigate' || url.pathname.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets estáticos (íconos, CDN libs) → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
