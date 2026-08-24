(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessmaticPuzzleLink = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const FORMAT_VERSION = 1;
  const PIECE_TYPES = new Set(['P', 'N', 'B', 'R', 'Q']);

  function validatePuzzle(puzzle, data) {
    if (!puzzle || typeof puzzle !== 'object' || Array.isArray(puzzle)) {
      throw new Error('Puzzle data must be an object.');
    }
    const name = typeof puzzle.name === 'string' ? puzzle.name.trim() : '';
    const desc = typeof puzzle.desc === 'string' ? puzzle.desc.trim() : '';
    const par = Number(puzzle.par);
    if (!name || name.length > 80) throw new Error('Puzzle title must be 1–80 characters.');
    if (desc.length > 240) throw new Error('Puzzle description must be at most 240 characters.');
    if (!Number.isInteger(par) || par < 1 || par > 999) {
      throw new Error('Par must be a whole number from 1–999.');
    }
    if (!Array.isArray(puzzle.enemy) || puzzle.enemy.length < 1 || puzzle.enemy.length > 24) {
      throw new Error('A puzzle must contain 1–24 enemy pieces.');
    }

    const cols = data && data.board && data.board.cols;
    const rows = data && data.board && data.board.rows;
    const deploy = data && data.sides && data.sides.enemy && data.sides.enemy.deploy;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || !Array.isArray(deploy)) {
      throw new Error('Board configuration is unavailable.');
    }

    const occupied = new Set();
    const enemy = puzzle.enemy.map(piece => {
      if (!piece || !PIECE_TYPES.has(piece.type)) throw new Error('Puzzle contains an unknown piece.');
      const col = Number(piece.col);
      const row = Number(piece.row);
      if (!Number.isInteger(col) || !Number.isInteger(row)
          || col < deploy[0] || col > deploy[1] || col >= cols || row < 0 || row >= rows) {
        throw new Error('Every enemy piece must be inside its deployment zone.');
      }
      const square = col + ',' + row;
      if (occupied.has(square)) throw new Error('Two enemy pieces cannot share a square.');
      occupied.add(square);
      return { type: piece.type, col, row };
    });

    return { name, desc, par, enemy };
  }

  function bytesToBase64(bytes) {
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }

  function base64ToBytes(value) {
    if (typeof Buffer !== 'undefined') return Uint8Array.from(Buffer.from(value, 'base64'));
    const binary = atob(value);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
  }

  function encodePuzzle(puzzle, data) {
    const clean = validatePuzzle(puzzle, data);
    const payload = {
      v: FORMAT_VERSION,
      n: clean.name,
      d: clean.desc,
      p: clean.par,
      e: clean.enemy.map(piece => [piece.type, piece.col, piece.row]),
    };
    return bytesToBase64(new TextEncoder().encode(JSON.stringify(payload)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function decodePuzzle(encoded, data) {
    if (typeof encoded !== 'string' || !encoded || encoded.length > 4096
        || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
      throw new Error('The shared puzzle code is invalid.');
    }
    try {
      const padded = encoded.replace(/-/g, '+').replace(/_/g, '/')
        + '='.repeat((4 - encoded.length % 4) % 4);
      const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(base64ToBytes(padded)));
      if (!payload || payload.v !== FORMAT_VERSION || !Array.isArray(payload.e)) {
        throw new Error('Unsupported puzzle format.');
      }
      return validatePuzzle({
        name: payload.n,
        desc: payload.d,
        par: payload.p,
        enemy: payload.e.map(piece => ({ type: piece[0], col: piece[1], row: piece[2] })),
      }, data);
    } catch (error) {
      if (error && /^(Unsupported puzzle format|Puzzle |Par |A puzzle|Every enemy|Two enemy)/.test(error.message)) {
        throw error;
      }
      throw new Error('The shared puzzle code could not be read.');
    }
  }

  function puzzleFromHash(hash) {
    const value = typeof hash === 'string' ? hash.replace(/^#\??/, '') : '';
    return new URLSearchParams(value).get('puzzle');
  }

  function buildPuzzleUrl(locationLike, encoded) {
    const base = String(locationLike.href || locationLike).split('#')[0];
    return base + '#?puzzle=' + encoded;
  }

  return { validatePuzzle, encodePuzzle, decodePuzzle, puzzleFromHash, buildPuzzleUrl };
});
