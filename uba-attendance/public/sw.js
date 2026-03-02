const CACHE_NAME = 'uba-v1-cache';
const OFFLINE_URL = '/offline'; // Optional: create an offline.tsx page later

// Assets to cache immediately for 100% offline loading
const urlsToCache = [
  '/',
  '/uba-logo.png',
  '/veltech-logo.png',
  '/favicon.ico',
  '/globals.css',
  '/manifest.json'
];

// Install Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline assets');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// Activate & Cleanup Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Intercept Network Requests (The "Brain")
self.addEventListener('fetch', (event) => {
  // Only intercept GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return from cache if found, otherwise fetch from network
      return response || fetch(event.request).catch(() => {
        // Fallback for images if network fails and not in cache
        if (event.request.destination === 'image') {
          return caches.match('/uba-logo.png');
        }
      });
    })
  );
});