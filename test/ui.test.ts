import { expect, test } from 'vitest';
import { battleTimeline, resultShareText, roundsUsed, toRoman, verdictFor } from '../src/lib/ui';
import type { Side, Simulation, SimulationStep } from '../src/lib/types';

function move(round: number, side: Side, captures = false): SimulationStep {
  return {
    round,
    side,
    ev: {
      pieceId: `${side[0]}0`,
      type: 'P',
      side,
      from: { c: 0, r: 0 },
      to: { c: 1, r: 0 },
      captured: captures ? { id: 'x0', type: 'P' } : null,
    },
  };
}

function winRun(events: SimulationStep[]): Simulation {
  return { result: 'win', events, initialPieces: [] };
}

test('formats selector positions as Roman numerals without a fixed list', () => {
  expect([1, 4, 5, 6, 9, 14, 40].map(toRoman)).toEqual(['I', 'IV', 'V', 'VI', 'IX', 'XIV', 'XL']);
});

test('official verdicts distinguish optimal, par, and over-par wins', () => {
  expect(verdictFor(4, 6, 4)).toEqual(['Optimal — 2 under par.', 'That is the cheapest possible answer.']);
  expect(verdictFor(5, 6, 4)).toEqual(['1 under par.', 'Strong play. The optimal score is 4.']);
  expect(verdictFor(6, 6, 4)).toEqual(['Par.', 'Club standard. The optimal score is 4.']);
  expect(verdictFor(7, 6, 4)).toEqual(['Bogey — one over.', 'A cheaper answer exists. Feel like finding it?']);
});

test('custom verdicts compare scores with the authored target', () => {
  expect(verdictFor(4, 5)).toEqual(['1 under target.', 'You beat the puzzle’s stated target.']);
  expect(verdictFor(5, 5)).toEqual(['Target met.', 'You matched the puzzle’s stated target.']);
  expect(verdictFor(6, 5)).toEqual(['1 over target.', 'You won. Can you beat the stated target?']);
});

test('rounds used counts through the final acted round', () => {
  expect(roundsUsed(winRun([]))).toBe(0);
  expect(roundsUsed(winRun([move(0, 'player'), move(0, 'enemy')]))).toBe(1);
  expect(roundsUsed(winRun([move(0, 'player'), move(1, 'enemy'), move(2, 'player', true)]))).toBe(3);
});

test('battle timeline marks each round by who captured', () => {
  const run = winRun([
    move(0, 'player'), move(0, 'enemy'),
    move(1, 'player', true), move(1, 'enemy'),
    move(2, 'player'), move(2, 'enemy', true),
    move(3, 'player', true), move(3, 'enemy', true),
  ]);
  expect(battleTimeline(run)).toBe('⬜🟩🟥🟧');
});

test('share text pairs the score header with the battle timeline', () => {
  const run = winRun([move(0, 'player'), move(1, 'player', true)]);
  expect(resultShareText('Lone Rook', 5, 4, run)).toBe('♞ Chessmatic · Lone Rook\n5/4 pts · 2 rounds\n⬜🟩');
  const quick = winRun([move(0, 'player', true)]);
  expect(resultShareText('Daily 2026-08-26', 4, 5, quick)).toBe('♞ Chessmatic · Daily 2026-08-26\n4/5 pts · 1 round\n🟩');
});
