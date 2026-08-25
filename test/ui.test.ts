import { expect, test } from 'vitest';
import { resultShareText, verdictFor } from '../src/lib/ui';

test('verdicts distinguish club records, par, and over-par wins', () => {
  expect(verdictFor(3, 4, false)).toEqual(['1 under par.', 'You found a new club record.']);
  expect(verdictFor(4, 4, false)).toEqual(['Par. Perfect play.', 'That is the cheapest possible answer.']);
  expect(verdictFor(5, 4, false)).toEqual(['Bogey — one over.', 'A cheaper answer exists. Feel like finding it?']);
  expect(verdictFor(4, 5, true)).toEqual(['1 under par.', 'You beat the puzzle’s stated target.']);
});

test('share text retains the compact score format', () => {
  expect(resultShareText('№1 · Lone Rook', 5, 4)).toBe('♞ CHESSMATIC №1 🟩🟩🟩🟩🟨');
});
