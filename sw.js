// Service worker for the Getter Group order form PWA.
// Caches the app shell so agents can open and use the form (including PDF
// generation, which needs no network at all) without a connection after the
// first successful load.
//
// Strategy: network-first for the HTML document itself (so a fixed/updated
// form always reaches an online agent immediately instead of being shadowed
// by a stale cached copy), cache-first for the heavy static assets (fonts,
// jsPDF, logo, catalog data) that rarely change and are expensive to
// re-fetch. Bump CACHE_NAME whenever this file or the cached asset list
// changes, so old caches are dropped on activate.
var CACHE_NAME = 'getter-order-form-v7';
var ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './data.js',
  './fonts.js',
  './jspdf.umd.min.js',
  './logo.png',
  './pdf-lib.min.js',
  './fontkit.umd.min.js',
  './agreements.js'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return cache.addAll(ASSETS).catch(function(err){
        // Don't fail the whole install if one optional asset (e.g. a Google
        // Fonts stylesheet fetched elsewhere) can't be cached up front.
        console.warn('sw: some assets failed to precache', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){ return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

function isNavigationRequest(request){
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept') && request.headers.get('accept').indexOf('text/html') !== -1);
}

self.addEventListener('fetch', function(event){
  if(event.request.method !== 'GET') return;

  if(isNavigationRequest(event.request)){
    // Network-first for the page itself: always try to get the latest
    // version when online, and only fall back to whatever was last cached
    // when there's genuinely no connection.
    event.respondWith(
      fetch(event.request).then(function(resp){
        if(resp && resp.ok){
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, clone); });
        }
        return resp;
      }).catch(function(){
        return caches.match(event.request).then(function(cached){
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Cache-first for everything else (static assets that rarely change).
  event.respondWith(
    caches.match(event.request).then(function(cached){
      if(cached) return cached;
      return fetch(event.request).then(function(resp){
        if(resp && resp.ok && event.request.url.indexOf(self.location.origin) === 0){
          var clone = resp.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, clone); });
        }
        return resp;
      }).catch(function(){
        return cached;
      });
    })
  );
});
