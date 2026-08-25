#!/usr/bin/env node

import fs from 'node:fs';
import { createEngine } from '../src/lib/engine';
import type { PuzzleData, SetupPiece } from '../src/lib/types';

const pathArgument = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : './chessmatic-puzzles.json';
const check = process.argv.includes('--check');
const data = JSON.parse(fs.readFileSync(pathArgument, 'utf8')) as PuzzleData;
const engine = createEngine(data);
const { rows } = data.board;
const [deployMin, deployMax] = data.sides.player.deploy;

function solvePar(enemySetup: SetupPiece[], maxPieces = 3): { par: number | null; solution: SetupPiece[] | null } {
  const types = Object.keys(data.pieceCosts) as Array<keyof typeof data.pieceCosts>;
  const cells: Array<[number, number]> = [];
  for (let col = deployMin; col <= deployMax; col += 1) {
    for (let row = 0; row < rows; row += 1) cells.push([col, row]);
  }
  let best = Infinity;
  let bestSolution: SetupPiece[] | null = null;

  function search(startCell: number, placements: SetupPiece[], cost: number): void {
    if (cost >= best) return;
    if (placements.length && engine.simulate(placements, enemySetup).result === 'win') {
      best = cost;
      bestSolution = placements.map((piece) => ({ ...piece }));
    }
    if (placements.length === maxPieces) return;
    for (let index = startCell; index < cells.length; index += 1) {
      const [col, row] = cells[index];
      for (const type of types) {
        if (cost + data.pieceCosts[type] >= best) continue;
        placements.push({ type, col, row });
        search(index + 1, placements, cost + data.pieceCosts[type]);
        placements.pop();
      }
    }
  }

  search(0, [], 0);
  return { par: best === Infinity ? null : best, solution: bestSolution };
}

let mismatches = 0;
for (const puzzle of data.puzzles) {
  const { par, solution } = solvePar(puzzle.enemy);
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
