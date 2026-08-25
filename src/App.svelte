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
    solution: [];
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
  let livePieces = $state<BattlePiece[]>([]);
  let finishRequested = $state(false);
  let pinnedIds = $state<string[]>([]);
  let activeId = $state<string | null>(null);
  let threatFor = $state<string | null>(null);
  let lastMove = $state<BattleMove | null>(null);
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
    if (mode === 'battle' || mode === 'done') return livePieces;
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
      name: puzzle.name,
      desc: puzzle.desc,
      targetCost: puzzle.targetCost,
      enemy: puzzle.enemy.map((piece) => ({ ...piece })),
      solution: [],
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

  function selectPuzzle(index: number): void {
    if (playing || editing) return;
    currentIndex = index;
    placed = [];
    selectedType = null;
    threatFor = null;
    disarmSpoiler();
    const puzzle = puzzles[index];
    if (puzzle.kind === 'shared') showPuzzleLink(puzzle.shareCode);
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
        } else if (col < deployment[0] || col > deployment[1]) {
          messageHtml = `Deploy on files ${deployLabel()} only — piece snapped back.`;
        } else {
          messageHtml = 'That square is taken — piece snapped back.';
        }
      } else if (source.kind === 'board') {
        placementPieces().splice(source.index, 1);
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

  const sleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

  async function startBattle(): Promise<void> {
    if (!placed.length || playing) return;
    const simulation = engine.simulate(
      placed.map((piece) => ({ ...piece })),
      currentPuzzle.enemy.map((piece) => ({ ...piece })),
    );
    livePieces = simulation.initialPieces.map((piece) => ({ ...piece }));
    playing = true;
    finishRequested = false;
    mode = 'battle';
    threatFor = null;
    pinnedIds = [];
    activeId = null;
    lastMove = null;
    messageHtml = '<b>Battle begins.</b><br>';
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let moveNumber = 1;
    let lastRound = -1;
    const loggedPins = new Set<string>();

    for (const step of simulation.events) {
      if (step.round !== lastRound) {
        lastRound = step.round;
        messageHtml += `<span class="lbl">— round ${step.round + 1} —</span><br>`;
      }
      if (!step.ev) {
        activeId = step.pid;
        if (!pinnedIds.includes(step.pid)) pinnedIds.push(step.pid);
        if (!loggedPins.has(step.pid)) {
          loggedPins.add(step.pid);
          messageHtml += `<span class="mv ${step.side}">⊘ ${GLYPH[step.ptype]} ${squareName(step.at.c, step.at.r)} is pinned — no legal move</span><br>`;
          if (!finishRequested && !reducedMotion) await sleep(560);
        } else if (!finishRequested && !reducedMotion) await sleep(160);
        continue;
      }
      pinnedIds = pinnedIds.filter((id) => id !== step.ev.pieceId);
      activeId = step.ev.pieceId;
      const event = step.ev;
      const livePiece = livePieces.find((piece) => piece.id === event.pieceId);
      if (event.captured) {
        const captured = livePieces.find((piece) => piece.id === event.captured?.id);
        if (captured) captured.alive = false;
      }
      if (livePiece) {
        livePiece.col = event.to.c;
        livePiece.row = event.to.r;
      }
      const notation = `${GLYPH[event.type]} ${squareName(event.from.c, event.from.r)}${event.captured ? '×' : '–'}${squareName(event.to.c, event.to.r)}${event.captured ? ` takes ${PIECE_NAME[event.captured.type]}` : ''}`;
      messageHtml += `<span class="mv ${event.side}">${moveNumber}. ${notation}</span><br>`;
      moveNumber += 1;
      lastMove = event;
      await tick();
      document.querySelector('.sheet')?.scrollTo({ top: document.querySelector('.sheet')?.scrollHeight });
      if (!finishRequested && !reducedMotion) await sleep(event.captured ? 620 : 430);
    }
    if (simulation.timeout) messageHtml += '<b>Round 20 — time. The house keeps the board.</b><br>';
    if (simulation.stalemate) messageHtml += '<b>Dead position — no piece on either side will move again. The house keeps the board.</b><br>';
    playing = false;
    finish(simulation);
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
    pinnedIds = [];
    disarmSpoiler();
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
    selectedType = null;
    threatFor = null;
    messageHtml = '<b>Optimal setup placed.</b> Press Start battle to watch why it works — then Clear and see if you can rediscover it cold.';
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
      const url = showPuzzleLink(code);
      const copied = await copyText(url);
      messageHtml = copied
        ? '<b>Puzzle saved and link copied.</b> Set your force, then test the battle.'
        : '<b>Puzzle saved.</b> Use Copy link to share it, then set your force and test the battle.';
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
    }
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

  function retry(): void {
    resultView = null;
    mode = 'place';
    pinnedIds = [];
    activeId = null;
    lastMove = null;
  }

  function nextPuzzle(): void {
    resultView = null;
    selectPuzzle(Math.min(currentIndex + 1, officialPuzzleCount - 1));
    mode = 'place';
  }

  function resetRoutedPuzzleState(): void {
    resultView = null;
    mode = 'place';
    playing = false;
    finishRequested = false;
    placed = [];
    selectedType = null;
    threatFor = null;
    pinnedIds = [];
    activeId = null;
    lastMove = null;
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
        installSharedPuzzle(decodePuzzle(route.code, data), route.code);
        shareUrl = location.href;
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
    return () => window.removeEventListener('hashchange', routeHash);
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
      <label>Title<input maxlength="80" bind:value={editorName}></label>
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
    {pinnedIds}
    {activeId}
    {lastMove}
    {drag}
    oncell={onCell}
    ondrag={startDrag}
  />

  <PieceTray
    costs={data.pieceCosts}
    selected={selectedType}
    disabled={playing}
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
      {#if playing}
        <button class="btn ghost" type="button" onclick={() => { finishRequested = true; }}>Finish ≫</button>
      {/if}
      <button
        class="btn primary"
        type="button"
        disabled={editing ? editorPieces.length === 0 : placed.length === 0 || playing}
        onclick={() => editing ? void saveEditorPuzzle() : void startBattle()}
      >{editing ? 'Save' : 'Start battle'}</button>
    </div>
  </div>

  {#if shareUrl && !editing}
    <div class="puzzle-share">
      <input id="puzzleShareOut" class="share-out" readonly value={shareUrl} aria-label="Shareable puzzle link">
      <button class="btn ghost" type="button" onclick={() => void copyPuzzleLink()}>Copy link</button>
    </div>
  {/if}

  {#if messageHtml}
    <section class="sheet" aria-label="Scoresheet" aria-live="polite">
      <span class="lbl">Scoresheet</span>
      <div class="moves">{@html messageHtml}</div>
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
        <button class="btn ghost dark" type="button" onclick={retry}>Retry</button>
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
