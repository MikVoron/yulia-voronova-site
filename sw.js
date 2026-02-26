const CACHE = 'yulia-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  '/',
  '/offline.html',
  '/style.css',
  '/main.js',
  '/images/favicons/web-app-manifest-192x192.png',
  '/images/favicons/web-app-manifest-512x512.png',
  '/images/favicons/apple-touch-icon.png'
];

// Install: precache core assets
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(PRECACHE);
    })
  );
  self.skipWaiting();
});

// Activate: delete old caches
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE; })
            .map(function (k) { return caches.delete(k); })
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy:
//  - navigation (HTML) → network-first, fallback to cache, then offline.html
//  - static assets    → cache-first, fallback to network
self.addEventListener('fetch', function (e) {
  var req = e.request;

  // Only handle same-origin GET requests
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;

  if (req.mode === 'navigate') {
    // Network-first for HTML pages
    e.respondWith(
      fetch(req)
        .then(function (res) {
          var clone = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, clone); });
          return res;
        })
        .catch(function () {
          return caches.match(req).then(function (cached) {
            return cached || caches.match(OFFLINE_URL);
          });
        })
    );
  } else {
    // Cache-first for static assets
    e.respondWith(
      caches.match(req).then(function (cached) {
        return cached || fetch(req).then(function (res) {
          if (res.ok) {
            var clone = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, clone); });
          }
          return res;
        });
      })
    );
  }
});
