// Counterscale (https://counter.shazow.net) pageview tracking.
//
// The script is injected at runtime rather than hardcoded in index.html so
// that dev servers and e2e runs against the preview build don't report hits.

const SITE_ID = 'chessmatic';
const TRACKER_URL = 'https://counter.shazow.net/tracker.js';

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

if (import.meta.env.PROD && !LOCAL_HOSTS.includes(location.hostname)) {
  const script = document.createElement('script');
  script.id = 'counterscale-script';
  script.dataset.siteId = SITE_ID;
  script.src = TRACKER_URL;
  script.defer = true;
  document.head.append(script);
}
