import fs from 'node:fs';
import { expect, test } from 'vitest';
import { createEngine } from '../src/lib/engine';
import { dailyPuzzleSeed, generatePuzzle } from '../src/lib/random-puzzle';
import { findWinningSolutionAtCost } from '../src/lib/solver';
import type { PuzzleData } from '../src/lib/types';

const data = JSON.parse(fs.readFileSync('chessmatic-puzzles.json', 'utf8')) as PuzzleData;

test('generates the same verified puzzle for the same seed', () => {
  const first = generatePuzzle(data, 'repeatable-seed');
  const second = generatePuzzle(data, 'repeatable-seed');
  const spend = first.solution.reduce((total, piece) => total + data.pieceCosts[piece.type], 0);

  expect(second).toEqual(first);
  expect(spend).toBe(first.optimalCost);
  expect(first.par).toBe(first.optimalCost + 2);
  expect(createEngine(data).simulate(first.solution, first.enemy).result).toBe('win');
  expect(findWinningSolutionAtCost(data, first.enemy, first.par)).not.toBeNull();
});

test('different seeds produce different setups', () => {
  expect(generatePuzzle(data, 'seed-a').enemy).not.toEqual(generatePuzzle(data, 'seed-b').enemy);
});

test('daily seeds use the UTC calendar date', () => {
  expect(dailyPuzzleSeed(new Date('2026-08-25T23:59:59Z'))).toBe('2026-08-25');
  expect(dailyPuzzleSeed(new Date('2026-08-26T00:00:00Z'))).toBe('2026-08-26');
});
