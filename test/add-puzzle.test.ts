import fs from 'node:fs';
import { expect, test } from 'vitest';
import { buildOfficialPuzzle, puzzleCodeFromInput, puzzleIdFromName } from '../scripts/add-puzzle';
import { createEngine } from '../src/lib/engine';
import type { PuzzleData } from '../src/lib/types';

const data = JSON.parse(fs.readFileSync('chessmatic-puzzles.json', 'utf8')) as PuzzleData;
const code = 'eyJ2IjoxLCJuIjoiQmVnaW5uZXIiLCJkIjoiRWFjaCBwaWVjZSBnZXRzIGEgdHVybiwgbW92ZW1lbnRzIGZvbGxvdyBhIHNpbXBsZSBydWxlc2V0IiwicCI6NCwiZSI6W1siUCIsMiwxXV19';
const url = `http://localhost:5173/#?puzzle=${code}`;

test('extracts puzzle codes from full URLs, hashes, and bare codes', () => {
  expect(puzzleCodeFromInput(url)).toBe(code);
  expect(puzzleCodeFromInput(`#?puzzle=${code}`)).toBe(code);
  expect(puzzleCodeFromInput(code)).toBe(code);
});

test('builds a solved official puzzle from a saved link', () => {
  const puzzle = buildOfficialPuzzle(url, data);
  expect(puzzle).toMatchObject({
    id: 'beginner',
    name: 'Beginner',
    par: 2,
    enemy: [{ type: 'P', col: 2, row: 1 }],
  });
  expect(createEngine(data).simulate(puzzle.solution, puzzle.enemy).result).toBe('win');
  expect(puzzle.solution.reduce((total, piece) => total + data.pieceCosts[piece.type], 0)).toBe(puzzle.par);
});

test('normalizes IDs and rejects duplicate imports', () => {
  expect(puzzleIdFromName('  Café Fork!  ')).toBe('cafe-fork');
  const puzzle = buildOfficialPuzzle(url, data);
  const withPuzzle = { ...data, puzzles: [...data.puzzles, puzzle] };
  expect(() => buildOfficialPuzzle(url, withPuzzle)).toThrow(/already exists/);
});
