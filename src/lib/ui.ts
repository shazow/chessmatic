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

export function toRoman(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 3999) return String(value);
  const numerals: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let remaining = value;
  let result = '';
  for (const [amount, numeral] of numerals) {
    while (remaining >= amount) {
      result += numeral;
      remaining -= amount;
    }
  }
  return result;
}

export function verdictFor(spend: number, benchmark: number, optimalCost?: number): [string, string] {
  if (optimalCost === undefined) {
    if (spend < benchmark) return [`${benchmark - spend} under target.`, 'You beat the puzzle’s stated target.'];
    if (spend === benchmark) return ['Target met.', 'You matched the puzzle’s stated target.'];
    return [`${spend - benchmark} over target.`, 'You won. Can you beat the stated target?'];
  }
  if (spend === optimalCost) {
    const relation = spend === benchmark ? 'par' : `${benchmark - spend} under par`;
    return [`Optimal — ${relation}.`, 'That is the cheapest possible answer.'];
  }
  if (spend < benchmark) {
    return [`${benchmark - spend} under par.`, `Strong play. The optimal score is ${optimalCost}.`];
  }
  if (spend === benchmark) {
    return ['Par.', `Club standard. The optimal score is ${optimalCost}.`];
  }
  const over = spend - benchmark;
  if (over === 1) return ['Bogey — one over.', 'A cheaper answer exists. Feel like finding it?'];
  if (over <= 3) return [`${over} over par.`, 'Won, but the club board would grumble. Trim the fat.'];
  return [`${over} over par.`, 'A win is a win. A cheaper win is a brag.'];
}

export function resultShareText(
  puzzleName: string,
  spend: number,
  benchmark: number,
  benchmarkLabel: 'par' | 'target',
): string {
  const over = Math.max(0, spend - benchmark);
  const blocks = benchmark <= 20
    ? '🟩'.repeat(benchmark) + (over <= 5 ? '🟨'.repeat(over) : `${'🟨'.repeat(5)}➕`)
    : `${benchmarkLabel} ${benchmark}${over ? ` +${over}` : ''}`;
  return `♞ CHESSMATIC ${puzzleName} ${blocks}`;
}
