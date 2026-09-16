<script>
  import { createEventDispatcher } from "svelte";

  export let variant = "primary";
  export let disabled = false;
  export let title = "";
  export let type = "button";

  const dispatch = createEventDispatcher();

  function onClick(e) {
    if (!disabled) {
      dispatch("click", e);
    }
  }
</script>

<button class="btn {variant}" {type} {disabled} {title} on:click={onClick}>
  {#if $$slots.icon}
    <span class="btn-icon">
      <slot name="icon" />
    </span>
  {/if}
  <slot />
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    border-radius: 0.375rem;
    box-shadow: none;
    transition: background 0.1s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-icon {
    display: flex;
    align-items: center;
  }

  .primary {
    padding: 0.375rem 1rem;
    border: none;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }

  .primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .secondary {
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--background-modifier-border);
    background: none;
    color: var(--text-muted);
  }

  .secondary:hover:not(:disabled) {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .ghost {
    padding: 0.375rem 0.5rem;
    border: none;
    background: none;
    color: var(--interactive-accent);
  }

  .ghost:hover:not(:disabled) {
    background: var(--background-modifier-hover);
  }

  .danger {
    padding: 0.375rem 1rem;
    border: none;
    background: var(--text-error, #e93147);
    color: #fff;
  }

  .danger:hover:not(:disabled) {
    filter: brightness(1.1);
  }
</style>
