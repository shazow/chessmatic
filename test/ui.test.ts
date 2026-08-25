import { expect, test } from 'vitest';
import { resultShareText, toRoman, verdictFor } from '../src/lib/ui';

test('formats selector positions as Roman numerals without a fixed list', () => {
  expect([1, 4, 5, 6, 9, 14, 40].map(toRoman)).toEqual(['I', 'IV', 'V', 'VI', 'IX', 'XIV', 'XL']);
});

test('official verdicts distinguish optimal, par, and over-par wins', () => {
  expect(verdictFor(4, 6, 4)).toEqual(['Optimal — 2 under par.', 'That is the cheapest possible answer.']);
  expect(verdictFor(5, 6, 4)).toEqual(['1 under par.', 'Strong play. The optimal score is 4.']);
  expect(verdictFor(6, 6, 4)).toEqual(['Par.', 'Club standard. The optimal score is 4.']);
  expect(verdictFor(7, 6, 4)).toEqual(['Bogey — one over.', 'A cheaper answer exists. Feel like finding it?']);
});

test('custom verdicts compare scores with the authored target', () => {
  expect(verdictFor(4, 5)).toEqual(['1 under target.', 'You beat the puzzle’s stated target.']);
  expect(verdictFor(5, 5)).toEqual(['Target met.', 'You matched the puzzle’s stated target.']);
  expect(verdictFor(6, 5)).toEqual(['1 over target.', 'You won. Can you beat the stated target?']);
});

test('share text retains the compact score format', () => {
  expect(resultShareText('Lone Rook', 5, 4, 'par')).toBe('♞ CHESSMATIC Lone Rook 🟩🟩🟩🟩🟨');
  expect(resultShareText('Long Game', 27, 25, 'target')).toBe('♞ CHESSMATIC Long Game target 25 +2');
});
