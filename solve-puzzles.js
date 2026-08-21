#!/usr/bin/env node
// solve-puzzles.js — re-bake pars for chessmatic-puzzles.json
// Usage: node solve-puzzles.js [path/to/puzzles.json] [--check]
//   --check: verify stored pars instead of rewriting (exit 1 on mismatch)
// The engine below mirrors the game's engine exactly, but reads every
// orientation-dependent value (pawn directions, deploy zone, costs, board size)
// from the JSON, so puzzles for any side/orientation solve correctly.

const fs = require('fs');
const path = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : './chessmatic-puzzles.json';
const CHECK = process.argv.includes('--check');
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const { cols: COLS, rows: ROWS } = data.board;
const COST = data.pieceCosts;
const DIRS = { player: data.sides.player.pawnDir, enemy: data.sides.enemy.pawnDir };
const [DEP_MIN, DEP_MAX] = data.sides.player.deploy;
const ROUND_LIMIT = 20;
let FORCED = false;

const at = (ps, c, r) => ps.find(p => p.alive && p.col === c && p.row === r);
const inB = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;

function slideMoves(p, ps, dirs) {
  const out = [];
  for (const [dc, dr] of dirs) {
    let c = p.col + dc, r = p.row + dr;
    while (inB(c, r)) {
      const o = at(ps, c, r);
      if (o) { if (o.side !== p.side) out.push({ c, r, cap: o }); break; }
      out.push({ c, r, cap: null });
      c += dc; r += dr;
    }
  }
  return out;
}

function legalMoves(p, ps) {
  const out = [];
  const push = (c, r) => { if (!inB(c, r)) return; const o = at(ps, c, r); if (o && o.side === p.side) return; out.push({ c, r, cap: o || null }); };
  const dir = DIRS[p.side];
  switch (p.type) {
    case 'P': {
      if (inB(p.col + dir, p.row) && !at(ps, p.col + dir, p.row)) out.push({ c: p.col + dir, r: p.row, cap: null });
      for (const dr of [-1, 1]) {
        const c = p.col + dir, r = p.row + dr;
        if (!inB(c, r)) continue;
        const o = at(ps, c, r);
        if (o && o.side !== p.side) out.push({ c, r, cap: o });
      }
      return out;
    }
    case 'N': { for (const [dc, dr] of [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]]) push(p.col + dc, p.row + dr); return out; }
    case 'B': return slideMoves(p, ps, [[1,1],[1,-1],[-1,1],[-1,-1]]);
    case 'R': return slideMoves(p, ps, [[1,0],[-1,0],[0,1],[0,-1]]);
    case 'Q': return slideMoves(p, ps, [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]);
  }
  return out;
}

function attacksSq(e, c, r, occ) {
  const dc = c - e.col, dr = r - e.row;
  switch (e.type) {
    case 'P': return dc === DIRS[e.side] && Math.abs(dr) === 1;
    case 'N': return (Math.abs(dc) === 1 && Math.abs(dr) === 2) || (Math.abs(dc) === 2 && Math.abs(dr) === 1);
    default: {
      const diag = Math.abs(dc) === Math.abs(dr) && dc !== 0, ortho = (dc === 0) !== (dr === 0);
      const ok = e.type === 'B' ? diag : e.type === 'R' ? ortho : (diag || ortho);
      if (!ok) return false;
      const sc = Math.sign(dc), sr = Math.sign(dr), n = Math.max(Math.abs(dc), Math.abs(dr));
      for (let i = 1; i < n; i++) if (occ(e.col + sc * i, e.row + sr * i)) return false;
      return true;
    }
  }
}

function unsafeSquare(p, c, r, ps, ignore) {
  const occ = (cc, rr) => ps.some(q => q.alive && q !== p && q !== ignore && q.col === cc && q.row === rr) || (cc === c && rr === r);
  let expensive = false;
  for (const e of ps) {
    if (!e.alive || e === p || e === ignore || e.side === p.side) continue;
    if (!attacksSq(e, c, r, occ)) continue;
    if (COST[e.type] <= COST[p.type]) return true;
    expensive = true;
  }
  if (!expensive) return false;
  for (const q of ps) {
    if (!q.alive || q === p || q === ignore || q.side !== p.side) continue;
    if (attacksSq(q, c, r, occ)) return false;
  }
  return true;
}

const nearestEnemyDist = (c, r, ps, side) => {
  let b = Infinity;
  for (const e of ps) if (e.alive && e.side !== side) b = Math.min(b, Math.abs(e.col - c) + Math.abs(e.row - r));
  return b;
};

function forcedFallback(p, ps, moves) {
  const sc = moves.map(m => ({ m, unsafe: unsafeSquare(p, m.c, m.r, ps, m.cap) ? 1 : 0, d: nearestEnemyDist(m.c, m.r, ps, p.side), step: Math.abs(m.c - p.col) + Math.abs(m.r - p.row) }));
  sc.sort((a, b) => (a.unsafe - b.unsafe) || (a.d - b.d) || (a.step - b.step) || (a.m.c - b.m.c) || (a.m.r - b.m.r));
  return sc[0].m;
}

function chooseAction(p, ps) {
  const moves = legalMoves(p, ps);
  if (!moves.length) return { pinned: true };
  const caps = moves.filter(m => m.cap).filter(m => COST[m.cap.type] >= COST[p.type] || !unsafeSquare(p, m.c, m.r, ps, m.cap));
  if (caps.length) { caps.sort((a, b) => (COST[b.cap.type] - COST[a.cap.type]) || (a.c - b.c) || (a.r - b.r)); return { move: caps[0] }; }
  const cur = nearestEnemyDist(p.col, p.row, ps, p.side);
  let pool = (p.type === 'N' || p.type === 'P') ? moves : moves.filter(m => Math.max(Math.abs(m.c - p.col), Math.abs(m.r - p.row)) === 1);
  pool = pool.filter(m => !unsafeSquare(p, m.c, m.r, ps));
  if (!pool.length) return FORCED ? { move: forcedFallback(p, ps, moves) } : { pinned: true };
  const sc = pool.map(m => ({ m, d: nearestEnemyDist(m.c, m.r, ps, p.side), step: Math.abs(m.c - p.col) + Math.abs(m.r - p.row) }));
  sc.sort((a, b) => (a.d - b.d) || (a.step - b.step) || (a.m.c - b.m.c) || (a.m.r - b.m.r));
  if (sc[0].d < cur) return { move: sc[0].m };
  return FORCED ? { move: forcedFallback(p, ps, moves) } : { hold: true };
}

function actPiece(p, ps) {
  const a = chooseAction(p, ps);
  if (!a.move) return a;
  const ch = a.move;
  if (ch.cap) ch.cap.alive = false;
  p.col = ch.c; p.row = ch.r;
  return { pieceId: p.id };
}

function status(ps) {
  const pa = ps.some(p => p.alive && p.side === 'player'), ea = ps.some(p => p.alive && p.side === 'enemy');
  if (!ea) return 'win';
  if (!pa) return 'loss';
  return null;
}

function simulate(placements, enemySetup) {
  let id = 0;
  const pl = placements.map(x => ({ ...x, side: 'player', alive: true, id: 'p' + (id++) }));
  const en = enemySetup.map(x => ({ ...x, side: 'enemy', alive: true, id: 'e' + (id++) }));
  const ps = [...pl, ...en];
  const initiative = [];
  for (let i = 0; i < Math.max(pl.length, en.length); i++) {
    if (en[i]) initiative.push(en[i].id);   // the house moves first
    if (pl[i]) initiative.push(pl[i].id);
  }
  for (let round = 0; round < ROUND_LIMIT; round++) {
    let actions = 0;
    for (const pid of initiative) {
      const p = ps.find(q => q.id === pid);
      if (!p || !p.alive) continue;
      if (actPiece(p, ps).pieceId) actions++;
      const result = status(ps);
      if (result) return result;
    }
    if (!actions) return 'loss';
  }
  return 'loss';
}

function solvePar(enemySetup, maxPieces = 3) {
  const types = Object.keys(COST);
  const cells = [];
  for (let c = DEP_MIN; c <= DEP_MAX; c++) for (let r = 0; r < ROWS; r++) cells.push([c, r]);
  let best = Infinity, bestSol = null;
  (function rec(startCell, placements, cost) {
    if (cost >= best) return;
    if (placements.length && simulate(placements.map(p => ({ ...p })), enemySetup.map(p => ({ ...p }))) === 'win') {
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
    FORCED = forced;
    const { par, solution } = solvePar(pz.enemy);
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
