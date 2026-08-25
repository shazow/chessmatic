export type PieceType = 'P' | 'N' | 'B' | 'R' | 'Q';
export type Side = 'player' | 'enemy';
export type GameMode = 'place' | 'editor' | 'battle' | 'done';

export interface SetupPiece {
  type: PieceType;
  col: number;
  row: number;
}

export interface BattlePiece extends SetupPiece {
  id: string;
  side: Side;
  alive: boolean;
  order?: number;
}

export interface Puzzle {
  id: string;
  name: string;
  desc: string;
  enemy: SetupPiece[];
  par: number;
  optimalCost: number;
  solution: SetupPiece[];
}

export interface CustomPuzzle extends Omit<Puzzle, 'optimalCost' | 'solution'> {
  custom: true;
  shareCode: string;
  solution: [];
}

export interface SideConfig {
  pawnDir: number;
  deploy: [number, number];
}

export interface PuzzleData {
  version: number;
  board: { cols: number; rows: number };
  pieceCosts: Record<PieceType, number>;
  sides: Record<Side, SideConfig>;
  puzzles: Puzzle[];
}

export interface LegalMove {
  c: number;
  r: number;
  cap: BattlePiece | null;
}

export interface BattleMove {
  pieceId: string;
  type: PieceType;
  side: Side;
  from: { c: number; r: number };
  to: { c: number; r: number };
  captured: { id: string; type: PieceType } | null;
}

export type SimulationStep =
  | { round: number; side: Side; ev: BattleMove }
  | {
      round: number;
      side: Side;
      ev: null;
      pid: string;
      ptype: PieceType;
      at: { c: number; r: number };
    };

export interface Simulation {
  result: 'win' | 'loss';
  events: SimulationStep[];
  initialPieces: BattlePiece[];
  stalemate?: true;
  timeout?: true;
}

export interface Engine {
  at(pieces: readonly BattlePiece[], col: number, row: number): BattlePiece | undefined;
  inBounds(col: number, row: number): boolean;
  initiativeOrder(pieces: readonly BattlePiece[], side: Side): BattlePiece[];
  legalMoves(piece: BattlePiece, pieces: readonly BattlePiece[]): LegalMove[];
  simulate(placements: readonly SetupPiece[], enemySetup: readonly SetupPiece[], options?: { roundLimit?: number }): Simulation;
  threatSquares(piece: BattlePiece, pieces: readonly BattlePiece[]): Set<string>;
  turnOrder(pieces: readonly BattlePiece[]): BattlePiece[];
}

export interface SharedPuzzle {
  name: string;
  desc: string;
  targetCost: number;
  enemy: SetupPiece[];
}
