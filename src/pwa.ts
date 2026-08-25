import { registerSW } from 'virtual:pwa-register';

// How often a long-lived tab or installed PWA re-checks for a new deploy.
// Fresh navigations already check on load; autoUpdate reloads once the new
// service worker takes control.
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    setInterval(() => {
      registration.update().catch(() => {
        // Offline or transient network failure; the next interval retries.
      });
    }, UPDATE_CHECK_INTERVAL_MS);
  },
});
