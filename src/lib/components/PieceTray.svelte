<script lang="ts">
  import type { PieceType } from '../types';
  import { GLYPH, PIECE_NAME, PIECE_TYPES } from '../ui';

  interface Props {
    costs: Record<PieceType, number>;
    selected: PieceType | null;
    disabled: boolean;
    enemy: boolean;
    onselect: (type: PieceType) => void;
    ondrag: (event: PointerEvent, type: PieceType) => void;
  }

  let { costs, selected, disabled, enemy, onselect, ondrag }: Props = $props();
</script>

<div class:enemy-tray={enemy} class="tray" role="group" aria-label={enemy ? 'Enemy pieces' : 'Pieces for hire'}>
  {#each PIECE_TYPES as type (type)}
    <button
      class="slot"
      type="button"
      disabled={disabled}
      aria-pressed={selected === type}
      onpointerdown={(event) => ondrag(event, type)}
      onclick={() => onselect(type)}
    >
      <span class="g">{GLYPH[type]}</span>
      <span class="c">{PIECE_NAME[type]} · {costs[type]}</span>
    </button>
  {/each}
</div>
