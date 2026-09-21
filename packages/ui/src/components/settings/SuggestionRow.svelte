<script>
  import { createEventDispatcher } from "svelte";

  export let row;

  const dispatch = createEventDispatcher();

  let expanded = false;

  $: ordered = [
    ...row.values.filter((value) => !value.startsWith("!")),
    ...row.values.filter((value) => value.startsWith("!")),
  ];
  $: extraCount = ordered.length - 1;

  function toggle() {
    expanded = !expanded;
  }
</script>

<div class="row">
  <div class="head">
    <span class="name">{row.name}</span>
    <span class="meta">{row.desc}</span>

    <button class="add" type="button" on:click={() => dispatch("add")}>
      + Add
    </button>
  </div>

  <div class="block">
    {#if expanded}
      {#each ordered as line}
        <div class="line" class:re={line.startsWith("!")} title={line}>
          {line}
        </div>
      {/each}

      <button class="toggle" type="button" on:click={toggle}>Show less</button>
    {:else}
      <div
        class="line"
        class:re={ordered[0].startsWith("!")}
        title={ordered[0]}
      >
        {ordered[0]}
      </div>

      {#if extraCount > 0}
        <button class="toggle" type="button" on:click={toggle}>
          +{extraCount} more
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .row {
    padding: 8px 10px 9px 11px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .meta {
    font-size: 11px;
    color: var(--text-faint);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .add {
    margin-left: auto;
    flex-shrink: 0;
    padding: 3px 9px 3px 6px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
    height: auto;
    line-height: 1.4;
    cursor: pointer;
    box-shadow: none;
  }

  .add:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    color: var(--interactive-accent-hover);
  }

  .block {
    margin-top: 5px;
    padding-left: 9px;
    border-left: 2px solid var(--background-modifier-border);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .line {
    font-family: var(--font-monospace, monospace);
    font-size: 11px;
    line-height: 1.5;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text-faint);
  }

  .line.re {
    color: var(--text-warning);
  }

  .toggle {
    margin-top: 2px;
    align-self: flex-start;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-muted);
    font-size: 11px;
    height: auto;
    line-height: 1.5;
    cursor: pointer;
  }
</style>
