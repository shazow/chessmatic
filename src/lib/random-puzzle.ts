import { findWinningSolutionAtCost, solveOptimal } from './solver';
import type { PieceType, Puzzle, PuzzleData, SetupPiece } from './types';

const PIECE_POOL: PieceType[] = ['P', 'P', 'N', 'B', 'R', 'Q'];
const MAX_ATTEMPTS = 32;
const MAX_OPTIMAL_COST = 7;
// TODO: Add a versioned #random route before changing the seeded algorithm.

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function setupKey(pieces: readonly SetupPiece[]): string {
  return pieces
    .map(({ type, col, row }) => `${col},${row},${type}`)
    .sort()
    .join('|');
}

function candidateSetup(data: PuzzleData, random: () => number): SetupPiece[] {
  const cells: Array<[number, number]> = [];
  const [deployMin, deployMax] = data.sides.enemy.deploy;
  for (let col = deployMin; col <= deployMax; col += 1) {
    for (let row = 0; row < data.board.rows; row += 1) cells.push([col, row]);
  }
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [cells[index], cells[swapIndex]] = [cells[swapIndex], cells[index]];
  }

  const pieceCount = 1 + Math.floor(random() * 3);
  return cells.slice(0, pieceCount).map(([col, row]) => ({
    type: PIECE_POOL[Math.floor(random() * PIECE_POOL.length)],
    col,
    row,
  }));
}

export function generatePuzzle(data: PuzzleData, seed: string | number): Puzzle {
  const normalizedSeed = String(seed);
  if (!normalizedSeed) throw new Error('A puzzle seed is required.');
  const random = seededRandom(normalizedSeed);
  const officialSetups = new Set(data.puzzles.map((puzzle) => setupKey(puzzle.enemy)));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const enemy = candidateSetup(data, random);
    if (officialSetups.has(setupKey(enemy))) continue;
    const solved = solveOptimal(data, enemy);
    if (solved.optimalCost === null || solved.solution === null
        || solved.optimalCost > MAX_OPTIMAL_COST) continue;
    const par = solved.optimalCost + 2;
    if (!findWinningSolutionAtCost(data, enemy, par)) continue;

    return {
      id: `generated-${hashSeed(normalizedSeed).toString(36)}`,
      name: 'Generated Puzzle',
      desc: `Seed ${normalizedSeed}`,
      enemy,
      par,
      optimalCost: solved.optimalCost,
      solution: solved.solution,
    };
  }

  throw new Error(`Could not generate a solvable puzzle for seed "${normalizedSeed}".`);
}

export function dailyPuzzleSeed(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function randomPuzzleSeed(): string {
  const values = new Uint32Array(2);
  globalThis.crypto.getRandomValues(values);
  return `${values[0].toString(36)}-${values[1].toString(36)}`;
}
