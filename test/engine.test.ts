import fs from 'node:fs';
import { describe, expect, test } from 'vitest';
import { createEngine } from '../src/lib/engine';
import { findWinningSolutionAtCost } from '../src/lib/solver';
import type { PuzzleData, SetupPiece } from '../src/lib/types';

const data = JSON.parse(fs.readFileSync('chessmatic-puzzles.json', 'utf8')) as PuzzleData;
const engine = createEngine(data);

function permutations<T>(items: T[]): T[][] {
  if (items.length < 2) return [items];
  return items.flatMap((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    return permutations(rest).map((permutation) => [item, ...permutation]);
  });
}

test('initiative runs front-to-back and breaks file ties by rank', () => {
  const player = [
    { id: 'p0', type: 'P', side: 'player', alive: true, col: 5, row: 2 },
    { id: 'p1', type: 'N', side: 'player', alive: true, col: 4, row: 2 },
    { id: 'p2', type: 'R', side: 'player', alive: true, col: 4, row: 0 },
  ] as const;
  const enemy = [
    { id: 'e0', type: 'P', side: 'enemy', alive: true, col: 1, row: 0 },
    { id: 'e1', type: 'N', side: 'enemy', alive: true, col: 3, row: 2 },
    { id: 'e2', type: 'R', side: 'enemy', alive: true, col: 3, row: 0 },
  ] as const;

  expect(engine.initiativeOrder(player, 'player').map((piece) => [piece.col, piece.row]))
    .toEqual([[4, 0], [4, 2], [5, 2]]);
  expect(engine.initiativeOrder(enemy, 'enemy').map((piece) => [piece.col, piece.row]))
    .toEqual([[3, 0], [3, 2], [1, 0]]);
});

test('turn order uses one count while alternating enemy and player pieces', () => {
  const pieces = [
    { id: 'p0', type: 'P', side: 'player', alive: true, col: 5, row: 2 },
    { id: 'p1', type: 'R', side: 'player', alive: true, col: 4, row: 0 },
    { id: 'e0', type: 'P', side: 'enemy', alive: true, col: 1, row: 0 },
    { id: 'e1', type: 'N', side: 'enemy', alive: true, col: 3, row: 2 },
    { id: 'e2', type: 'R', side: 'enemy', alive: true, col: 3, row: 0 },
  ] as const;

  expect(engine.turnOrder(pieces).map((piece) => piece.id)).toEqual(['e2', 'p1', 'e1', 'p0', 'e0']);
});

test('simulation exposes global turn numbers on its initial pieces', () => {
  const simulation = engine.simulate(
    [{ type: 'P', col: 4, row: 0 }, { type: 'P', col: 5, row: 0 }],
    [{ type: 'R', col: 3, row: 0 }, { type: 'P', col: 2, row: 0 }],
    { roundLimit: 1 },
  );

  expect(simulation.initialPieces
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((piece) => [piece.id, piece.order]))
    .toEqual([['e0', 1], ['p0', 2], ['e1', 3], ['p1', 4]]);
});

test('a piece takes its least-bad move when no legal move advances', () => {
  const simulation = engine.simulate(
    [{ type: 'P', col: 4, row: 0 }],
    [{ type: 'P', col: 3, row: 2 }],
    { roundLimit: 1 },
  );
  const playerEvent = simulation.events.find((event) => event.side === 'player' && event.ev);

  expect(playerEvent?.ev && playerEvent.ev.from).toEqual({ c: 4, r: 0 });
  expect(playerEvent?.ev && playerEvent.ev.to).toEqual({ c: 3, r: 0 });
});

describe('stored puzzles', () => {
  test('every optimal solution wins below or at par', () => {
    for (const puzzle of data.puzzles) {
      const spend = puzzle.solution.reduce((total, piece) => total + data.pieceCosts[piece.type], 0);
      expect(spend, `${puzzle.id} solution cost`).toBe(puzzle.optimalCost);
      expect(puzzle.optimalCost, `${puzzle.id} optimal versus par`).toBeLessThanOrEqual(puzzle.par);
      expect(engine.simulate(puzzle.solution, puzzle.enemy).result, `${puzzle.id} solution result`).toBe('win');
      expect(findWinningSolutionAtCost(data, puzzle.enemy, puzzle.par), `${puzzle.id} achievable par`).not.toBeNull();
    }
  });

  test('placement and puzzle-data order cannot change a battle', () => {
    for (const puzzle of data.puzzles) {
      const expected = engine.simulate(puzzle.solution, puzzle.enemy);
      for (const playerOrder of permutations<SetupPiece>(puzzle.solution)) {
        for (const enemyOrder of permutations<SetupPiece>(puzzle.enemy)) {
          expect(engine.simulate(playerOrder, enemyOrder), `${puzzle.id} changed with input order`)
            .toEqual(expected);
        }
      }
    }
  });
});

test('a battle stuck in a repeating cycle ends early as a loss', () => {
  const simulation = engine.simulate(
    [{ type: 'N', col: 5, row: 0 }],
    [{ type: 'P', col: 3, row: 1 }],
  );

  expect(simulation.result).toBe('loss');
  expect(simulation.repetition).toBe(true);
  expect(simulation.timeout).toBeUndefined();
  expect(simulation.events[simulation.events.length - 1].round).toBeLessThan(19);
});

test('pawn threat previews follow the configured direction', () => {
  const enemyPawn = { id: 'e0', type: 'P', side: 'enemy', alive: true, col: 2, row: 1 } as const;
  const playerPawn = { id: 'p0', type: 'P', side: 'player', alive: true, col: 5, row: 1 } as const;

  expect([...engine.threatSquares(enemyPawn, [enemyPawn])].sort()).toEqual(['3,0', '3,2']);
  expect([...engine.threatSquares(playerPawn, [playerPawn])].sort()).toEqual(['4,0', '4,2']);
});
