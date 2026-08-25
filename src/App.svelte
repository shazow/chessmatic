<script lang="ts">
  import { onMount, tick } from 'svelte';
  import rawData from '../chessmatic-puzzles.json';
  import Board, { type DragSource } from './lib/components/Board.svelte';
  import PieceTray from './lib/components/PieceTray.svelte';
  import { createEngine } from './lib/engine';
  import {
    dailyPuzzleHash,
    hashRouteUrl,
    parseHashRoute,
    randomPuzzleHash,
    sharedPuzzleHash,
    sharedPuzzleUrl,
  } from './lib/hash-router';
  import { decodePuzzle, encodePuzzle } from './lib/puzzle-link';
  import { dailyPuzzleSeed, generatePuzzle, randomPuzzleSeed } from './lib/random-puzzle';
  import type {
    BattleMove,
    BattlePiece,
    GameMode,
    PieceType,
    Puzzle,
    PuzzleData,
    SharedPuzzle,
    SetupPiece,
    Side,
    Simulation,
  } from './lib/types';
  import {
    GLYPH,
    PIECE_NAME,
    fileOf,
    resultShareText,
    squareName,
    toRoman,
    verdictFor,
  } from './lib/ui';

  interface OfficialAppPuzzle extends Puzzle {
    kind: 'official';
  }

  interface GeneratedAppPuzzle extends Puzzle {
    kind: 'random' | 'daily';
    seed: string;
  }

  interface SharedAppPuzzle extends SharedPuzzle {
    kind: 'shared';
    id: 'shared-puzzle';
    shareCode: string;
    solution: SetupPiece[];
  }

  type AppPuzzle = OfficialAppPuzzle | GeneratedAppPuzzle | SharedAppPuzzle;

  interface ResultView {
    win: boolean;
    title: string;
    verdict: string;
    spend: number;
    benchmark: number;
    benchmarkLabel: 'par' | 'target';
    scoreVerdict: string;
    canShare: boolean;
    canNext: boolean;
  }

  type LogEntry =
    | { kind: 'note'; html: string }
    | { kind: 'round'; round: number }
    | { kind: 'pin'; side: Side; text: string }
    | { kind: 'move'; step: number; number: number; side: Side; text: string };

  interface DragState {
    active: boolean;
    source: DragSource;
    valid: Set<string>;
    hover: string | null;
    x: number;
    y: number;
  }

  const data = rawData as unknown as PuzzleData;
  const engine = createEngine(data);
  const officialPuzzleCount = data.puzzles.length;
  let puzzles = $state<AppPuzzle[]>(data.puzzles.map((puzzle) => ({
    ...puzzle,
    kind: 'official',
    enemy: puzzle.enemy.map((piece) => ({ ...piece })),
    solution: puzzle.solution.map((piece) => ({ ...piece })),
  })));
  let currentIndex = $state(0);
  let placed = $state<SetupPiece[]>([]);
  let editorPieces = $state<SetupPiece[]>([]);
  let selectedType = $state<PieceType | null>(null);
  let mode = $state<GameMode>('place');
  let playing = $state(false);
  let solved = $state<Record<number, boolean>>({});
  let lastRun = $state<Simulation | null>(null);
  let cursor = $state(0);
  let maxSeen = $state(0);
  let resultShown = false;
  let playTimer: number | null = null;
  let reduceMotionRun = false;
  let shareCopied = $state(false);
  let shareCopiedTimer: number | null = null;
  let linkCopied = $state(false);
  let linkCopiedTimer: number | null = null;
  let threatFor = $state<string | null>(null);
  let spoilerArmed = $state(false);
  let shareUrl = $state('');
  let messageHtml = $state('');
  let resultView = $state<ResultView | null>(null);
  let resultShareFallback = $state('');
  let editorName = $state('');
  let editorDesc = $state('');
  let editorTarget = $state(5);
  let drag = $state<DragState | null>(null);
  let howToOpen = $state(readHowToOpen());
  let suppressClick = false;
  let resultCard = $state<HTMLDivElement | undefined>();

  let currentPuzzle = $derived(puzzles[currentIndex]);
  let editing = $derived(mode === 'editor');
  let deployment = $derived((editing
    ? data.sides.enemy.deploy
    : data.sides.player.deploy) as [number, number]);
  let spend = $derived(placed.reduce((total, piece) => total + data.pieceCosts[piece.type], 0));
  let inRun = $derived(mode === 'battle' || mode === 'done');
  let atEnd = $derived(lastRun !== null && cursor >= lastRun.events.length);
  let runView = $derived.by(() => (lastRun ? boardStateAt(lastRun, cursor) : null));
  let battleLog = $derived.by(buildBattleLog);
  let visiblePieces = $derived.by(piecesForRender);
  let threats = $derived.by(() => {
    if (!threatFor) return new Set<string>();
    const piece = visiblePieces.find((candidate) => candidate.id === threatFor && candidate.alive);
    return piece ? engine.threatSquares(piece, visiblePieces) : new Set<string>();
  });

  $effect(() => {
    if (resultView && resultCard) {
      void tick().then(() => resultCard?.focus());
    }
  });

  function piecesForRender(): BattlePiece[] {
    if (mode === 'editor') {
      return editorPieces.map((piece, index) => ({
        ...piece,
        side: 'enemy',
        alive: true,
        id: `e${index}`,
      }));
    }
    if (mode === 'battle' || mode === 'done') return runView?.pieces ?? [];
    const player: BattlePiece[] = placed.map((piece, index) => ({
      ...piece,
      side: 'player',
      alive: true,
      id: `p${index}`,
    }));
    const enemy: BattlePiece[] = currentPuzzle.enemy.map((piece, index) => ({
      ...piece,
      side: 'enemy',
      alive: true,
      id: `e${index}`,
    }));
    const pieces = [...player, ...enemy];
    engine.turnOrder(pieces).forEach((piece, index) => { piece.order = index + 1; });
    return pieces;
  }

  function placementPieces(): SetupPiece[] {
    return editing ? editorPieces : placed;
  }

  interface RunView {
    pieces: BattlePiece[];
    pins: string[];
    lastMove: BattleMove | null;
    activeId: string | null;
    moveStep: number;
  }

  function boardStateAt(run: Simulation, upto: number): RunView {
    const bound = Math.min(upto, run.events.length);
    const pieces = run.initialPieces.map((piece) => ({ ...piece }));
    const pins: string[] = [];
    let lastMove: BattleMove | null = null;
    let moveStep = -1;
    run.events.slice(0, bound).forEach((step, index) => {
      if (!step.ev) {
        if (!pins.includes(step.pid)) pins.push(step.pid);
        return;
      }
      const event = step.ev;
      const pinIndex = pins.indexOf(event.pieceId);
      if (pinIndex !== -1) pins.splice(pinIndex, 1);
      if (event.captured) {
        const captured = pieces.find((piece) => piece.id === event.captured?.id);
        if (captured) captured.alive = false;
      }
      const mover = pieces.find((piece) => piece.id === event.pieceId);
      if (mover) {
        mover.col = event.to.c;
        mover.row = event.to.r;
      }
      lastMove = event;
      moveStep = index;
    });
    const last = run.events[bound - 1];
    const activeId = last ? (last.ev ? last.ev.pieceId : last.pid) : null;
    return { pieces, pins, lastMove, activeId, moveStep };
  }

  function buildBattleLog(): LogEntry[] {
    if (!lastRun) return [];
    const entries: LogEntry[] = [{ kind: 'note', html: '<b>Battle begins.</b>' }];
    const visible = Math.min(maxSeen, lastRun.events.length);
    let lastRound = -1;
    let moveNumber = 1;
    const loggedPins = new Set<string>();
    lastRun.events.slice(0, visible).forEach((step, index) => {
      if (step.round !== lastRound) {
        lastRound = step.round;
        entries.push({ kind: 'round', round: step.round });
      }
      if (!step.ev) {
        if (!loggedPins.has(step.pid)) {
          loggedPins.add(step.pid);
          entries.push({
            kind: 'pin',
            side: step.side,
            text: `⊘ ${GLYPH[step.ptype]} ${squareName(step.at.c, step.at.r)} is pinned — no legal move`,
          });
        }
        return;
      }
      const event = step.ev;
      const notation = `${GLYPH[event.type]} ${squareName(event.from.c, event.from.r)}${event.captured ? '×' : '–'}${squareName(event.to.c, event.to.r)}${event.captured ? ` takes ${PIECE_NAME[event.captured.type]}` : ''}`;
      entries.push({ kind: 'move', step: index, number: moveNumber, side: event.side, text: notation });
      moveNumber += 1;
    });
    if (visible >= lastRun.events.length) {
      if (lastRun.timeout) entries.push({ kind: 'note', html: '<b>Round 20 — time. The house keeps the board.</b>' });
      if (lastRun.stalemate) entries.push({ kind: 'note', html: '<b>Dead position — no piece on either side will move again. The house keeps the board.</b>' });
    }
    return entries;
  }

  function deployLabel(): string {
    return `${fileOf(deployment[0])}–${fileOf(deployment[1])}`;
  }

  function readHowToOpen(): boolean {
    try {
      return localStorage.getItem('howToCollapsed') !== '1';
    } catch {
      return true;
    }
  }

  function storeHowToOpen(open: boolean): void {
    try {
      localStorage.setItem('howToCollapsed', open ? '0' : '1');
    } catch {
      // Private mode or blocked storage — the preference just won't persist.
    }
  }

  function resetMessageWhenEmpty(): void {
    if (placementPieces().length === 0) messageHtml = '';
  }

  function benchmarkCost(puzzle: AppPuzzle): number {
    return puzzle.kind === 'shared' ? puzzle.targetCost : puzzle.par;
  }

  function optimalCost(puzzle: AppPuzzle): number | undefined {
    return puzzle.kind === 'shared' ? undefined : puzzle.optimalCost;
  }

  function setPuzzleHash(code: string): string {
    const url = sharedPuzzleUrl(location, code);
    try {
      history.replaceState(null, '', url);
    } catch {
      location.hash = sharedPuzzleHash(code).slice(1);
    }
    return url;
  }

  function clearAppHash(): void {
    if (!location.hash) return;
    try {
      history.replaceState(null, '', hashRouteUrl(location, ''));
    } catch {
      location.hash = '';
    }
  }

  function installSharedPuzzle(puzzle: ReturnType<typeof decodePuzzle>, shareCode: string): void {
    puzzles = puzzles.filter((candidate) => candidate.kind === 'official');
    puzzles.push({
      kind: 'shared',
      id: 'shared-puzzle',
      name: puzzle.name || 'Custom Puzzle',
      desc: puzzle.desc,
      targetCost: puzzle.targetCost,
      enemy: puzzle.enemy.map((piece) => ({ ...piece })),
      solution: puzzle.solution?.map((piece) => ({ ...piece })) ?? [],
      shareCode,
    });
    currentIndex = puzzles.length - 1;
  }

  function installGeneratedPuzzle(kind: 'random' | 'daily', seed: string): void {
    const generated = generatePuzzle(data, seed);
    puzzles = puzzles.filter((candidate) => candidate.kind === 'official');
    puzzles.push({
      ...generated,
      kind,
      seed,
      name: kind === 'daily' ? 'Daily Challenge' : 'Random Challenge',
      desc: kind === 'daily' ? `Generated for ${seed} UTC.` : `Generated from seed ${seed}.`,
    });
    currentIndex = puzzles.length - 1;
  }

  function showPuzzleLink(code: string): string {
    const url = setPuzzleHash(code);
    shareUrl = url;
    return url;
  }

  function stopTimer(): void {
    if (playTimer !== null) {
      clearTimeout(playTimer);
      playTimer = null;
    }
  }

  function updateMode(): void {
    if (mode === 'editor') return;
    mode = playing ? 'battle' : (cursor > 0 ? 'done' : 'place');
  }

  function invalidateRun(): void {
    playing = false;
    stopTimer();
    lastRun = null;
    cursor = 0;
    maxSeen = 0;
    resultShown = false;
    updateMode();
  }

  function selectPuzzle(index: number): void {
    if (playing || editing) return;
    currentIndex = index;
    placed = [];
    selectedType = null;
    threatFor = null;
    disarmSpoiler();
    invalidateRun();
    const puzzle = puzzles[index];
    if (puzzle.kind === 'shared') setPuzzleHash(puzzle.shareCode);
    else {
      clearAppHash();
      shareUrl = '';
    }
    messageHtml = '';
  }

  function onSelectType(type: PieceType): void {
    if (suppressClick || playing) return;
    selectedType = selectedType === type ? null : type;
  }

  function onCell(col: number, row: number, piece: BattlePiece | undefined): void {
    if (suppressClick || playing) return;
    if (piece) {
      const own = (piece.side === 'player' && mode === 'place')
        || (piece.side === 'enemy' && editing);
      if (own && !selectedType) {
        placementPieces().splice(Number(piece.id.slice(1)), 1);
        if (!editing) invalidateRun();
        threatFor = null;
        resetMessageWhenEmpty();
        return;
      }
      threatFor = threatFor === piece.id ? null : piece.id;
      if (piece.side === 'enemy') {
        messageHtml = `Red hatching = every square the ${PIECE_NAME[piece.type]} on ${squareName(piece.col, piece.row)} can strike right now. It will refuse squares defended by cheaper pieces.`;
      }
      return;
    }
    threatFor = null;
    if ((mode !== 'place' && !editing) || !selectedType) return;
    if (col < deployment[0] || col > deployment[1]) {
      messageHtml = `Deploy on files ${deployLabel()} only.`;
      return;
    }
    placementPieces().push({ type: selectedType, col, row });
    if (!editing) invalidateRun();
  }

  function validDropCells(source: DragSource): Set<string> {
    const valid = new Set<string>();
    const prefix = editing ? 'e' : 'p';
    for (let col = deployment[0]; col <= deployment[1]; col += 1) {
      for (let row = 0; row < data.board.rows; row += 1) {
        const occupied = visiblePieces.some((piece) => piece.alive
          && piece.col === col
          && piece.row === row
          && !(source.kind === 'board' && piece.id === `${prefix}${source.index}`));
        if (!occupied) valid.add(`${col},${row}`);
      }
    }
    return valid;
  }

  function cellAt(event: PointerEvent): HTMLButtonElement | null {
    return document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLButtonElement>('.cell') ?? null;
  }

  function startDrag(event: PointerEvent, source: DragSource): void {
    if (playing || (mode !== 'place' && !editing)) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    let state: DragState = {
      active: false,
      source,
      valid: new Set<string>(),
      hover: null,
      x: startX,
      y: startY,
    };
    drag = state;

    const move = (moveEvent: PointerEvent) => {
      if (!state.active && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 7) return;
      moveEvent.preventDefault();
      if (!state.active) {
        state.active = true;
        state.valid = validDropCells(source);
      }
      state.x = moveEvent.clientX;
      state.y = moveEvent.clientY;
      const cell = cellAt(moveEvent);
      const cellKey = cell ? `${cell.dataset.c},${cell.dataset.r}` : null;
      state.hover = cellKey && state.valid.has(cellKey) ? cellKey : null;
      drag = { ...state };
    };

    const up = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!state.active) {
        drag = null;
        return;
      }
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 0);
      const cell = upEvent.type === 'pointercancel' ? null : cellAt(upEvent);
      if (cell) {
        const col = Number(cell.dataset.c);
        const row = Number(cell.dataset.r);
        const cellKey = `${col},${row}`;
        if (state.valid.has(cellKey)) {
          if (source.kind === 'tray') placementPieces().push({ type: source.type, col, row });
          else {
            const target = placementPieces()[source.index];
            if (target) {
              target.col = col;
              target.row = row;
            }
          }
          if (!editing) invalidateRun();
        } else if (col < deployment[0] || col > deployment[1]) {
          messageHtml = `Deploy on files ${deployLabel()} only — piece snapped back.`;
        } else {
          messageHtml = 'That square is taken — piece snapped back.';
        }
      } else if (source.kind === 'board') {
        placementPieces().splice(source.index, 1);
        if (!editing) invalidateRun();
        messageHtml = 'Piece returned to the box.';
      }
      threatFor = null;
      drag = null;
      resetMessageWhenEmpty();
    };

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function ensureRun(): boolean {
    if (lastRun) return true;
    if (!placed.length) return false;
    lastRun = engine.simulate(
      placed.map((piece) => ({ ...piece })),
      currentPuzzle.enemy.map((piece) => ({ ...piece })),
    );
    cursor = 0;
    maxSeen = 0;
    resultShown = false;
    messageHtml = '';
    disarmSpoiler();
    return true;
  }

  function scrollSheet(): void {
    void tick().then(() => {
      const sheet = document.querySelector('.sheet');
      sheet?.scrollTo({ top: sheet.scrollHeight });
    });
  }

  function advanceCursor(): void {
    if (!lastRun || cursor >= lastRun.events.length) return;
    cursor += 1;
    if (cursor > maxSeen) {
      maxSeen = cursor;
      scrollSheet();
    }
  }

  function delayAfter(run: Simulation, index: number): number {
    const step = run.events[index];
    if (!step.ev) {
      const firstPin = run.events.findIndex((other) => !other.ev && other.pid === step.pid) === index;
      return firstPin ? 560 : 160;
    }
    return step.ev.captured ? 620 : 430;
  }

  function stopPlaying(): void {
    playing = false;
    stopTimer();
    updateMode();
    if (lastRun && cursor >= lastRun.events.length && !resultShown) {
      resultShown = true;
      finish(lastRun);
    }
  }

  function tickPlayback(): void {
    playTimer = null;
    if (!playing || !lastRun) return;
    advanceCursor();
    if (cursor >= lastRun.events.length) {
      stopPlaying();
      return;
    }
    playTimer = window.setTimeout(tickPlayback, reduceMotionRun ? 0 : delayAfter(lastRun, cursor - 1));
  }

  function togglePlay(): void {
    if (editing) return;
    if (playing) {
      stopPlaying();
      return;
    }
    if (!ensureRun() || !lastRun) return;
    if (cursor >= lastRun.events.length) cursor = 0;
    reduceMotionRun = matchMedia('(prefers-reduced-motion: reduce)').matches;
    playing = true;
    threatFor = null;
    resultView = null;
    updateMode();
    tickPlayback();
  }

  function stepForward(): void {
    if (editing) return;
    playing = false;
    stopTimer();
    if (!ensureRun() || !lastRun || cursor >= lastRun.events.length) {
      updateMode();
      return;
    }
    advanceCursor();
    threatFor = null;
    stopPlaying();
  }

  function stepBack(): void {
    if (editing || !lastRun || cursor === 0) return;
    playing = false;
    stopTimer();
    cursor -= 1;
    threatFor = null;
    updateMode();
  }

  function rewind(): void {
    if (editing) return;
    playing = false;
    stopTimer();
    cursor = 0;
    threatFor = null;
    resultView = null;
    updateMode();
  }

  function jumpToMove(step: number): void {
    if (editing || !lastRun) return;
    playing = false;
    stopTimer();
    cursor = Math.min(step + 1, lastRun.events.length);
    selectedType = null;
    threatFor = null;
    disarmSpoiler();
    updateMode();
  }

  function finish(simulation: Simulation): void {
    mode = 'done';
    const win = simulation.result === 'win';
    if (win) {
      solved[currentIndex] = true;
      const benchmark = benchmarkCost(currentPuzzle);
      const [scoreVerdict, verdict] = verdictFor(spend, benchmark, optimalCost(currentPuzzle));
      resultView = {
        win,
        title: 'Position won',
        verdict,
        spend,
        benchmark,
        benchmarkLabel: currentPuzzle.kind === 'shared' ? 'target' : 'par',
        scoreVerdict,
        canShare: true,
        canNext: currentPuzzle.kind === 'official'
          && currentIndex < officialPuzzleCount - 1,
      };
    } else {
      resultView = {
        win,
        title: 'Position lost',
        verdict: simulation.stalemate
          ? 'Dead position — nobody left willing to move. You need a piece that can break through.'
          : 'Your force was eliminated — or the clock ran out. Study their ranges and go again.',
        spend,
        benchmark: benchmarkCost(currentPuzzle),
        benchmarkLabel: currentPuzzle.kind === 'shared' ? 'target' : 'par',
        scoreVerdict: '',
        canShare: false,
        canNext: false,
      };
    }
    resultShareFallback = '';
  }

  function clearPlacement(): void {
    if (playing) return;
    if (editing) editorPieces = [];
    else placed = [];
    selectedType = null;
    threatFor = null;
    disarmSpoiler();
    invalidateRun();
    messageHtml = '';
  }

  function disarmSpoiler(): void {
    spoilerArmed = false;
  }

  function revealSpoiler(): void {
    if (playing || mode !== 'place') return;
    if (!spoilerArmed) {
      spoilerArmed = true;
      messageHtml = 'This places the optimal setup on the board. Tap again to spoil — or Clear to keep hunting.';
      return;
    }
    disarmSpoiler();
    placed = currentPuzzle.solution.map((piece) => ({ ...piece }));
    invalidateRun();
    selectedType = null;
    threatFor = null;
    messageHtml = '<b>Optimal setup placed.</b> Press Play to watch why it works — then Clear and see if you can rediscover it cold.';
  }

  function startEditor(): void {
    if (playing) return;
    resultView = null;
    shareUrl = '';
    mode = 'editor';
    editorPieces = [];
    selectedType = null;
    threatFor = null;
    disarmSpoiler();
    invalidateRun();
    messageHtml = '';
  }

  function cancelEditor(): void {
    mode = 'place';
    editorPieces = [];
    selectedType = null;
    threatFor = null;
    messageHtml = '';
  }

  async function saveEditorPuzzle(): Promise<void> {
    try {
      const puzzle = {
        name: editorName,
        desc: editorDesc,
        targetCost: Number(editorTarget),
        enemy: editorPieces.map((piece) => ({ ...piece })),
      };
      const code = encodePuzzle(puzzle, data);
      const clean = decodePuzzle(code, data);
      installSharedPuzzle(clean, code);
      mode = 'place';
      placed = [];
      selectedType = null;
      threatFor = null;
      showPuzzleLink(code);
      messageHtml = '<b>Puzzle saved.</b> Use Copy puzzle link to share it, then set your force and test the battle.';
    } catch (error) {
      messageHtml = error instanceof Error ? error.message : 'The puzzle could not be saved.';
    }
  }

  async function copyText(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Continue to the selection fallback.
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      return copied;
    } catch {
      return false;
    }
  }

  async function copyPuzzleLink(): Promise<void> {
    if (!(await copyText(shareUrl))) {
      document.querySelector<HTMLInputElement>('#puzzleShareOut')?.select();
      return;
    }
    linkCopied = true;
    if (linkCopiedTimer !== null) clearTimeout(linkCopiedTimer);
    linkCopiedTimer = window.setTimeout(() => {
      linkCopied = false;
      linkCopiedTimer = null;
    }, 1600);
  }

  async function shareResult(): Promise<void> {
    const text = resultShareText(
      currentPuzzle.name,
      spend,
      benchmarkCost(currentPuzzle),
      currentPuzzle.kind === 'shared' ? 'target' : 'par',
    );
    if (!(await copyText(text))) {
      resultShareFallback = text;
      await tick();
      document.querySelector<HTMLInputElement>('#shareOut')?.select();
    }
  }

  function closeResult(): void {
    resultView = null;
  }

  async function shareSolution(): Promise<void> {
    if (!placed.length) return;
    try {
      const code = encodePuzzle({
        name: currentPuzzle.name,
        desc: currentPuzzle.desc,
        targetCost: benchmarkCost(currentPuzzle),
        enemy: currentPuzzle.enemy.map((piece) => ({ ...piece })),
        solution: placed.map((piece) => ({ ...piece })),
      }, data);
      const url = sharedPuzzleUrl(location, code);
      const copied = await copyText(url);
      if (copied) {
        messageHtml = '<b>Replay link copied.</b> It loads this puzzle with your setup placed, ready to play.';
        shareCopied = true;
        if (shareCopiedTimer !== null) clearTimeout(shareCopiedTimer);
        shareCopiedTimer = window.setTimeout(() => {
          shareCopied = false;
          shareCopiedTimer = null;
        }, 1600);
      } else {
        shareUrl = url;
        messageHtml = '<b>Replay link ready.</b> Use Copy puzzle link to share this puzzle with your setup placed.';
      }
    } catch (error) {
      messageHtml = error instanceof Error ? error.message : 'The replay link could not be created.';
    }
  }

  function nextPuzzle(): void {
    resultView = null;
    selectPuzzle(Math.min(currentIndex + 1, officialPuzzleCount - 1));
  }

  function resetRoutedPuzzleState(): void {
    resultView = null;
    mode = 'place';
    invalidateRun();
    placed = [];
    selectedType = null;
    threatFor = null;
    disarmSpoiler();
    shareUrl = '';
    messageHtml = '';
  }

  function routeHash(): void {
    const route = parseHashRoute(location.hash);
    resetRoutedPuzzleState();
    try {
      if (route.kind === 'home') {
        puzzles = puzzles.filter((candidate) => candidate.kind === 'official');
        currentIndex = 0;
      } else if (route.kind === 'shared') {
        const shared = decodePuzzle(route.code, data);
        installSharedPuzzle(shared, route.code);
        if (shared.solution?.length) {
          placed = shared.solution.map((piece) => ({ ...piece }));
          messageHtml = 'This link includes a shared solution, already set up. Press Play to watch it play out.';
        }
      } else if (route.kind === 'daily') {
        const date = dailyPuzzleSeed();
        installGeneratedPuzzle('daily', date);
      } else if (route.kind === 'random') {
        const seed = route.seed ?? randomPuzzleSeed();
        installGeneratedPuzzle('random', seed);
        if (route.seed === null) {
          history.replaceState(null, '', hashRouteUrl(location, randomPuzzleHash(seed)));
        }
      } else {
        puzzles = puzzles.filter((candidate) => candidate.kind === 'official');
        currentIndex = 0;
        messageHtml = 'The URL route is invalid, so the first club puzzle was loaded instead.';
      }
    } catch {
      puzzles = puzzles.filter((candidate) => candidate.kind === 'official');
      currentIndex = 0;
      messageHtml = 'The puzzle URL is invalid, so the first club puzzle was loaded instead.';
    }
  }

  onMount(() => {
    routeHash();
    window.addEventListener('hashchange', routeHash);
    return () => {
      window.removeEventListener('hashchange', routeHash);
      stopTimer();
      if (shareCopiedTimer !== null) clearTimeout(shareCopiedTimer);
      if (linkCopiedTimer !== null) clearTimeout(linkCopiedTimer);
    };
  });
</script>

<svelte:head>
  <title>Chessmatic — Chess Puzzle Autobattler</title>
  <meta name="description" content="A mobile-friendly chess puzzle autobattler.">
</svelte:head>

<main class="wrap">
  <header>
    <h1>
      <a class="brand-link" href="./" aria-label="Reset Chessmatic">
        <span class="knight">♞</span>Chessmatic
      </a>
    </h1>
    <div class="tagline">Chess Puzzle Autobattler</div>
  </header>

  {#if !editing}
    <div class="chips" role="group" aria-label="Choose a puzzle">
      {#each puzzles.slice(0, officialPuzzleCount) as puzzle, index}
        <button
          class:solved={solved[index]}
          class="chip"
          type="button"
          aria-pressed={index === currentIndex}
          onclick={() => selectPuzzle(index)}
        >{toRoman(index + 1)}</button>
      {/each}
      <a
        class="chip"
        href={dailyPuzzleHash()}
        aria-current={currentPuzzle.kind === 'daily' ? 'page' : undefined}
        onclick={(event) => { if (playing || editing) event.preventDefault(); }}
      >DAILY</a>
      {#if currentPuzzle.kind === 'shared'}
        <button class="chip" type="button" aria-pressed="true" onclick={() => selectPuzzle(currentIndex)}>Custom</button>
      {/if}
    </div>

    <section class="mission" aria-labelledby="puzzle-name">
      <div><b id="puzzle-name">{currentPuzzle.name}</b><div class="par">{currentPuzzle.desc}</div></div>
      <div class="par">{currentPuzzle.kind === 'shared' ? 'Target' : 'Par'} <strong>{benchmarkCost(currentPuzzle)}</strong> pts</div>
    </section>
  {:else}
    <section class="editor-form" aria-label="Puzzle details">
      <label>Title<input maxlength="80" placeholder="Custom Puzzle" bind:value={editorName}></label>
      <label>Target<input type="number" min="1" max="999" step="1" bind:value={editorTarget}></label>
      <label>Description<input maxlength="240" bind:value={editorDesc}></label>
    </section>
  {/if}

  <Board
    cols={data.board.cols}
    rows={data.board.rows}
    pieces={visiblePieces}
    deploy={deployment}
    {mode}
    {playing}
    {selectedType}
    {threats}
    {threatFor}
    pinnedIds={inRun && runView ? runView.pins : []}
    activeId={inRun && runView ? runView.activeId : null}
    lastMove={inRun && runView ? runView.lastMove : null}
    {drag}
    oncell={onCell}
    ondrag={startDrag}
  />

  <PieceTray
    costs={data.pieceCosts}
    selected={selectedType}
    disabled={inRun}
    enemy={editing}
    onselect={onSelectType}
    ondrag={(event, type) => startDrag(event, { kind: 'tray', type })}
  />

  <div class="hud">
    <div class="spend">
      {editing ? 'Enemy force' : 'Spend'}
      <strong>{editing ? editorPieces.length : spend}</strong>
      {editing ? (editorPieces.length === 1 ? 'piece' : 'pieces') : 'pts'}
    </div>
    <div class="btns">
      {#if (mode === 'place' || editing) && placementPieces().length > 0}
        <button class="btn ghost" type="button" onclick={clearPlacement}>Clear</button>
      {/if}
      {#if mode === 'place' && placed.length > 0}
        <button
          class="btn ghost icon"
          class:share-copied={shareCopied}
          type="button"
          aria-label="Copy replay link"
          title="Copy replay link"
          onclick={() => void shareSolution()}
        >{shareCopied ? '✓' : '🔗'}</button>
      {/if}
      {#if editing}
        <button
          class="btn primary"
          type="button"
          disabled={editorPieces.length === 0}
          onclick={() => void saveEditorPuzzle()}
        >Save</button>
      {:else}
        <button
          class="btn ghost icon"
          type="button"
          disabled={!lastRun || (cursor === 0 && !playing)}
          aria-label="Rewind to setup"
          title="Rewind to setup"
          onclick={rewind}
        >⏮</button>
        <button
          class="btn ghost icon"
          type="button"
          disabled={!lastRun || cursor === 0}
          aria-label="Step back"
          title="Step back"
          onclick={stepBack}
        >⏴</button>
        <button
          class="btn primary"
          type="button"
          disabled={!placed.length && !lastRun}
          onclick={togglePlay}
        >{playing ? 'Pause' : 'Play'}</button>
        <button
          class="btn ghost icon"
          type="button"
          disabled={(!placed.length && !lastRun) || atEnd}
          aria-label="Step forward"
          title="Step forward"
          onclick={stepForward}
        >⏵</button>
      {/if}
    </div>
  </div>

  {#if shareUrl && !editing}
    <div class="puzzle-share">
      <input id="puzzleShareOut" class="share-out" readonly value={shareUrl} aria-label="Shareable puzzle link">
      <button
        class="btn ghost"
        class:share-copied={linkCopied}
        type="button"
        onclick={() => void copyPuzzleLink()}
      >{linkCopied ? '✓ Copied' : 'Copy puzzle link'}</button>
    </div>
  {/if}

  {#if messageHtml || battleLog.length}
    <section class="sheet" aria-label="Scoresheet" aria-live="polite">
      <span class="lbl">Scoresheet</span>
      <div class="moves">
        {#if messageHtml}{@html messageHtml}{/if}
        {#each battleLog as entry}
          {#if entry.kind === 'note'}
            {@html entry.html}<br>
          {:else if entry.kind === 'round'}
            <span class="lbl">— round {entry.round + 1} —</span><br>
          {:else if entry.kind === 'pin'}
            <span class="mv {entry.side}">{entry.text}</span><br>
          {:else}
            <button
              class="mv {entry.side}"
              class:sel={runView?.moveStep === entry.step}
              type="button"
              disabled={editing}
              onclick={() => jumpToMove(entry.step)}
            >{entry.number}. {entry.text}</button><br>
          {/if}
        {/each}
      </div>
    </section>
  {/if}

  <details bind:open={howToOpen} ontoggle={() => storeHowToOpen(howToOpen)}>
    <summary>How to play</summary>
    <p>Chessmatic does not use a regular chess engine. Each piece gets a turn as an automaton, following a deterministic ruleset:</p>
    <p>Turns are ordered middle-to-back, then by vertically. Each piece must make a valid move, if available: Capture if safe or equal+ value, else creep one step toward the enemy preferring a safe position.</p>
    <p>The rules are tuned to be predictable and to allow for interesting puzzle scenarios.</p>
  </details>

  {#if editing}
    <div class="utility-actions editor-actions">
      <button class="btn ghost" type="button" onclick={cancelEditor}>Cancel</button>
    </div>
  {:else}
    <div class="utility-actions">
      <a
        class="btn ghost"
        href={randomPuzzleHash()}
        aria-current={currentPuzzle.kind === 'random' ? 'page' : undefined}
        onclick={(event) => { if (playing) event.preventDefault(); }}
      >Random</a>
      <button class="btn ghost" type="button" onclick={startEditor}>Editor</button>
      {#if currentPuzzle.solution.length}
        <button class:armed={spoilerArmed} class="btn ghost spoiler" type="button" disabled={playing} onclick={revealSpoiler}>
          {spoilerArmed ? 'Reveal optimal?' : 'Spoiler'}
        </button>
      {/if}
    </div>
  {/if}
</main>

{#if drag?.active}
  <div class:enemy={editing} class="drag-ghost" style:left={`${drag.x}px`} style:top={`${drag.y}px`} aria-hidden="true">
    {GLYPH[drag.source.type]}
  </div>
{/if}

{#if resultView}
  <div class="overlay">
    <div
      bind:this={resultCard}
      class:lost={!resultView.win}
      class="card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-title"
      tabindex="-1"
    >
      <h2 id="result-title">{resultView.title}</h2>
      <div class="verdict">{resultView.verdict}</div>
      <div class="score">
        {resultView.win ? resultView.spend : '—'}
        <small>{resultView.win ? ` pts · ${resultView.benchmarkLabel} ${resultView.benchmark} · ${resultView.scoreVerdict}` : `${resultView.benchmarkLabel} ${resultView.benchmark} pts`}</small>
      </div>
      {#if resultShareFallback}
        <input id="shareOut" class="share-out" readonly value={resultShareFallback} aria-label="Shareable result text">
      {/if}
      <div class="row">
        <button class="btn ghost dark" type="button" onclick={rewind}>Retry</button>
        <button class="btn ghost dark" type="button" onclick={closeResult}>Close</button>
        {#if resultView.canShare}
          <button class="btn ghost dark" type="button" onclick={() => void shareResult()}>Copy result</button>
        {/if}
        {#if resultView.canNext}
          <button class="btn primary" type="button" onclick={nextPuzzle}>Next puzzle</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
