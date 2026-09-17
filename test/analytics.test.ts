import { expect, test } from 'vitest';
import { routePath, trackRoute } from '../src/lib/analytics';
import { parseHashRoute } from '../src/lib/hash-router';

test('reports one path per kind of route', () => {
  expect(routePath(parseHashRoute(''))).toBe('/');
  expect(routePath(parseHashRoute('#daily'))).toBe('/daily');
  expect(routePath(parseHashRoute('#random'))).toBe('/random');
  expect(routePath(parseHashRoute('#nope'))).toBe('/invalid');
});

test('keeps seeds and shared codes out of reported paths', () => {
  expect(routePath(parseHashRoute('#random=fixed%20seed'))).toBe('/random');
  expect(routePath(parseHashRoute('#puzzle=abc_123'))).toBe('/puzzle');
});

test('does nothing until analytics are initialized', () => {
  expect(() => trackRoute({ kind: 'home' })).not.toThrow();
});
