import type { PieceType } from './types';

export const PIECE_TYPES: PieceType[] = ['P', 'N', 'B', 'R', 'Q'];
export const GLYPH: Record<PieceType, string> = {
  P: '♟',
  N: '♞',
  B: '♝',
  R: '♜',
  Q: '♛',
};
export const PIECE_NAME: Record<PieceType, string> = {
  P: 'pawn',
  N: 'knight',
  B: 'bishop',
  R: 'rook',
  Q: 'queen',
};

export const fileOf = (col: number): string => 'abcdefgh'[col] ?? '?';
export const squareName = (col: number, row: number): string => `${fileOf(col)}${row + 1}`;

export function verdictFor(spend: number, par: number, optimalCost?: number): [string, string] {
  if (optimalCost === undefined) {
    if (spend < par) return [`${par - spend} under target.`, 'You beat the puzzle’s stated target.'];
    if (spend === par) return ['Target met.', 'You matched the puzzle’s stated target.'];
    return [`${spend - par} over target.`, 'You won. Can you beat the stated target?'];
  }
  if (spend === optimalCost) {
    const relation = spend === par ? 'par' : `${par - spend} under par`;
    return [`Optimal — ${relation}.`, 'That is the cheapest possible answer.'];
  }
  if (spend < par) {
    return [`${par - spend} under par.`, `Strong play. The optimal score is ${optimalCost}.`];
  }
  if (spend === par) {
    return ['Par.', `Club standard. The optimal score is ${optimalCost}.`];
  }
  const over = spend - par;
  if (over === 1) return ['Bogey — one over.', 'A cheaper answer exists. Feel like finding it?'];
  if (over <= 3) return [`${over} over par.`, 'Won, but the club board would grumble. Trim the fat.'];
  return [`${over} over par.`, 'A win is a win. A cheaper win is a brag.'];
}

export function resultShareText(puzzleName: string, spend: number, par: number): string {
  const over = Math.max(0, spend - par);
  const blocks = par <= 20
    ? '🟩'.repeat(par) + (over <= 5 ? '🟨'.repeat(over) : `${'🟨'.repeat(5)}➕`)
    : `par ${par}${over ? ` +${over}` : ''}`;
  return `♞ CHESSMATIC ${puzzleName.split(' ·')[0]} ${blocks}`;
}
