#!/usr/bin/env node
// solve-puzzles.js — re-bake pars for chessmatic-puzzles.json
// Usage: node solve-puzzles.js [path/to/puzzles.json] [--check]
//   --check: verify stored pars instead of rewriting (exit 1 on mismatch)
// The solver and browser use the same engine, including canonical initiative.

const fs = require('fs');
const { createEngine } = require('./chessmatic-engine');
const path = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : './chessmatic-puzzles.json';
const CHECK = process.argv.includes('--check');
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const { rows: ROWS } = data.board;
const COST = data.pieceCosts;
const [DEP_MIN, DEP_MAX] = data.sides.player.deploy;
const engine = createEngine(data);

function solvePar(enemySetup, maxPieces = 3, forced = true) {
  const types = Object.keys(COST);
  const cells = [];
  for (let c = DEP_MIN; c <= DEP_MAX; c++) for (let r = 0; r < ROWS; r++) cells.push([c, r]);
  let best = Infinity, bestSol = null;
  (function rec(startCell, placements, cost) {
    if (cost >= best) return;
    if (placements.length && engine.simulate(placements, enemySetup, { forced }).result === 'win') {
      best = cost; bestSol = placements.map(p => ({ ...p }));
    }
    if (placements.length === maxPieces) return;
    for (let i = startCell; i < cells.length; i++) {
      const [c, r] = cells[i];
      for (const t of types) {
        if (cost + COST[t] >= best) continue;
        placements.push({ type: t, col: c, row: r });
        rec(i + 1, placements, cost + COST[t]);
        placements.pop();
      }
    }
  })(0, [], 0);
  return { par: best === Infinity ? null : best, solution: bestSol };
}

let mismatches = 0;
for (const pz of data.puzzles) {
  for (const [modeName, forced] of [['club', false], ['forced', true]]) {
    const { par, solution } = solvePar(pz.enemy, 3, forced);
    const stored = pz.modes[modeName];
    const same = stored && stored.par === par;
    if (CHECK) {
      console.log(`${pz.id} [${modeName}] stored par ${stored ? stored.par : '—'} | solved par ${par} ${same ? 'OK' : '** MISMATCH **'}`);
      if (!same) mismatches++;
    } else {
      pz.modes[modeName] = { par, solution };
      console.log(`${pz.id} [${modeName}] par ${par} | ${JSON.stringify(solution)}`);
    }
  }
}
if (CHECK) process.exit(mismatches ? 1 : 0);
fs.writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
console.log('wrote', path);
