// Minimal Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Pass through all requests
  event.respondWith(fetch(event.request).catch(() => {
    // If offline, maybe return a fallback page if you had one cached
    // For now, just fail gracefully or return nothing
  }));
});
