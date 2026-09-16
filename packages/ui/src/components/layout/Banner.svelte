<script>
  import { createEventDispatcher } from "svelte";
  import { X } from "lucide-svelte";

  export let severity = "info";
  export let dismissible = true;
  export let title = "";
  export let id = undefined;

  const dispatch = createEventDispatcher();

  function dismiss() {
    dispatch("dismiss");
  }
</script>

<div class="banner {severity}" {id} role="alert">
  <div class="banner-body">
    {#if title}
      <strong class="banner-title">{title}</strong>
    {/if}
    <slot />
  </div>

  {#if dismissible}
    <button
      class="banner-close"
      on:click={dismiss}
      aria-label="Dismiss"
      title="Dismiss"
    >
      <X size="1.125rem" />
    </button>
  {/if}
</div>

<style>
  .banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.625rem 1rem;
    font-family: var(
      --font-interface,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif
    );
    font-size: 0.8125rem;
    line-height: 1.45;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.4);

    user-select: text;
    -webkit-user-select: text;
  }

  .banner-body {
    flex: 1;
  }

  .banner-title {
    display: block;
    font-weight: 600;
  }

  .banner-close {
    flex-shrink: 0;
    align-self: flex-start;
    display: flex;
    align-items: center;
    background: none;
    border: none;
    box-shadow: none;
    color: inherit;
    opacity: 0.8;
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
  }

  .banner-close:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.2);
  }

  .error {
    background: #5c1a1a;
    color: #f3d6d6;
    border-bottom: 1px solid #7a2a2a;
  }

  .warning {
    background: #5c4410;
    color: #f3e6c0;
    border-bottom: 1px solid #7a5e1a;
  }

  .info {
    background: #13304d;
    color: #cfe2f3;
    border-bottom: 1px solid #1d4a73;
  }
</style>
