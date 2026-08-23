(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessmaticEngine = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  function createEngine(data) {
    const { cols: COLS, rows: ROWS } = data.board;
    const COST = data.pieceCosts;
    const DIRS = {
      player: data.sides.player.pawnDir,
      enemy: data.sides.enemy.pawnDir,
    };

    const at = (pieces, col, row) => pieces.find(
      piece => piece.alive && piece.col === col && piece.row === row,
    );
    const inBounds = (col, row) => col >= 0 && col < COLS && row >= 0 && row < ROWS;

    function slideMoves(piece, pieces, directions) {
      const moves = [];
      for (const [dc, dr] of directions) {
        let col = piece.col + dc;
        let row = piece.row + dr;
        while (inBounds(col, row)) {
          const occupant = at(pieces, col, row);
          if (occupant) {
            if (occupant.side !== piece.side) moves.push({ c: col, r: row, cap: occupant });
            break;
          }
          moves.push({ c: col, r: row, cap: null });
          col += dc;
          row += dr;
        }
      }
      return moves;
    }

    function legalMoves(piece, pieces) {
      const moves = [];
      const push = (col, row) => {
        if (!inBounds(col, row)) return;
        const occupant = at(pieces, col, row);
        if (occupant && occupant.side === piece.side) return;
        moves.push({ c: col, r: row, cap: occupant || null });
      };
      const direction = DIRS[piece.side];

      switch (piece.type) {
        case 'P': {
          if (inBounds(piece.col + direction, piece.row)
              && !at(pieces, piece.col + direction, piece.row)) {
            moves.push({ c: piece.col + direction, r: piece.row, cap: null });
          }
          for (const dr of [-1, 1]) {
            const col = piece.col + direction;
            const row = piece.row + dr;
            if (!inBounds(col, row)) continue;
            const occupant = at(pieces, col, row);
            if (occupant && occupant.side !== piece.side) {
              moves.push({ c: col, r: row, cap: occupant });
            }
          }
          return moves;
        }
        case 'N':
          for (const [dc, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
            push(piece.col + dc, piece.row + dr);
          }
          return moves;
        case 'B':
          return slideMoves(piece, pieces, [[1, 1], [1, -1], [-1, 1], [-1, -1]]);
        case 'R':
          return slideMoves(piece, pieces, [[1, 0], [-1, 0], [0, 1], [0, -1]]);
        case 'Q':
          return slideMoves(piece, pieces, [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]);
        default:
          return moves;
      }
    }

    function attacksSquare(piece, col, row, occupied) {
      const dc = col - piece.col;
      const dr = row - piece.row;
      switch (piece.type) {
        case 'P':
          return dc === DIRS[piece.side] && Math.abs(dr) === 1;
        case 'N':
          return (Math.abs(dc) === 1 && Math.abs(dr) === 2)
            || (Math.abs(dc) === 2 && Math.abs(dr) === 1);
        default: {
          const diagonal = Math.abs(dc) === Math.abs(dr) && dc !== 0;
          const orthogonal = (dc === 0) !== (dr === 0);
          const validDirection = piece.type === 'B'
            ? diagonal
            : piece.type === 'R' ? orthogonal : diagonal || orthogonal;
          if (!validDirection) return false;
          const stepCol = Math.sign(dc);
          const stepRow = Math.sign(dr);
          const distance = Math.max(Math.abs(dc), Math.abs(dr));
          for (let step = 1; step < distance; step++) {
            if (occupied(piece.col + stepCol * step, piece.row + stepRow * step)) return false;
          }
          return true;
        }
      }
    }

    function unsafeSquare(piece, col, row, pieces, ignoredPiece) {
      const occupied = (candidateCol, candidateRow) => pieces.some(other => (
        other.alive
          && other !== piece
          && other !== ignoredPiece
          && other.col === candidateCol
          && other.row === candidateRow
      )) || (candidateCol === col && candidateRow === row);
      let attackedByExpensivePiece = false;

      for (const enemy of pieces) {
        if (!enemy.alive || enemy === piece || enemy === ignoredPiece || enemy.side === piece.side) continue;
        if (!attacksSquare(enemy, col, row, occupied)) continue;
        if (COST[enemy.type] <= COST[piece.type]) return true;
        attackedByExpensivePiece = true;
      }
      if (!attackedByExpensivePiece) return false;

      for (const ally of pieces) {
        if (!ally.alive || ally === piece || ally === ignoredPiece || ally.side !== piece.side) continue;
        if (attacksSquare(ally, col, row, occupied)) return false;
      }
      return true;
    }

    function nearestEnemyDistance(col, row, pieces, side) {
      let best = Infinity;
      for (const enemy of pieces) {
        if (enemy.alive && enemy.side !== side) {
          best = Math.min(best, Math.abs(enemy.col - col) + Math.abs(enemy.row - row));
        }
      }
      return best;
    }

    function forcedFallback(piece, pieces, moves) {
      const scored = moves.map(move => ({
        move,
        unsafe: unsafeSquare(piece, move.c, move.r, pieces, move.cap) ? 1 : 0,
        distance: nearestEnemyDistance(move.c, move.r, pieces, piece.side),
        step: Math.abs(move.c - piece.col) + Math.abs(move.r - piece.row),
      }));
      scored.sort((a, b) => (a.unsafe - b.unsafe)
        || (a.distance - b.distance)
        || (a.step - b.step)
        || (a.move.c - b.move.c)
        || (a.move.r - b.move.r));
      return scored[0].move;
    }

    function chooseAction(piece, pieces, forced) {
      const moves = legalMoves(piece, pieces);
      if (!moves.length) return { pinned: true };

      const captures = moves.filter(move => move.cap).filter(move => (
        COST[move.cap.type] >= COST[piece.type]
          || !unsafeSquare(piece, move.c, move.r, pieces, move.cap)
      ));
      if (captures.length) {
        captures.sort((a, b) => (COST[b.cap.type] - COST[a.cap.type])
          || (a.c - b.c)
          || (a.r - b.r));
        return { move: captures[0] };
      }

      const currentDistance = nearestEnemyDistance(piece.col, piece.row, pieces, piece.side);
      let candidates = piece.type === 'N' || piece.type === 'P'
        ? moves
        : moves.filter(move => Math.max(
          Math.abs(move.c - piece.col),
          Math.abs(move.r - piece.row),
        ) === 1);
      candidates = candidates.filter(move => !unsafeSquare(piece, move.c, move.r, pieces));
      if (!candidates.length) {
        return forced ? { move: forcedFallback(piece, pieces, moves) } : { pinned: true };
      }

      const scored = candidates.map(move => ({
        move,
        distance: nearestEnemyDistance(move.c, move.r, pieces, piece.side),
        step: Math.abs(move.c - piece.col) + Math.abs(move.r - piece.row),
      }));
      scored.sort((a, b) => (a.distance - b.distance)
        || (a.step - b.step)
        || (a.move.c - b.move.c)
        || (a.move.r - b.move.r));
      if (scored[0].distance < currentDistance) return { move: scored[0].move };
      return forced ? { move: forcedFallback(piece, pieces, moves) } : { hold: true };
    }

    function actPiece(piece, pieces, forced) {
      const action = chooseAction(piece, pieces, forced);
      if (!action.move) return action;
      const chosen = action.move;
      const event = {
        pieceId: piece.id,
        type: piece.type,
        side: piece.side,
        from: { c: piece.col, r: piece.row },
        to: { c: chosen.c, r: chosen.r },
        captured: chosen.cap ? { id: chosen.cap.id, type: chosen.cap.type } : null,
      };
      if (chosen.cap) chosen.cap.alive = false;
      piece.col = chosen.c;
      piece.row = chosen.r;
      return event;
    }

    function initiativeOrder(pieces, side) {
      const direction = DIRS[side];
      return [...pieces].sort((a, b) => (-direction * a.col) - (-direction * b.col)
        || a.row - b.row
        || a.type.localeCompare(b.type));
    }

    function turnOrder(pieces) {
      const player = initiativeOrder(pieces.filter(piece => piece.side === 'player'), 'player');
      const enemy = initiativeOrder(pieces.filter(piece => piece.side === 'enemy'), 'enemy');
      const order = [];
      for (let index = 0; index < Math.max(player.length, enemy.length); index++) {
        if (enemy[index]) order.push(enemy[index]);
        if (player[index]) order.push(player[index]);
      }
      return order;
    }

    function prepareSide(setup, side, prefix) {
      const pieces = setup.map(piece => ({ ...piece, side, alive: true }));
      return initiativeOrder(pieces, side).map((piece, index) => ({
        ...piece,
        id: prefix + index,
      }));
    }

    function battleStatus(pieces) {
      const playerAlive = pieces.some(piece => piece.alive && piece.side === 'player');
      const enemyAlive = pieces.some(piece => piece.alive && piece.side === 'enemy');
      if (!enemyAlive) return 'win';
      if (!playerAlive) return 'loss';
      return null;
    }

    function simulate(placements, enemySetup, options = {}) {
      const forced = options.forced === undefined ? true : options.forced;
      const roundLimit = options.roundLimit || 20;
      const player = prepareSide(placements, 'player', 'p');
      const enemy = prepareSide(enemySetup, 'enemy', 'e');
      const pieces = [...player, ...enemy];
      const initiativePieces = turnOrder(pieces);
      initiativePieces.forEach((piece, index) => { piece.order = index + 1; });
      const initialPieces = pieces.map(piece => ({ ...piece }));
      const initiative = initiativePieces.map(piece => piece.id);
      const events = [];
      const initialResult = battleStatus(pieces);
      if (initialResult) return { result: initialResult, events, initialPieces };

      for (let round = 0; round < roundLimit; round++) {
        let actions = 0;
        for (const pieceId of initiative) {
          const piece = pieces.find(candidate => candidate.id === pieceId);
          if (!piece || !piece.alive) continue;
          const result = actPiece(piece, pieces, forced);
          if (result.pieceId) {
            actions++;
            events.push({ round, side: piece.side, ev: result });
          } else {
            events.push({
              round,
              side: piece.side,
              ev: null,
              pinned: !!result.pinned,
              pid: piece.id,
              ptype: piece.type,
              at: { c: piece.col, r: piece.row },
            });
          }
          const status = battleStatus(pieces);
          if (status) return { result: status, events, initialPieces };
        }
        if (!actions) return { result: 'loss', events, initialPieces, stalemate: true };
      }
      return { result: 'loss', events, initialPieces, timeout: true };
    }

    function threatSquares(piece, pieces) {
      const squares = new Set();
      if (piece.type === 'P') {
        for (const dr of [-1, 1]) {
          const col = piece.col + DIRS[piece.side];
          const row = piece.row + dr;
          if (inBounds(col, row)) squares.add(`${col},${row}`);
        }
      } else {
        for (const move of legalMoves(piece, pieces)) squares.add(`${move.c},${move.r}`);
      }
      return squares;
    }

    return {
      at,
      inBounds,
      initiativeOrder,
      legalMoves,
      simulate,
      threatSquares,
      turnOrder,
    };
  }

  return { createEngine };
});
