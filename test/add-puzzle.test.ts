import fs from 'node:fs';
import { expect, test } from 'vitest';
import {
  buildOfficialPuzzle,
  insertPuzzle,
  parseArguments,
  puzzleCodeFromInput,
  puzzleIdFromName,
} from '../scripts/add-puzzle';
import { createEngine } from '../src/lib/engine';
import { encodePuzzle } from '../src/lib/puzzle-link';
import type { PuzzleData } from '../src/lib/types';

const data = JSON.parse(fs.readFileSync('chessmatic-puzzles.json', 'utf8')) as PuzzleData;
const importData = {
  ...data,
  puzzles: data.puzzles.filter((puzzle) => puzzle.id !== 'a-challenger-appears'),
};
const code = 'eyJ2IjoxLCJuIjoiQmVnaW5uZXIiLCJkIjoiRWFjaCBwaWVjZSBnZXRzIGEgdHVybiwgbW92ZW1lbnRzIGZvbGxvdyBhIHNpbXBsZSBydWxlc2V0IiwicCI6NCwiZSI6W1siUCIsMiwxXV19';
const url = `http://localhost:5173/#?puzzle=${code}`;

test('extracts puzzle codes from full URLs, hashes, and bare codes', () => {
  expect(puzzleCodeFromInput(url)).toBe(code);
  expect(puzzleCodeFromInput(`#?puzzle=${code}`)).toBe(code);
  expect(puzzleCodeFromInput(code)).toBe(code);
});

test('builds a solved official puzzle from a saved link', () => {
  const puzzle = buildOfficialPuzzle(url, importData);
  expect(puzzle).toMatchObject({
    id: 'beginner',
    name: 'Beginner',
    par: 4,
    optimalCost: 2,
    enemy: [{ type: 'P', col: 2, row: 1 }],
  });
  expect(createEngine(data).simulate(puzzle.solution, puzzle.enemy).result).toBe('win');
  expect(puzzle.solution.reduce((total, piece) => total + data.pieceCosts[piece.type], 0)).toBe(puzzle.optimalCost);
});

test('rejects an authored target below the verified optimum', () => {
  const impossibleCode = encodePuzzle({
    name: 'Impossible target',
    desc: '',
    targetCost: 1,
    enemy: [{ type: 'P', col: 2, row: 1 }],
  }, importData);
  expect(() => buildOfficialPuzzle(impossibleCode, importData)).toThrow(/below the optimal cost/);
});

test('normalizes IDs and rejects duplicate imports', () => {
  expect(puzzleIdFromName('  Café Fork!  ')).toBe('cafe-fork');
  const puzzle = buildOfficialPuzzle(url, importData);
  const withPuzzle = { ...importData, puzzles: [...importData.puzzles, puzzle] };
  expect(() => buildOfficialPuzzle(url, withPuzzle)).toThrow(/already exists/);
});

test('inserts puzzles at a zero-based index and shifts later entries', () => {
  const puzzle = buildOfficialPuzzle(url, importData);
  const puzzles = [...importData.puzzles];
  const shiftedId = puzzles[2].id;
  insertPuzzle(puzzles, puzzle, 2);
  expect(puzzles[2]).toBe(puzzle);
  expect(puzzles[3].id).toBe(shiftedId);

  expect(() => insertPuzzle([...importData.puzzles], puzzle, -1)).toThrow(/whole number from 0/);
  expect(() => insertPuzzle([...importData.puzzles], puzzle, importData.puzzles.length + 1)).toThrow(/whole number from 0/);
});

test('parses and validates the optional index flag', () => {
  expect(parseArguments([url, '--index', '0'])).toMatchObject({ input: url, index: 0 });
  expect(parseArguments(['--index', '3', url])).toMatchObject({ input: url, index: 3 });
  expect(() => parseArguments([url, '--index', '1.5'])).toThrow(/non-negative whole number/);
  expect(() => parseArguments([url, '--index', 'nope'])).toThrow(/non-negative whole number/);
});
