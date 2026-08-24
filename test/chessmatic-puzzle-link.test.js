const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const link = require('../chessmatic-puzzle-link');

const projectRoot = path.resolve(__dirname, '..');
const data = JSON.parse(fs.readFileSync(path.join(projectRoot, 'chessmatic-puzzles.json'), 'utf8'));

test('shared puzzle codes round-trip unicode metadata and positions', () => {
  const puzzle = {
    name: 'Fork & File ♞',
    desc: 'Find the cheapest win.',
    par: 7,
    enemy: [
      { type: 'Q', col: 1, row: 2 },
      { type: 'P', col: 3, row: 0 },
    ],
  };

  const encoded = link.encodePuzzle(puzzle, data);
  assert.match(encoded, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(link.decodePuzzle(encoded, data), puzzle);
});

test('puzzle hash parsing accepts the requested #?puzzle form', () => {
  assert.equal(link.puzzleFromHash('#?puzzle=abc_123&else=no'), 'abc_123');
  assert.equal(link.puzzleFromHash('#puzzle=abc'), 'abc');
  assert.equal(link.puzzleFromHash('#something=else'), null);
});

test('puzzle URLs replace an existing hash', () => {
  assert.equal(
    link.buildPuzzleUrl({ href: 'https://example.test/chessmatic?theme=club#old' }, 'abc'),
    'https://example.test/chessmatic?theme=club#?puzzle=abc',
  );
});

test('shared puzzles reject malformed and out-of-zone positions', () => {
  assert.throws(() => link.decodePuzzle('not-json', data), /could not be read/);
  assert.throws(() => link.encodePuzzle({
    name: 'Invalid', desc: '', par: 2, enemy: [{ type: 'P', col: 5, row: 0 }],
  }, data), /deployment zone/);
  assert.throws(() => link.encodePuzzle({
    name: 'Overlap',
    desc: '',
    par: 2,
    enemy: [{ type: 'P', col: 0, row: 0 }, { type: 'R', col: 0, row: 0 }],
  }, data), /share a square/);
});
