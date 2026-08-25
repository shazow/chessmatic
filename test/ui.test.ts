import { expect, test } from 'vitest';
import { resultShareText, verdictFor } from '../src/lib/ui';

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
  expect(resultShareText('№1 · Lone Rook', 5, 4)).toBe('♞ CHESSMATIC №1 🟩🟩🟩🟩🟨');
});
