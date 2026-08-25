import { createEngine } from './engine';
import type { PuzzleData, SetupPiece } from './types';

export interface ParSolution {
  par: number | null;
  solution: SetupPiece[] | null;
}

export function solvePar(
  data: PuzzleData,
  enemySetup: readonly SetupPiece[],
  maxPieces = 3,
): ParSolution {
  const engine = createEngine(data);
  const types = Object.keys(data.pieceCosts) as Array<keyof typeof data.pieceCosts>;
  const cells: Array<[number, number]> = [];
  const { rows } = data.board;
  const [deployMin, deployMax] = data.sides.player.deploy;

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
  return {
    par: best === Infinity ? null : best,
    solution: bestSolution,
  };
}
