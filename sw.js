/**
 * Minimal PWA service worker – installability only.
 * No precache, no aggressive offline caching. All requests go to network.
 */
self.addEventListener('fetch', function (event) {
  event.respondWith(fetch(event.request));
});
