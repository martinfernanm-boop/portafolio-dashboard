const CACHE_NAME = 'portafolio-v1';
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

// Network-first para GAS/APIs, cache-first para assets estáticos
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // GAS, Yahoo, FMP, Groq → siempre red (no cachear datos dinámicos)
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('finance.yahoo.com') ||
    url.hostname.includes('financialmodelingprep.com') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('binance.com') ||
    url.hostname.includes('corsproxy.io')
  ) {
    return; // dejar que el browser maneje normalmente
  }

  // Assets estáticos → cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      });
    })
  );
});
