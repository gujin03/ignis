<script>
  import { createEventDispatcher, onMount, onDestroy, tick } from "svelte";
  import { Pencil, Trash2 } from "lucide-svelte";

  export let record;

  const dispatch = createEventDispatcher();

  const CHIP_GAP = 5; // get from .chips css, used for computed fit.

  const MAX_CHARS = 20;

  let areaEl;
  let chipEls = [];
  let overflowEl;
  let observer;

  let expanded = false;
  let visibleCount = record.patterns.length;

  $: patterns = record.patterns;
  $: visiblePatterns = patterns.slice(0, visibleCount);
  $: hiddenCount = patterns.length - visibleCount;

  $: if (patterns && areaEl) {
    remeasure();
  }

  function isReInclude(pattern) {
    return pattern.startsWith("!");
  }

  // truncate start to show only meaningful pattern
  function truncateStart(pattern) {
    return pattern.length > MAX_CHARS
      ? "…" + pattern.slice(-(MAX_CHARS - 1))
      : pattern;
  }

  async function remeasure() {
    await tick();
    measure();
  }

  function measure() {
    if (!areaEl) {
      return;
    }

    const els = chipEls.slice(0, patterns.length).filter(Boolean);

    if (els.length === 0) {
      return;
    }

    const available = areaEl.clientWidth;
    const widths = els.map((el) => el.offsetWidth);
    const total =
      widths.reduce((sum, w) => sum + w, 0) + CHIP_GAP * (widths.length - 1);

    if (total <= available) {
      setVisible(widths.length);
      return;
    }

    const overflowWidth = overflowEl ? overflowEl.offsetWidth : 0;
    let used = 0;
    let count = 0;

    for (let i = 0; i < widths.length; i++) {
      const next = used + (count === 0 ? 0 : CHIP_GAP) + widths[i];

      if (next + CHIP_GAP + overflowWidth <= available) {
        used = next;
        count++;
      } else {
        break;
      }
    }

    setVisible(Math.max(1, count));
  }

  function setVisible(n) {
    if (n !== visibleCount) {
      visibleCount = n;
    }
  }

  function expand() {
    expanded = true;
  }

  function collapse() {
    expanded = false;
  }

  onMount(() => {
    observer = new ResizeObserver(() => measure());
    observer.observe(areaEl);
  });

  onDestroy(() => {
    if (observer) {
      observer.disconnect();
    }
  });
</script>

<div class="rule-set-card">
  <div class="head">
    <span class="name">{record.name || "Unnamed rule set"}</span>
    <span class="meta">
      {patterns.length} pattern{patterns.length === 1 ? "" : "s"}
    </span>

    <div class="actions">
      <button
        class="icon-btn edit"
        type="button"
        title="Edit rule set"
        on:click={() => dispatch("edit")}
      >
        <Pencil size={14} />
      </button>

      <button
        class="icon-btn del"
        type="button"
        title="Remove rule set"
        on:click={() => dispatch("remove")}
      >
        <Trash2 size={14} />
      </button>
    </div>
  </div>

  <div class="chip-outer">
    <div class="chip-area" bind:this={areaEl}>
      {#if expanded}
        <div class="chips wrap">
          {#each patterns as pattern}
            <span class="chip" class:re={isReInclude(pattern)} title={pattern}
              >{truncateStart(pattern)}</span
            >
          {/each}

          <button class="chip more" type="button" on:click={collapse}>
            Show less
          </button>
        </div>
      {:else}
        <div class="chips nowrap">
          {#each visiblePatterns as pattern}
            <span class="chip" class:re={isReInclude(pattern)} title={pattern}
              >{truncateStart(pattern)}</span
            >
          {/each}

          {#if hiddenCount > 0}
            <button class="chip more" type="button" on:click={expand}>
              +{hiddenCount}
            </button>
          {/if}
        </div>
      {/if}

      <div class="chips measure" aria-hidden="true">
        {#each patterns as pattern, i}
          <span class="chip" bind:this={chipEls[i]}>{truncateStart(pattern)}</span>
        {/each}
        <button class="chip more" type="button" bind:this={overflowEl}>
          +{patterns.length}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .rule-set-card {
    flex: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: 9px;
    background: var(--background-secondary);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px 0 12px;
  }

  .name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .meta {
    font-size: 11px;
    color: var(--text-muted);
  }

  .actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-faint);
    cursor: pointer;
    border-radius: 6px;
  }

  .edit:hover {
    color: var(--text-normal);
  }

  .del:hover {
    color: var(--text-error);
  }

  .chip-outer {
    padding: 6px 10px 9px 12px;
  }

  .chip-area {
    position: relative;
  }

  .chips {
    display: flex;
    gap: 5px;
  }

  .nowrap {
    flex-wrap: nowrap;
    overflow: hidden;
  }

  .wrap {
    flex-wrap: wrap;
  }

  .measure {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    white-space: nowrap;
    flex-wrap: nowrap;
    pointer-events: none;
  }

  .chip {
    flex-shrink: 0;
    font-family: var(--font-monospace, monospace);
    font-size: 11px;
    line-height: 1.5;
    padding: 1px 6px;
    border-radius: 5px;
    background: var(--background-modifier-hover);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    white-space: nowrap;
  }

  .chip.re {
    color: var(--text-warning);
  }

  .more {
    height: auto;
    box-shadow: none;
    cursor: pointer;
    color: var(--text-muted);
  }
</style>
