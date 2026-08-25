#!/usr/bin/env node

import fs from 'node:fs';
import { solvePar } from '../src/lib/solver';
import type { PuzzleData } from '../src/lib/types';

const pathArgument = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : './chessmatic-puzzles.json';
const check = process.argv.includes('--check');
const data = JSON.parse(fs.readFileSync(pathArgument, 'utf8')) as PuzzleData;

let mismatches = 0;
for (const puzzle of data.puzzles) {
  const { par, solution } = solvePar(data, puzzle.enemy);
  const same = puzzle.par === par;
  if (check) {
    console.log(`${puzzle.id} stored par ${puzzle.par ?? '—'} | solved par ${par} ${same ? 'OK' : '** MISMATCH **'}`);
    if (!same) mismatches += 1;
  } else {
    if (par === null || solution === null) throw new Error(`${puzzle.id} has no solution`);
    puzzle.par = par;
    puzzle.solution = solution;
    console.log(`${puzzle.id} par ${par} | ${JSON.stringify(solution)}`);
  }
}

if (check) process.exit(mismatches ? 1 : 0);
fs.writeFileSync(pathArgument, `${JSON.stringify(data, null, 2)}\n`);
console.log('wrote', pathArgument);
