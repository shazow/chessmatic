<script lang="ts">
  import type { BattleMove, BattlePiece, GameMode } from '../types';
  import { GLYPH, PIECE_NAME, squareName } from '../ui';

  export type DragSource =
    | { kind: 'tray'; type: BattlePiece['type'] }
    | { kind: 'board'; type: BattlePiece['type']; index: number };

  interface DragView {
    active: boolean;
    valid: Set<string>;
    hover: string | null;
    source: DragSource;
  }

  interface Props {
    cols: number;
    rows: number;
    pieces: BattlePiece[];
    deploy: [number, number];
    mode: GameMode;
    playing: boolean;
    selectedType: BattlePiece['type'] | null;
    threats: Set<string>;
    threatFor: string | null;
    pinnedIds: string[];
    activeId: string | null;
    lastMove: BattleMove | null;
    drag: DragView | null;
    oncell: (col: number, row: number, piece: BattlePiece | undefined) => void;
    ondrag: (event: PointerEvent, source: DragSource) => void;
  }

  let {
    cols,
    rows,
    pieces,
    deploy,
    mode,
    playing,
    selectedType,
    threats,
    threatFor,
    pinnedIds,
    activeId,
    lastMove,
    drag,
    oncell,
    ondrag,
  }: Props = $props();

  const ranks = $derived(Array.from({ length: rows }, (_, index) => rows - index - 1));
  const files = $derived(Array.from({ length: cols }, (_, index) => index));
  const inDeploy = (col: number) => col >= deploy[0] && col <= deploy[1];
  const pieceAt = (col: number, row: number) => pieces.find(
    (piece) => piece.alive && piece.col === col && piece.row === row,
  );
  const ownPlacement = (piece: BattlePiece) => (
    (mode === 'place' && piece.side === 'player')
      || (mode === 'editor' && piece.side === 'enemy')
  );
  const key = (col: number, row: number) => `${col},${row}`;
</script>

<div class="board-shell">
  <div class="board" role="grid" aria-label={`Battle board, ${cols} files by ${rows} ranks`}>
    {#each ranks as row}
      {#each files as col}
        {@const piece = pieceAt(col, row)}
        {@const cellKey = key(col, row)}
        <button
          type="button"
          role="gridcell"
          class="cell"
          class:light={(col + row) % 2 === 0}
          class:dark={(col + row) % 2 !== 0}
          class:deploy={inDeploy(col) && (mode === 'place' || mode === 'editor')}
          class:deploy-open={!piece && inDeploy(col) && (mode === 'place' || mode === 'editor')}
          class:threat={threats.has(cellKey)}
          class:lastmove={lastMove?.to.c === col && lastMove?.to.r === row}
          class:droppable={drag?.active && drag.valid.has(cellKey)}
          class:drophover={drag?.active && drag.hover === cellKey}
          class:sel={Boolean(piece && selectedType === null && ownPlacement(piece))}
          data-c={col}
          data-r={row}
          aria-label={piece
            ? `${squareName(col, row)}, ${piece.side === 'player' ? 'your' : 'enemy'} ${PIECE_NAME[piece.type]}${mode === 'place' ? `, turn ${piece.order}` : ''}`
            : squareName(col, row)}
          aria-selected={piece?.id === threatFor}
          onclick={() => oncell(col, row, piece)}
          onpointerdown={(event) => {
            if (piece && !playing && ownPlacement(piece)) {
              ondrag(event, { kind: 'board', index: Number(piece.id.slice(1)), type: piece.type });
            }
          }}
        >
          {#if piece}
            <span
              class="pc"
              class:player={piece.side === 'player'}
              class:enemy={piece.side === 'enemy'}
              class:pop={lastMove?.to.c === col && lastMove?.to.r === row}
            >{GLYPH[piece.type]}</span>
            {#if mode === 'place'}
              <span class:enemy={piece.side === 'enemy'} class="order" title={`Turn ${piece.order}: ${piece.side === 'player' ? 'your' : 'enemy'} piece`}>
                {piece.order}
              </span>
            {/if}
            {#if (mode === 'battle' || mode === 'done') && pinnedIds.includes(piece.id)}
              <span class="pin" title="Pinned: every move is poisoned"><span class="sr-only">Pinned</span></span>
            {/if}
            {#if (mode === 'battle' || mode === 'done') && piece.id === activeId}
              <span class:enemy={piece.side === 'enemy'} class="turn" title={piece.side === 'player' ? 'Your piece just acted' : 'Their piece just acted'}></span>
            {/if}
          {/if}
        </button>
      {/each}
    {/each}
  </div>
  <div class="files" aria-hidden="true">
    {#each files as col}<span>{'abcdefgh'[col]}</span>{/each}
  </div>
</div>
