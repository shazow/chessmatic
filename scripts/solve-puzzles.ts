#!/usr/bin/env node

import fs from 'node:fs';
import { findWinningSolutionAtCost, solveOptimal } from '../src/lib/solver';
import type { PuzzleData } from '../src/lib/types';

const pathArgument = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : './chessmatic-puzzles.json';
const check = process.argv.includes('--check');
const data = JSON.parse(fs.readFileSync(pathArgument, 'utf8')) as PuzzleData;

let mismatches = 0;
for (const puzzle of data.puzzles) {
  const { optimalCost, solution } = solveOptimal(data, puzzle.enemy);
  const optimalMatches = puzzle.optimalCost === optimalCost;
  if (check) {
    const parAchievable = findWinningSolutionAtCost(data, puzzle.enemy, puzzle.par) !== null;
    const valid = optimalMatches && parAchievable;
    console.log(`${puzzle.id} stored optimal ${puzzle.optimalCost ?? '—'} | solved optimal ${optimalCost} | par ${puzzle.par} ${parAchievable ? 'achievable' : 'unreachable'} ${valid ? 'OK' : '** MISMATCH **'}`);
    if (!valid) mismatches += 1;
  } else {
    if (optimalCost === null || solution === null) throw new Error(`${puzzle.id} has no solution`);
    puzzle.optimalCost = optimalCost;
    puzzle.solution = solution;
    console.log(`${puzzle.id} optimal ${optimalCost} | ${JSON.stringify(solution)}`);
  }
}

if (check) process.exit(mismatches ? 1 : 0);
fs.writeFileSync(pathArgument, `${JSON.stringify(data, null, 2)}\n`);
console.log('wrote', pathArgument);
