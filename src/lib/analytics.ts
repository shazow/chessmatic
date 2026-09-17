// Counterscale (https://counter.shazow.net) pageview tracking.
import * as Counterscale from '@counterscale/tracker';
import type { HashRoute } from './hash-router';

const SITE_ID = 'chessmatic';
const REPORTER_URL = 'https://counter.shazow.net/collect';

// Routes live in the URL hash, which Counterscale's auto-tracking neither sees
// nor reports, so pageviews are sent by hand from the hash router instead.
export function initAnalytics(): void {
  Counterscale.init({
    siteId: SITE_ID,
    reporterUrl: REPORTER_URL,
    autoTrackPageviews: false,
  });
}

// The route kind is the whole path: seeds and shared puzzle codes are unique
// per-link, so reporting them would make a separate path out of every visit.
export function trackRoute(route: HashRoute): void {
  if (!Counterscale.isInitialized()) return;
  Counterscale.trackPageview({ url: `/${route.kind}` });
}
