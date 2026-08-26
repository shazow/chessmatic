import type {
  BattleMove,
  BattlePiece,
  Engine,
  LegalMove,
  PuzzleData,
  SetupPiece,
  Side,
  Simulation,
  SimulationStep,
} from './types';

export function createEngine(data: PuzzleData): Engine {
  const { cols, rows } = data.board;
  const cost = data.pieceCosts;
  const directions: Record<Side, number> = {
    player: data.sides.player.pawnDir,
    enemy: data.sides.enemy.pawnDir,
  };

  const at = (pieces: readonly BattlePiece[], col: number, row: number) => pieces.find(
    (piece) => piece.alive && piece.col === col && piece.row === row,
  );
  const inBounds = (col: number, row: number) => col >= 0 && col < cols && row >= 0 && row < rows;

  function slideMoves(
    piece: BattlePiece,
    pieces: readonly BattlePiece[],
    moveDirections: ReadonlyArray<readonly [number, number]>,
  ): LegalMove[] {
    const moves: LegalMove[] = [];
    for (const [dc, dr] of moveDirections) {
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

  function pawnMoves(piece: BattlePiece, pieces: readonly BattlePiece[]): LegalMove[] {
    const moves: LegalMove[] = [];
    const forwardCol = piece.col + directions[piece.side];
    if (inBounds(forwardCol, piece.row) && !at(pieces, forwardCol, piece.row)) {
      moves.push({ c: forwardCol, r: piece.row, cap: null });
    }
    for (const dr of [-1, 1]) {
      const row = piece.row + dr;
      if (!inBounds(forwardCol, row)) continue;
      const occupant = at(pieces, forwardCol, row);
      if (occupant && occupant.side !== piece.side) {
        moves.push({ c: forwardCol, r: row, cap: occupant });
      }
    }
    return moves;
  }

  function legalMoves(piece: BattlePiece, pieces: readonly BattlePiece[]): LegalMove[] {
    const moves: LegalMove[] = [];
    const push = (col: number, row: number) => {
      if (!inBounds(col, row)) return;
      const occupant = at(pieces, col, row);
      if (occupant?.side === piece.side) return;
      moves.push({ c: col, r: row, cap: occupant ?? null });
    };

    switch (piece.type) {
      case 'P':
        return pawnMoves(piece, pieces);
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
    }
  }

  function attacksSquare(
    piece: BattlePiece,
    col: number,
    row: number,
    occupied: (col: number, row: number) => boolean,
  ): boolean {
    const dc = col - piece.col;
    const dr = row - piece.row;
    switch (piece.type) {
      case 'P':
        return dc === directions[piece.side] && Math.abs(dr) === 1;
      case 'N':
        return (Math.abs(dc) === 1 && Math.abs(dr) === 2)
          || (Math.abs(dc) === 2 && Math.abs(dr) === 1);
      default:
        return sliderAttacks(piece, dc, dr, occupied);
    }
  }

  function sliderAttacks(
    piece: BattlePiece,
    dc: number,
    dr: number,
    occupied: (col: number, row: number) => boolean,
  ): boolean {
    const diagonal = Math.abs(dc) === Math.abs(dr) && dc !== 0;
    const orthogonal = (dc === 0) !== (dr === 0);
    const validDirection = piece.type === 'B'
      ? diagonal
      : piece.type === 'R' ? orthogonal : diagonal || orthogonal;
    if (!validDirection) return false;
    const stepCol = Math.sign(dc);
    const stepRow = Math.sign(dr);
    const distance = Math.max(Math.abs(dc), Math.abs(dr));
    for (let step = 1; step < distance; step += 1) {
      if (occupied(piece.col + stepCol * step, piece.row + stepRow * step)) return false;
    }
    return true;
  }

  function unsafeSquare(
    piece: BattlePiece,
    col: number,
    row: number,
    pieces: readonly BattlePiece[],
    ignoredPiece: BattlePiece | null,
  ): boolean {
    const occupied = (candidateCol: number, candidateRow: number) => pieces.some((other) => (
      other.alive
        && other !== piece
        && other !== ignoredPiece
        && other.col === candidateCol
        && other.row === candidateRow
    )) || (candidateCol === col && candidateRow === row);
    const considered = (other: BattlePiece) => other.alive && other !== piece && other !== ignoredPiece;

    const attackers = pieces.filter((enemy) => considered(enemy)
      && enemy.side !== piece.side
      && attacksSquare(enemy, col, row, occupied));
    if (!attackers.length) return false;
    if (attackers.some((enemy) => cost[enemy.type] <= cost[piece.type])) return true;
    // Only pricier attackers remain: the square is safe if any ally defends it.
    return !pieces.some((ally) => considered(ally)
      && ally.side === piece.side
      && attacksSquare(ally, col, row, occupied));
  }

  function nearestEnemyDistance(
    col: number,
    row: number,
    pieces: readonly BattlePiece[],
    side: Side,
  ): number {
    let best = Infinity;
    for (const enemy of pieces) {
      if (enemy.alive && enemy.side !== side) {
        best = Math.min(best, Math.abs(enemy.col - col) + Math.abs(enemy.row - row));
      }
    }
    return best;
  }

  function leastBadMove(piece: BattlePiece, pieces: readonly BattlePiece[], moves: LegalMove[]): LegalMove {
    const scored = moves.map((move) => ({
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

  function chooseAction(
    piece: BattlePiece,
    pieces: readonly BattlePiece[],
  ): { pinned: true } | { move: LegalMove } {
    const moves = legalMoves(piece, pieces);
    if (!moves.length) return { pinned: true };

    const captures = moves.filter((move) => move.cap).filter((move) => (
      cost[move.cap!.type] >= cost[piece.type]
        || !unsafeSquare(piece, move.c, move.r, pieces, move.cap)
    ));
    if (captures.length) {
      captures.sort((a, b) => (cost[b.cap!.type] - cost[a.cap!.type])
        || (a.c - b.c)
        || (a.r - b.r));
      return { move: captures[0] };
    }

    const currentDistance = nearestEnemyDistance(piece.col, piece.row, pieces, piece.side);
    let candidates = piece.type === 'N' || piece.type === 'P'
      ? moves
      : moves.filter((move) => Math.max(
        Math.abs(move.c - piece.col),
        Math.abs(move.r - piece.row),
      ) === 1);
    candidates = candidates.filter((move) => !unsafeSquare(piece, move.c, move.r, pieces, move.cap));
    if (!candidates.length) return { move: leastBadMove(piece, pieces, moves) };

    const scored = candidates.map((move) => ({
      move,
      distance: nearestEnemyDistance(move.c, move.r, pieces, piece.side),
      step: Math.abs(move.c - piece.col) + Math.abs(move.r - piece.row),
    }));
    scored.sort((a, b) => (a.distance - b.distance)
      || (a.step - b.step)
      || (a.move.c - b.move.c)
      || (a.move.r - b.move.r));
    if (scored[0].distance < currentDistance) return { move: scored[0].move };
    return { move: leastBadMove(piece, pieces, moves) };
  }

  function actPiece(piece: BattlePiece, pieces: readonly BattlePiece[]): BattleMove | null {
    const action = chooseAction(piece, pieces);
    if (!('move' in action)) return null;
    const chosen = action.move;
    const event: BattleMove = {
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

  function initiativeOrder(pieces: readonly BattlePiece[], side: Side): BattlePiece[] {
    const direction = directions[side];
    return [...pieces].sort((a, b) => (-direction * a.col) - (-direction * b.col)
      || a.row - b.row
      || a.type.localeCompare(b.type));
  }

  function turnOrder(pieces: readonly BattlePiece[]): BattlePiece[] {
    const player = initiativeOrder(pieces.filter((piece) => piece.side === 'player'), 'player');
    const enemy = initiativeOrder(pieces.filter((piece) => piece.side === 'enemy'), 'enemy');
    const order: BattlePiece[] = [];
    for (let index = 0; index < Math.max(player.length, enemy.length); index += 1) {
      if (enemy[index]) order.push(enemy[index]);
      if (player[index]) order.push(player[index]);
    }
    return order;
  }

  function prepareSide(setup: readonly SetupPiece[], side: Side, prefix: string): BattlePiece[] {
    const pieces: BattlePiece[] = setup.map((piece, index) => ({
      ...piece,
      side,
      alive: true,
      id: `${prefix}${index}`,
    }));
    return initiativeOrder(pieces, side).map((piece, index) => ({ ...piece, id: `${prefix}${index}` }));
  }

  function battleStatus(pieces: readonly BattlePiece[]): 'win' | 'loss' | null {
    const playerAlive = pieces.some((piece) => piece.alive && piece.side === 'player');
    const enemyAlive = pieces.some((piece) => piece.alive && piece.side === 'enemy');
    if (!enemyAlive) return 'win';
    if (!playerAlive) return 'loss';
    return null;
  }

  function simulate(
    placements: readonly SetupPiece[],
    enemySetup: readonly SetupPiece[],
    options: { roundLimit?: number } = {},
  ): Simulation {
    const roundLimit = options.roundLimit ?? 20;
    const pieces = [...prepareSide(placements, 'player', 'p'), ...prepareSide(enemySetup, 'enemy', 'e')];
    const initiativePieces = turnOrder(pieces);
    initiativePieces.forEach((piece, index) => { piece.order = index + 1; });
    const initialPieces = pieces.map((piece) => ({ ...piece }));
    const initiative = initiativePieces.map((piece) => piece.id);
    const events: SimulationStep[] = [];
    const initialResult = battleStatus(pieces);
    if (initialResult) return { result: initialResult, events, initialPieces };

    const positionKey = () => pieces
      .filter((piece) => piece.alive)
      .map((piece) => `${piece.id}@${piece.col},${piece.row}`)
      .join('|');
    const seenPositions = new Set([positionKey()]);

    for (let round = 0; round < roundLimit; round += 1) {
      const { status, actions } = playRound(round, initiative, pieces, events);
      if (status) return { result: status, events, initialPieces };
      if (!actions) return { result: 'loss', events, initialPieces, stalemate: true };
      const key = positionKey();
      if (seenPositions.has(key)) return { result: 'loss', events, initialPieces, repetition: true };
      seenPositions.add(key);
    }
    return { result: 'loss', events, initialPieces, timeout: true };
  }

  function playRound(
    round: number,
    initiative: readonly string[],
    pieces: readonly BattlePiece[],
    events: SimulationStep[],
  ): { status: 'win' | 'loss' | null; actions: number } {
    let actions = 0;
    for (const pieceId of initiative) {
      const piece = pieces.find((candidate) => candidate.id === pieceId);
      if (!piece?.alive) continue;
      if (recordAction(round, piece, pieces, events)) actions += 1;
      const status = battleStatus(pieces);
      if (status) return { status, actions };
    }
    return { status: null, actions };
  }

  function recordAction(
    round: number,
    piece: BattlePiece,
    pieces: readonly BattlePiece[],
    events: SimulationStep[],
  ): boolean {
    const event = actPiece(piece, pieces);
    if (event) {
      events.push({ round, side: piece.side, ev: event });
      return true;
    }
    events.push({
      round,
      side: piece.side,
      ev: null,
      pid: piece.id,
      ptype: piece.type,
      at: { c: piece.col, r: piece.row },
    });
    return false;
  }

  function threatSquares(piece: BattlePiece, pieces: readonly BattlePiece[]): Set<string> {
    const squares = new Set<string>();
    if (piece.type === 'P') {
      for (const dr of [-1, 1]) {
        const col = piece.col + directions[piece.side];
        const row = piece.row + dr;
        if (inBounds(col, row)) squares.add(`${col},${row}`);
      }
    } else {
      for (const move of legalMoves(piece, pieces)) squares.add(`${move.c},${move.r}`);
    }
    return squares;
  }

  return { at, inBounds, initiativeOrder, legalMoves, simulate, threatSquares, turnOrder };
}
