import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decodePuzzle, encodePuzzle } from '../src/lib/puzzle-link';
import type { PuzzleData } from '../src/lib/types';

const data = JSON.parse(fs.readFileSync('chessmatic-puzzles.json', 'utf8')) as PuzzleData;

test('shared puzzle codes round-trip unicode metadata and positions', () => {
  const puzzle = {
    name: 'Fork & File ♞',
    desc: 'Find the cheapest win.',
    targetCost: 7,
    enemy: [
      { type: 'Q', col: 1, row: 2 },
      { type: 'P', col: 3, row: 0 },
    ],
  } as const;

  const encoded = encodePuzzle(puzzle, data);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodePuzzle(encoded, data)).toEqual(puzzle);
});

test('shared puzzle codes round-trip an attached solution', () => {
  const puzzle = {
    name: 'Replay me',
    desc: 'Watch this win.',
    targetCost: 5,
    enemy: [{ type: 'P', col: 2, row: 1 }],
    solution: [
      { type: 'N', col: 5, row: 0 },
      { type: 'P', col: 7, row: 2 },
    ],
  } as const;

  const encoded = encodePuzzle(puzzle, data);
  expect(decodePuzzle(encoded, data)).toEqual(puzzle);
});

test('solution-free codes stay compatible in both directions', () => {
  const puzzle = {
    name: 'Plain',
    desc: '',
    targetCost: 3,
    enemy: [{ type: 'R', col: 1, row: 1 }],
  } as const;

  const decoded = decodePuzzle(encodePuzzle(puzzle, data), data);
  expect(decoded).toEqual(puzzle);
  expect(decoded.solution).toBeUndefined();
});

describe('invalid shared puzzles', () => {
  test('reject malformed and out-of-zone positions', () => {
    expect(() => decodePuzzle('not-json', data)).toThrow(/could not be read/);
    expect(() => encodePuzzle({
      name: 'Invalid', desc: '', targetCost: 2, enemy: [{ type: 'P', col: 5, row: 0 }],
    }, data)).toThrow(/deployment zone/);
    expect(() => encodePuzzle({
      name: 'Overlap',
      desc: '',
      targetCost: 2,
      enemy: [{ type: 'P', col: 0, row: 0 }, { type: 'R', col: 0, row: 0 }],
    }, data)).toThrow(/share a square/);
  });

  test('reject solutions outside the player deployment zone', () => {
    const base = { name: 'Sol', desc: '', targetCost: 2, enemy: [{ type: 'P', col: 0, row: 0 }] };
    expect(() => encodePuzzle({
      ...base, solution: [{ type: 'P', col: 0, row: 0 }],
    }, data)).toThrow(/solution piece must be inside/);
    expect(() => encodePuzzle({
      ...base, solution: [{ type: 'P', col: 4, row: 0 }, { type: 'N', col: 4, row: 0 }],
    }, data)).toThrow(/Two solution pieces/);
  });
});
