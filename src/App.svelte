<script lang="ts">
  import { onMount, tick } from 'svelte';
  import rawData from '../chessmatic-puzzles.json';
  import Board, { type DragSource } from './lib/components/Board.svelte';
  import PieceTray from './lib/components/PieceTray.svelte';
  import { createEngine } from './lib/engine';
  import {
    buildPuzzleUrl,
    decodePuzzle,
    encodePuzzle,
    puzzleFromHash,
  } from './lib/puzzle-link';
  import type {
    BattleMove,
    BattlePiece,
    GameMode,
    PieceType,
    Puzzle,
    PuzzleData,
    SetupPiece,
    Simulation,
  } from './lib/types';
  import {
    GLYPH,
    PIECE_NAME,
    fileOf,
    resultShareText,
    squareName,
    verdictFor,
  } from './lib/ui';

  interface AppPuzzle extends Puzzle {
    custom?: boolean;
    shareCode?: string;
  }

  interface ResultView {
    win: boolean;
    title: string;
    verdict: string;
    spend: number;
    par: number;
    parLabel: string;
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
  const roman = ['I', 'II', 'III', 'IV', 'V'];

  let puzzles = $state<AppPuzzle[]>(data.puzzles.map((puzzle) => ({
    ...puzzle,
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
  let editorPar = $state(5);
  let drag = $state<DragState | null>(null);
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

  function defaultMessage(): string {
    if (editing) {
      return `Build the house force on files ${deployLabel()}. Drag a piece from the tray, or tap it and then tap a square.`;
    }
    return `Drag pieces onto files ${deployLabel()} (or tap to select, tap to place). Number badges show the global turn order. Tap an enemy piece to see its strike range. The house plays White and moves first.`;
  }

  function resetMessageWhenEmpty(): void {
    if (placementPieces().length === 0) messageHtml = defaultMessage();
  }

  function setPuzzleHash(code: string): string {
    const url = buildPuzzleUrl(location, code);
    try {
      history.replaceState(null, '', url);
    } catch {
      location.hash = `?puzzle=${code}`;
    }
    return url;
  }

  function clearPuzzleHash(): void {
    if (!puzzleFromHash(location.hash)) return;
    try {
      history.replaceState(null, '', location.href.split('#')[0]);
    } catch {
      location.hash = '';
    }
  }

  function installCustomPuzzle(puzzle: ReturnType<typeof decodePuzzle>, shareCode: string): void {
    puzzles = puzzles.filter((candidate) => !candidate.custom);
    puzzles.push({
      id: 'shared-puzzle',
      ...puzzle,
      enemy: puzzle.enemy.map((piece) => ({ ...piece })),
      solution: [],
      custom: true,
      shareCode,
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
    if (puzzle.custom && puzzle.shareCode) showPuzzleLink(puzzle.shareCode);
    else {
      clearPuzzleHash();
      shareUrl = '';
    }
    messageHtml = defaultMessage();
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
      const [scoreVerdict, verdict] = verdictFor(spend, currentPuzzle.par, Boolean(currentPuzzle.custom));
      resultView = {
        win,
        title: 'Position won',
        verdict,
        spend,
        par: currentPuzzle.par,
        parLabel: 'par',
        scoreVerdict,
        canShare: true,
        canNext: currentIndex < puzzles.length - 1,
      };
    } else {
      resultView = {
        win,
        title: 'Position lost',
        verdict: simulation.stalemate
          ? 'Dead position — nobody left willing to move. You need a piece that can break through.'
          : 'Your force was eliminated — or the clock ran out. Study their ranges and go again.',
        spend,
        par: currentPuzzle.par,
        parLabel: currentPuzzle.custom ? 'target' : 'par',
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
    messageHtml = defaultMessage();
  }

  function disarmSpoiler(): void {
    spoilerArmed = false;
  }

  function revealSpoiler(): void {
    if (playing || mode !== 'place') return;
    if (!spoilerArmed) {
      spoilerArmed = true;
      messageHtml = 'This places the cheapest known setup on the board. Tap again to spoil — or Clear to keep hunting.';
      return;
    }
    disarmSpoiler();
    placed = currentPuzzle.solution.map((piece) => ({ ...piece }));
    selectedType = null;
    threatFor = null;
    messageHtml = '<b>Par setup placed.</b> Press Start battle to watch why it works — then Clear and see if you can rediscover it cold.';
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
    messageHtml = defaultMessage();
  }

  function cancelEditor(): void {
    mode = 'place';
    editorPieces = [];
    selectedType = null;
    threatFor = null;
    messageHtml = defaultMessage();
  }

  async function saveEditorPuzzle(): Promise<void> {
    try {
      const puzzle = {
        name: editorName,
        desc: editorDesc,
        par: Number(editorPar),
        enemy: editorPieces.map((piece) => ({ ...piece })),
      };
      const code = encodePuzzle(puzzle, data);
      const clean = decodePuzzle(code, data);
      installCustomPuzzle(clean, code);
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
    const text = resultShareText(currentPuzzle.name, spend, currentPuzzle.par);
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
    selectPuzzle(Math.min(currentIndex + 1, puzzles.length - 1));
    mode = 'place';
  }

  function loadSharedHash(): void {
    const sharedCode = puzzleFromHash(location.hash);
    if (!sharedCode) return;
    try {
      installCustomPuzzle(decodePuzzle(sharedCode, data), sharedCode);
      placed = [];
      selectedType = null;
      threatFor = null;
      mode = 'place';
      showPuzzleLink(sharedCode);
      messageHtml = defaultMessage();
    } catch {
      messageHtml = 'The shared puzzle link is invalid, so the first club puzzle was loaded instead.';
    }
  }

  onMount(() => {
    messageHtml = defaultMessage();
    loadSharedHash();
    window.addEventListener('hashchange', loadSharedHash);
    return () => window.removeEventListener('hashchange', loadSharedHash);
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
      {#each puzzles as puzzle, index}
        <button
          class:solved={solved[index]}
          class="chip"
          type="button"
          aria-pressed={index === currentIndex}
          onclick={() => selectPuzzle(index)}
        >{puzzle.custom ? 'Custom' : (roman[index] ?? String(index + 1))}</button>
      {/each}
    </div>

    <section class="mission" aria-labelledby="puzzle-name">
      <div><b id="puzzle-name">{currentPuzzle.name}</b><div class="par">{currentPuzzle.desc}</div></div>
      <div class="par">Par <strong>{currentPuzzle.par}</strong> pts</div>
    </section>
  {:else}
    <section class="editor-form" aria-label="Puzzle details">
      <label>Title<input maxlength="80" bind:value={editorName}></label>
      <label>Par<input type="number" min="1" max="999" step="1" bind:value={editorPar}></label>
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
      <button class="btn ghost" type="button" disabled={playing} onclick={clearPlacement}>Clear</button>
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

  <section class="sheet" aria-label="Scoresheet" aria-live="polite">
    <span class="lbl">Scoresheet</span>
    <div class="moves">{@html messageHtml}</div>
  </section>

  <details>
    <summary>How the battle plays out</summary>
    <p>Turn order is deterministic: each side lines up front-to-back (closest to the enemy first), with the lower rank breaking same-file ties. The house is White and takes turn 1, then sides alternate: yours takes turn 2, the house takes turn 3, and so on. That schedule freezes at the bell — moving and capturing can’t reshuffle it.</p>
    <p>Every survivor gets one turn per round; blocked pieces miss theirs. On a turn:</p>
    <p><b>1. Strike.</b> Take the highest-value allowed capture, using full chess range. Rooks, bishops, and queens reach as far as clear lines allow.</p>
    <p><b>2. Creep.</b> No strike? Take a safe move toward the nearest enemy. Sliders creep one square; knights leap normally.</p>
    <p><b>3. Mind the price tag.</b> A square is unsafe if an equal-or-cheaper enemy attacks it, or a pricier enemy attacks it with no ally defending it. A capture is still allowed through danger when its target costs at least as much as the attacker.</p>
    <p>No safe advance? The piece makes its least-bad legal move — even into trouble. A piece with no legal move is pinned (⊘) until the position changes.</p>
    <p>Eliminate every enemy within 20 rounds. A full round with no moves is an instant loss; so is reaching the limit with enemies standing. Your score is points spent. Hit par and you’ve found the cheapest solution.</p>
  </details>

  <div class="utility-actions">
    <button class="btn ghost" type="button" onclick={() => editing ? cancelEditor() : startEditor()}>
      {editing ? 'Cancel' : 'Editor'}
    </button>
    {#if !editing && currentPuzzle.solution.length}
      <button class:armed={spoilerArmed} class="btn ghost spoiler" type="button" disabled={playing} onclick={revealSpoiler}>
        {spoilerArmed ? 'Reveal par?' : 'Spoiler'}
      </button>
    {/if}
  </div>
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
        <small>{resultView.win ? ` pts · par ${resultView.par} · ${resultView.scoreVerdict}` : `${resultView.parLabel} ${resultView.par} pts`}</small>
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
