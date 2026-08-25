#!/usr/bin/env node

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseHashRoute } from '../src/lib/hash-router';
import { decodePuzzle } from '../src/lib/puzzle-link';
import { findWinningSolutionAtCost, solveOptimal } from '../src/lib/solver';
import type { Puzzle, PuzzleData, SetupPiece } from '../src/lib/types';

interface AddOptions {
  id?: string;
  index?: number;
  dataPath: string;
  input: string;
}

export function puzzleCodeFromInput(input: string): string {
  const value = input.trim();
  if (!value) throw new Error('Provide a saved puzzle URL or code.');

  if (value.startsWith('#')) {
    const route = parseHashRoute(value);
    if (route.kind !== 'shared') throw new Error('The puzzle URL does not contain a puzzle code.');
    return route.code;
  }

  try {
    const url = new URL(value);
    const route = parseHashRoute(url.hash);
    if (route.kind !== 'shared') throw new Error('The puzzle URL does not contain a puzzle code.');
    return route.code;
  } catch (error) {
    if (error instanceof TypeError) return value;
    throw error;
  }
}

export function puzzleIdFromName(name: string): string {
  const id = name.normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!id) throw new Error('The puzzle title cannot be converted to an ID; pass --id instead.');
  return id;
}

function setupKey(pieces: readonly SetupPiece[]): string {
  return pieces
    .map(({ type, col, row }) => `${col},${row},${type}`)
    .sort()
    .join('|');
}

export function buildOfficialPuzzle(input: string, data: PuzzleData, idOverride?: string): Puzzle {
  const shared = decodePuzzle(puzzleCodeFromInput(input), data);
  const id = idOverride ?? puzzleIdFromName(shared.name);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error('Puzzle IDs must contain lowercase letters, numbers, and single hyphens.');
  }
  if (data.puzzles.some((puzzle) => puzzle.id === id)) {
    throw new Error(`A puzzle with ID "${id}" already exists.`);
  }

  const duplicate = data.puzzles.find((puzzle) => setupKey(puzzle.enemy) === setupKey(shared.enemy));
  if (duplicate) throw new Error(`This enemy setup already exists as "${duplicate.id}".`);

  const solved = solveOptimal(data, shared.enemy);
  if (solved.optimalCost === null || solved.solution === null) {
    throw new Error('No solution using up to three pieces was found.');
  }
  if (shared.targetCost < solved.optimalCost) {
    throw new Error(`The saved target ${shared.targetCost} is below the optimal cost ${solved.optimalCost}.`);
  }
  if (!findWinningSolutionAtCost(data, shared.enemy, shared.targetCost)) {
    throw new Error(`The saved target ${shared.targetCost} is not an achievable winning score.`);
  }
  return {
    id,
    name: shared.name,
    desc: shared.desc,
    enemy: shared.enemy,
    par: shared.targetCost,
    optimalCost: solved.optimalCost,
    solution: solved.solution,
  };
}

export function insertPuzzle(puzzles: Puzzle[], puzzle: Puzzle, index = puzzles.length): void {
  if (!Number.isInteger(index) || index < 0 || index > puzzles.length) {
    throw new Error(`Puzzle index must be a whole number from 0 to ${puzzles.length}.`);
  }
  puzzles.splice(index, 0, puzzle);
}

export function parseArguments(args: string[]): AddOptions {
  let id: string | undefined;
  let insertionIndex: number | undefined;
  let dataPath = './chessmatic-puzzles.json';
  let input: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--id' || argument === '--data' || argument === '--index') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value.`);
      if (argument === '--id') id = value;
      else if (argument === '--data') dataPath = value;
      else {
        insertionIndex = Number(value);
        if (!Number.isInteger(insertionIndex) || insertionIndex < 0) {
          throw new Error('--index must be a non-negative whole number.');
        }
      }
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (input) {
      throw new Error('Provide only one saved puzzle URL or code.');
    } else {
      input = argument;
    }
  }

  if (!input) {
    throw new Error('Usage: npm run puzzles:add -- <url-or-code> [--index number] [--id puzzle-id] [--data path]');
  }
  return { id, index: insertionIndex, dataPath, input };
}

function main(): void {
  try {
    const options = parseArguments(process.argv.slice(2));
    const data = JSON.parse(fs.readFileSync(options.dataPath, 'utf8')) as PuzzleData;
    const puzzle = buildOfficialPuzzle(options.input, data, options.id);
    const insertionIndex = options.index ?? data.puzzles.length;
    insertPuzzle(data.puzzles, puzzle, insertionIndex);
    fs.writeFileSync(options.dataPath, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Added ${puzzle.id} at index ${insertionIndex}, par ${puzzle.par}, optimal ${puzzle.optimalCost}, to ${options.dataPath}`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'The puzzle could not be added.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
