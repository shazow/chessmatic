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

// Seeds and shared puzzle codes are unique per-link, so they are left out of
// the reported path to keep puzzles of a kind aggregated together.
export function routePath(route: HashRoute): string {
  switch (route.kind) {
    case 'home':
      return '/';
    case 'shared':
      return '/puzzle';
    case 'daily':
      return '/daily';
    case 'random':
      return '/random';
    case 'invalid':
      return '/invalid';
  }
}

export function trackRoute(route: HashRoute): void {
  if (!Counterscale.isInitialized()) return;
  Counterscale.trackPageview({ url: routePath(route) });
}
