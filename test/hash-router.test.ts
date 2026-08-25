import { expect, test } from 'vitest';
import {
  dailyPuzzleHash,
  hashRouteUrl,
  parseHashRoute,
  randomPuzzleHash,
  sharedPuzzleHash,
  sharedPuzzleUrl,
} from '../src/lib/hash-router';

test('parses application hash routes', () => {
  expect(parseHashRoute('')).toEqual({ kind: 'home' });
  expect(parseHashRoute('#daily')).toEqual({ kind: 'daily' });
  expect(parseHashRoute('#random')).toEqual({ kind: 'random', seed: null });
  expect(parseHashRoute('#random=fixed%20seed')).toEqual({ kind: 'random', seed: 'fixed seed' });
  expect(parseHashRoute('#puzzle=abc_123')).toEqual({ kind: 'shared', code: 'abc_123' });
});

test('rejects malformed or unknown routes', () => {
  expect(parseHashRoute('#random=')).toEqual({ kind: 'invalid' });
  expect(parseHashRoute('#random=%E0%A4%A')).toEqual({ kind: 'invalid' });
  expect(parseHashRoute(`#random=${'a'.repeat(129)}`)).toEqual({ kind: 'invalid' });
  expect(parseHashRoute('#somewhere')).toEqual({ kind: 'invalid' });
});

test('formats generic and reproducible random routes', () => {
  expect(randomPuzzleHash()).toBe('#random');
  expect(randomPuzzleHash('fixed seed')).toBe('#random=fixed%20seed');
});

test('formats daily and shared routes and replaces existing hashes', () => {
  expect(dailyPuzzleHash()).toBe('#daily');
  expect(sharedPuzzleHash('abc_123')).toBe('#puzzle=abc_123');
  expect(hashRouteUrl('https://example.test/chessmatic?theme=club#old', '#daily'))
    .toBe('https://example.test/chessmatic?theme=club#daily');
  expect(sharedPuzzleUrl('https://example.test/chessmatic?theme=club#old', 'abc'))
    .toBe('https://example.test/chessmatic?theme=club#puzzle=abc');
});
