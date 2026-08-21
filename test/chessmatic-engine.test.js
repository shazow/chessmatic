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

test('every stored solution wins at its displayed par', () => {
  for (const puzzle of data.puzzles) {
    for (const [mode, forced] of [['club', false], ['forced', true]]) {
      const { par, solution } = puzzle.modes[mode];
      const spend = solution.reduce((total, piece) => total + data.pieceCosts[piece.type], 0);
      assert.equal(spend, par, `${puzzle.id} ${mode} solution cost`);
      assert.equal(
        engine.simulate(solution, puzzle.enemy, { forced }).result,
        'win',
        `${puzzle.id} ${mode} solution result`,
      );
    }
  }
});

test('placement and puzzle-data order cannot change a battle', () => {
  for (const puzzle of data.puzzles) {
    for (const [mode, forced] of [['club', false], ['forced', true]]) {
      const solution = puzzle.modes[mode].solution;
      const expected = engine.simulate(solution, puzzle.enemy, { forced });
      for (const playerOrder of permutations(solution)) {
        for (const enemyOrder of permutations(puzzle.enemy)) {
          assert.deepEqual(
            engine.simulate(playerOrder, enemyOrder, { forced }),
            expected,
            `${puzzle.id} ${mode} changed with input order`,
          );
        }
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
