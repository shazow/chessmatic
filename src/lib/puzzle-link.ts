import type { PieceType, PuzzleData, SharedPuzzle } from './types';

const FORMAT_VERSION = 1;
const PIECE_TYPES = new Set<PieceType>(['P', 'N', 'B', 'R', 'Q']);

export function validatePuzzle(puzzle: unknown, data: PuzzleData): SharedPuzzle {
  if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
    throw new Error('Puzzle data must be an object.');
  }
  const candidate = puzzle as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const desc = typeof candidate.desc === 'string' ? candidate.desc.trim() : '';
  const targetCost = Number(candidate.targetCost);
  if (!name || name.length > 80) throw new Error('Puzzle title must be 1–80 characters.');
  if (desc.length > 240) throw new Error('Puzzle description must be at most 240 characters.');
  if (!Number.isInteger(targetCost) || targetCost < 1 || targetCost > 999) {
    throw new Error('Target must be a whole number from 1–999.');
  }
  if (!Array.isArray(candidate.enemy) || candidate.enemy.length < 1 || candidate.enemy.length > 24) {
    throw new Error('A puzzle must contain 1–24 enemy pieces.');
  }

  const { cols, rows } = data.board;
  const deploy = data.sides.enemy.deploy;
  const occupied = new Set<string>();
  const enemy = candidate.enemy.map((rawPiece) => {
    if (!rawPiece || typeof rawPiece !== 'object' || Array.isArray(rawPiece)) {
      throw new Error('Puzzle contains an unknown piece.');
    }
    const piece = rawPiece as Record<string, unknown>;
    if (!PIECE_TYPES.has(piece.type as PieceType)) throw new Error('Puzzle contains an unknown piece.');
    const col = Number(piece.col);
    const row = Number(piece.row);
    if (!Number.isInteger(col) || !Number.isInteger(row)
        || col < deploy[0] || col > deploy[1] || col >= cols || row < 0 || row >= rows) {
      throw new Error('Every enemy piece must be inside its deployment zone.');
    }
    const square = `${col},${row}`;
    if (occupied.has(square)) throw new Error('Two enemy pieces cannot share a square.');
    occupied.add(square);
    return { type: piece.type as PieceType, col, row };
  });

  return { name, desc, targetCost, enemy };
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
    }, data);
  } catch (error) {
    if (error instanceof Error
        && /^(Unsupported puzzle format|Puzzle |Target |A puzzle|Every enemy|Two enemy)/.test(error.message)) {
      throw error;
    }
    throw new Error('The shared puzzle code could not be read.');
  }
}

export function puzzleFromHash(hash: string): string | null {
  return new URLSearchParams(hash.replace(/^#\??/, '')).get('puzzle');
}

export function buildPuzzleUrl(locationLike: Pick<Location, 'href'> | string, encoded: string): string {
  const base = String(typeof locationLike === 'string' ? locationLike : locationLike.href).split('#')[0];
  return `${base}#?puzzle=${encoded}`;
}
