import { createEngine } from './engine';
import type { PuzzleData, SetupPiece } from './types';

export interface OptimalSolution {
  optimalCost: number | null;
  solution: SetupPiece[] | null;
}

function deploymentCells(data: PuzzleData): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  const [deployMin, deployMax] = data.sides.player.deploy;
  for (let col = deployMin; col <= deployMax; col += 1) {
    for (let row = 0; row < data.board.rows; row += 1) cells.push([col, row]);
  }
  return cells;
}

export function solveOptimal(
  data: PuzzleData,
  enemySetup: readonly SetupPiece[],
  maxPieces = 3,
): OptimalSolution {
  const engine = createEngine(data);
  const types = Object.keys(data.pieceCosts) as Array<keyof typeof data.pieceCosts>;
  const cells = deploymentCells(data);

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
  return {
    optimalCost: best === Infinity ? null : best,
    solution: bestSolution,
  };
}

export function findWinningSolutionAtCost(
  data: PuzzleData,
  enemySetup: readonly SetupPiece[],
  targetCost: number,
): SetupPiece[] | null {
  if (!Number.isInteger(targetCost) || targetCost < 1) return null;
  const engine = createEngine(data);
  const types = Object.keys(data.pieceCosts) as Array<keyof typeof data.pieceCosts>;
  const cells = deploymentCells(data);
  const minimumPieceCost = Math.min(...Object.values(data.pieceCosts));
  const maxPieces = Math.min(cells.length, Math.floor(targetCost / minimumPieceCost));
  let solution: SetupPiece[] | null = null;

  function search(startCell: number, placements: SetupPiece[], cost: number): void {
    if (solution || cost > targetCost) return;
    if (cost === targetCost) {
      if (engine.simulate(placements, enemySetup).result === 'win') {
        solution = placements.map((piece) => ({ ...piece }));
      }
      return;
    }
    if (placements.length === maxPieces) return;

    for (let index = startCell; index < cells.length; index += 1) {
      const [col, row] = cells[index];
      for (const type of types) {
        const nextCost = cost + data.pieceCosts[type];
        if (nextCost > targetCost) continue;
        placements.push({ type, col, row });
        search(index + 1, placements, nextCost);
        placements.pop();
        if (solution) return;
      }
    }
  }

  search(0, [], 0);
  return solution;
}
