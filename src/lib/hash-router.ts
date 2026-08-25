export type HashRoute =
  | { kind: 'home' }
  | { kind: 'shared'; code: string }
  | { kind: 'daily' }
  | { kind: 'random'; seed: string | null }
  | { kind: 'invalid' };

const MAX_SEED_LENGTH = 128;
const PUZZLE_PREFIX = 'puzzle=';
const RANDOM_PREFIX = 'random=';

function decodeRouteValue(value: string): string | null {
  try {
    const decoded = decodeURIComponent(value);
    return decoded && decoded.length <= MAX_SEED_LENGTH ? decoded : null;
  } catch {
    return null;
  }
}

export function parseHashRoute(hash: string): HashRoute {
  const route = hash.replace(/^#/, '');
  if (!route) return { kind: 'home' };
  if (route === 'daily') return { kind: 'daily' };
  if (route === 'random') return { kind: 'random', seed: null };
  if (route.startsWith(RANDOM_PREFIX)) {
    const seed = decodeRouteValue(route.slice(RANDOM_PREFIX.length));
    return seed ? { kind: 'random', seed } : { kind: 'invalid' };
  }
  if (route.startsWith(PUZZLE_PREFIX) && route.length > PUZZLE_PREFIX.length) {
    return { kind: 'shared', code: route.slice(PUZZLE_PREFIX.length) };
  }
  return { kind: 'invalid' };
}

export function randomPuzzleHash(seed?: string): string {
  return seed === undefined ? '#random' : `#random=${encodeURIComponent(seed)}`;
}

export function dailyPuzzleHash(): string {
  return '#daily';
}

export function sharedPuzzleHash(code: string): string {
  return `#puzzle=${code}`;
}

export function hashRouteUrl(
  locationLike: Pick<Location, 'href'> | string,
  hash: string,
): string {
  const base = String(typeof locationLike === 'string' ? locationLike : locationLike.href).split('#')[0];
  return `${base}${hash}`;
}

export function sharedPuzzleUrl(
  locationLike: Pick<Location, 'href'> | string,
  code: string,
): string {
  return hashRouteUrl(locationLike, sharedPuzzleHash(code));
}
