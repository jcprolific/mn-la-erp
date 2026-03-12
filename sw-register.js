/**
 * Registers the PWA service worker for installability. No caching logic here.
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js', { scope: './' }).catch(function () {});
}
