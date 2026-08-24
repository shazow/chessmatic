import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  buildPuzzleUrl,
  decodePuzzle,
  encodePuzzle,
  puzzleFromHash,
} from '../src/lib/puzzle-link';
import type { PuzzleData } from '../src/lib/types';

const data = JSON.parse(fs.readFileSync('chessmatic-puzzles.json', 'utf8')) as PuzzleData;

test('shared puzzle codes round-trip unicode metadata and positions', () => {
  const puzzle = {
    name: 'Fork & File ♞',
    desc: 'Find the cheapest win.',
    par: 7,
    enemy: [
      { type: 'Q', col: 1, row: 2 },
      { type: 'P', col: 3, row: 0 },
    ],
  } as const;

  const encoded = encodePuzzle(puzzle, data);
  expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(decodePuzzle(encoded, data)).toEqual(puzzle);
});

test('puzzle hash parsing accepts the existing #?puzzle form', () => {
  expect(puzzleFromHash('#?puzzle=abc_123&else=no')).toBe('abc_123');
  expect(puzzleFromHash('#puzzle=abc')).toBe('abc');
  expect(puzzleFromHash('#something=else')).toBeNull();
});

test('puzzle URLs replace an existing hash', () => {
  expect(buildPuzzleUrl('https://example.test/chessmatic?theme=club#old', 'abc'))
    .toBe('https://example.test/chessmatic?theme=club#?puzzle=abc');
});

describe('invalid shared puzzles', () => {
  test('reject malformed and out-of-zone positions', () => {
    expect(() => decodePuzzle('not-json', data)).toThrow(/could not be read/);
    expect(() => encodePuzzle({
      name: 'Invalid', desc: '', par: 2, enemy: [{ type: 'P', col: 5, row: 0 }],
    }, data)).toThrow(/deployment zone/);
    expect(() => encodePuzzle({
      name: 'Overlap',
      desc: '',
      par: 2,
      enemy: [{ type: 'P', col: 0, row: 0 }, { type: 'R', col: 0, row: 0 }],
    }, data)).toThrow(/share a square/);
  });
});
