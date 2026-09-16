<script>
  import { createEventDispatcher } from "svelte";
  import { EllipsisVertical } from "lucide-svelte";

  export let open = false;
  export let items = [];

  const dispatch = createEventDispatcher();

  function onTriggerClick(e) {
    e.stopPropagation();
    dispatch("toggle");
  }

  function onItemClick(e, item) {
    e.stopPropagation();
    dispatch("select", item);
  }
</script>

<div class="popover-wrapper">
  <button class="popover-trigger" on:click={onTriggerClick} title="Options">
    <EllipsisVertical size="1rem" />
  </button>

  {#if open}
    <div class="popover-panel">
      {#each items as item}
        <button
          class="popover-item"
          class:danger={item.danger}
          on:click={(e) => onItemClick(e, item)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .popover-wrapper {
    position: relative;
  }

  .popover-trigger {
    background: none;
    border: none;
    box-shadow: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0.375rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .popover-trigger:hover {
    color: var(--text-normal);
  }

  .popover-panel {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 10;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    padding: 0.25rem;
    min-width: 7.5rem;
    box-shadow: 0 0.25rem 1rem rgba(0, 0, 0, 0.4);
  }

  .popover-item {
    display: block;
    width: 100%;
    padding: 0.375rem 0.75rem;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-normal);
    font-size: 0.8125rem;
    cursor: pointer;
    border-radius: 0.25rem;
    text-align: left;
  }

  .popover-item:hover {
    background: var(--background-modifier-hover);
  }

  .popover-item.danger {
    color: var(--text-error, #e93147);
  }

  .popover-item.danger:hover {
    background: rgba(233, 49, 71, 0.1);
  }
</style>
