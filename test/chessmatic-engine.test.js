const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { createEngine } = require('../chessmatic-engine');

const projectRoot = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(projectRoot, 'chessmatic-puzzles.json'), 'utf8'));
const engine = createEngine(data);

function permutations(items) {
  if (items.length < 2) return [items];
  return items.flatMap((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    return permutations(rest).map(permutation => [item, ...permutation]);
  });
}

test('initiative runs front-to-back and breaks file ties by rank', () => {
  const player = [
    { type: 'P', col: 5, row: 2 },
    { type: 'N', col: 4, row: 2 },
    { type: 'R', col: 4, row: 0 },
  ];
  const enemy = [
    { type: 'P', col: 1, row: 0 },
    { type: 'N', col: 3, row: 2 },
    { type: 'R', col: 3, row: 0 },
  ];

  assert.deepEqual(
    engine.initiativeOrder(player, 'player').map(piece => [piece.col, piece.row]),
    [[4, 0], [4, 2], [5, 2]],
  );
  assert.deepEqual(
    engine.initiativeOrder(enemy, 'enemy').map(piece => [piece.col, piece.row]),
    [[3, 0], [3, 2], [1, 0]],
  );
});

test('turn order uses one count while alternating enemy and player pieces', () => {
  const pieces = [
    { id: 'p0', type: 'P', side: 'player', col: 5, row: 2 },
    { id: 'p1', type: 'R', side: 'player', col: 4, row: 0 },
    { id: 'e0', type: 'P', side: 'enemy', col: 1, row: 0 },
    { id: 'e1', type: 'N', side: 'enemy', col: 3, row: 2 },
    { id: 'e2', type: 'R', side: 'enemy', col: 3, row: 0 },
  ];

  assert.deepEqual(
    engine.turnOrder(pieces).map(piece => piece.id),
    ['e2', 'p1', 'e1', 'p0', 'e0'],
  );
});

test('simulation exposes global turn numbers on its initial pieces', () => {
  const simulation = engine.simulate(
    [{ type: 'P', col: 4, row: 0 }, { type: 'P', col: 5, row: 0 }],
    [{ type: 'R', col: 3, row: 0 }, { type: 'P', col: 2, row: 0 }],
    { roundLimit: 1 },
  );

  assert.deepEqual(
    simulation.initialPieces
      .sort((a, b) => a.order - b.order)
      .map(piece => [piece.id, piece.order]),
    [['e0', 1], ['p0', 2], ['e1', 3], ['p1', 4]],
  );
});

test('a piece takes its least-bad move when no legal move advances', () => {
  const simulation = engine.simulate(
    [{ type: 'P', col: 4, row: 0 }],
    [{ type: 'P', col: 3, row: 2 }],
    { roundLimit: 1 },
  );
  const playerEvent = simulation.events.find(event => event.side === 'player');

  assert.ok(playerEvent && playerEvent.ev);
  assert.deepEqual(playerEvent.ev.from, { c: 4, r: 0 });
  assert.deepEqual(playerEvent.ev.to, { c: 3, r: 0 });
});

test('every stored solution wins at its displayed par', () => {
  for (const puzzle of data.puzzles) {
    const spend = puzzle.solution.reduce((total, piece) => total + data.pieceCosts[piece.type], 0);
    assert.equal(spend, puzzle.par, `${puzzle.id} solution cost`);
    assert.equal(
      engine.simulate(puzzle.solution, puzzle.enemy).result,
      'win',
      `${puzzle.id} solution result`,
    );
  }
});

test('placement and puzzle-data order cannot change a battle', () => {
  for (const puzzle of data.puzzles) {
    const expected = engine.simulate(puzzle.solution, puzzle.enemy);
    for (const playerOrder of permutations(puzzle.solution)) {
      for (const enemyOrder of permutations(puzzle.enemy)) {
        assert.deepEqual(
          engine.simulate(playerOrder, enemyOrder),
          expected,
          `${puzzle.id} changed with input order`,
        );
      }
    }
  }
});

test('pawn threat previews follow the configured direction', () => {
  const enemyPawn = { type: 'P', side: 'enemy', alive: true, col: 2, row: 1 };
  const playerPawn = { type: 'P', side: 'player', alive: true, col: 5, row: 1 };

  assert.deepEqual([...engine.threatSquares(enemyPawn, [enemyPawn])].sort(), ['3,0', '3,2']);
  assert.deepEqual([...engine.threatSquares(playerPawn, [playerPawn])].sort(), ['4,0', '4,2']);
});

test('embedded fallback puzzle data matches the external data file', () => {
  const html = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
  const match = html.match(/<script type="application\/json" id="puzzleData">([\s\S]*?)<\/script>/);
  assert.ok(match, 'embedded puzzle data exists');
  assert.deepEqual(JSON.parse(match[1]), data);
});
