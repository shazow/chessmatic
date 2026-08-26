import type { PieceType, PuzzleData, SetupPiece, SharedPuzzle } from './types';

const FORMAT_VERSION = 1;
const PIECE_TYPES = new Set<PieceType>(['P', 'N', 'B', 'R', 'Q']);

const SIDE_ERRORS = {
  enemy: {
    count: 'A puzzle must contain 1–24 enemy pieces.',
    zone: 'Every enemy piece must be inside its deployment zone.',
    overlap: 'Two enemy pieces cannot share a square.',
  },
  solution: {
    count: 'A shared solution must contain 1–24 pieces.',
    zone: 'Every solution piece must be inside its deployment zone.',
    overlap: 'Two solution pieces cannot share a square.',
  },
} as const;

function validateText(value: unknown, label: string, maxLength: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (text.length > maxLength) throw new Error(`Puzzle ${label} must be at most ${maxLength} characters.`);
  return text;
}

function validateTargetCost(value: unknown): number {
  const targetCost = Number(value);
  if (!Number.isInteger(targetCost) || targetCost < 1 || targetCost > 999) {
    throw new Error('Target must be a whole number from 1–999.');
  }
  return targetCost;
}

export function validatePuzzle(puzzle: unknown, data: PuzzleData): SharedPuzzle {
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    throw new Error('Puzzle data must be an object.');
  }
  const candidate = puzzle as Record<string, unknown>;
  const name = validateText(candidate.name, 'title', 80);
  const desc = validateText(candidate.desc, 'description', 240);
  const targetCost = validateTargetCost(candidate.targetCost);
  const enemy = validatePieces(candidate.enemy, data, 'enemy');
  const solution = candidate.solution === undefined || (Array.isArray(candidate.solution) && candidate.solution.length === 0)
    ? undefined
    : validatePieces(candidate.solution, data, 'solution');

  return solution ? { name, desc, targetCost, enemy, solution } : { name, desc, targetCost, enemy };
}

function parsePieceType(rawPiece: unknown): PieceType {
  if (!rawPiece || typeof rawPiece !== 'object' || Array.isArray(rawPiece)) {
    throw new Error('Puzzle contains an unknown piece.');
  }
  const type = (rawPiece as Record<string, unknown>).type as PieceType;
  if (!PIECE_TYPES.has(type)) throw new Error('Puzzle contains an unknown piece.');
  return type;
}

function inDeployZone(
  col: number,
  row: number,
  deploy: readonly [number, number],
  cols: number,
  rows: number,
): boolean {
  return Number.isInteger(col) && Number.isInteger(row)
    && col >= deploy[0] && col <= deploy[1] && col < cols
    && row >= 0 && row < rows;
}

function validatePieces(pieces: unknown, data: PuzzleData, side: 'enemy' | 'solution'): SetupPiece[] {
  const errors = SIDE_ERRORS[side];
  if (!Array.isArray(pieces) || pieces.length < 1 || pieces.length > 24) {
    throw new Error(errors.count);
  }
  const { cols, rows } = data.board;
  const deploy = data.sides[side === 'enemy' ? 'enemy' : 'player'].deploy;
  const occupied = new Set<string>();
  return pieces.map((rawPiece) => {
    const type = parsePieceType(rawPiece);
    const piece = rawPiece as Record<string, unknown>;
    const col = Number(piece.col);
    const row = Number(piece.row);
    if (!inDeployZone(col, row, deploy, cols, rows)) throw new Error(errors.zone);
    const square = `${col},${row}`;
    if (occupied.has(square)) throw new Error(errors.overlap);
    occupied.add(square);
    return { type, col, row };
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function encodePuzzle(puzzle: unknown, data: PuzzleData): string {
  const clean = validatePuzzle(puzzle, data);
  const payload = {
    v: FORMAT_VERSION,
    n: clean.name,
    d: clean.desc,
    p: clean.targetCost,
    e: clean.enemy.map((piece) => [piece.type, piece.col, piece.row]),
    ...(clean.solution ? { s: clean.solution.map((piece) => [piece.type, piece.col, piece.row]) } : {}),
  };
  return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodePuzzle(encoded: string, data: PuzzleData): SharedPuzzle {
  if (!encoded || encoded.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw new Error('The shared puzzle code is invalid.');
  }
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
      + '='.repeat((4 - encoded.length % 4) % 4);
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(padded))) as {
      v?: unknown;
      n?: unknown;
      d?: unknown;
      p?: unknown;
      e?: unknown;
      s?: unknown;
    };
    if (payload.v !== FORMAT_VERSION || !Array.isArray(payload.e)) {
      throw new Error('Unsupported puzzle format.');
    }
    return validatePuzzle({
      name: payload.n,
      desc: payload.d,
      targetCost: payload.p,
      enemy: payload.e.map((piece) => {
        if (!Array.isArray(piece)) return piece;
        return { type: piece[0], col: piece[1], row: piece[2] };
      }),
      solution: Array.isArray(payload.s)
        ? payload.s.map((piece) => {
          if (!Array.isArray(piece)) return piece;
          return { type: piece[0], col: piece[1], row: piece[2] };
        })
        : undefined,
    }, data);
  } catch (error) {
    if (error instanceof Error
        && /^(Unsupported puzzle format|Puzzle |Target |A puzzle|A shared solution|Every enemy|Every solution|Two enemy|Two solution)/.test(error.message)) {
      throw error;
    }
    throw new Error('The shared puzzle code could not be read.');
  }
}
