<script>
  import { createEventDispatcher } from "svelte";
  import Modal from "./Modal.svelte";
  import Button from "../input/Button.svelte";

  export let title = "";
  export let message = "";
  export let description = "";
  export let confirmText = "Confirm";
  export let confirmVariant = "primary";
  export let width = "500px";

  const dispatch = createEventDispatcher();

  let modalRef;

  function onConfirm() {
    dispatch("confirm");
  }

  function onCancel() {
    modalRef.dismiss();
    dispatch("cancel");
  }

  function onEscape() {
    onCancel();
  }

  export function dismiss() {
    modalRef.dismiss();
  }
</script>

<Modal {title} {width} bind:this={modalRef} on:escape={onEscape} closeOnOverlayClick={false}>
  <svelte:fragment slot="icon">
    <slot name="icon" />
  </svelte:fragment>

  <div class="confirm-body">
    <p class="confirm-message">{message}</p>
    {#if description}
      <p class="confirm-description">{description}</p>
    {/if}
  </div>

  <svelte:fragment slot="footer">
    <div class="confirm-footer">
      <Button variant="secondary" on:click={onCancel}>Cancel</Button>
      <Button variant={confirmVariant} on:click={onConfirm}>
        <svelte:fragment slot="icon">
          <slot name="confirmIcon" />
        </svelte:fragment>
        {confirmText}
      </Button>
    </div>
  </svelte:fragment>
</Modal>

<style>
  .confirm-body {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .confirm-message {
    margin: 0 0 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
  }

  .confirm-description {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-muted);
    line-height: 1.5;
  }

  .confirm-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
