// Counterscale (https://counter.shazow.net) pageview tracking.
//
// Routes live in the URL hash, which Counterscale's auto-tracking neither sees
// nor reports, so pageviews are sent by hand from the hash router instead.
import * as Counterscale from '@counterscale/tracker';
import type { HashRoute } from './hash-router';

Counterscale.init({
  siteId: 'chessmatic',
  reporterUrl: 'https://counter.shazow.net/collect',
  autoTrackPageviews: false,
});

// The route kind is the whole path: seeds and shared puzzle codes are unique
// per-link, so reporting them would make a separate path out of every visit.
export function trackRoute(route: HashRoute): void {
  Counterscale.trackPageview({ url: `/${route.kind}` });
}
