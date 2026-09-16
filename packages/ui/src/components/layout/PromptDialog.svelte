<script>
  import { createEventDispatcher } from "svelte";
  import Modal from "./Modal.svelte";
  import Button from "../input/Button.svelte";

  export let title = "";
  export let label = "";
  export let value = "";
  export let placeholder = "";
  export let confirmText = "Confirm";
  export let width = "500px";

  const dispatch = createEventDispatcher();

  let modalRef;

  function onConfirm() {
    dispatch("confirm", value);
  }

  function onCancel() {
    modalRef.dismiss();
    dispatch("cancel");
  }

  function onEscape() {
    onCancel();
  }

  function onKeydown(e) {
    if (e.key === "Enter") {
      onConfirm();
    }
  }

  export function dismiss() {
    modalRef.dismiss();
  }
</script>

<Modal
  {title}
  {width}
  bind:this={modalRef}
  on:escape={onEscape}
  closeOnOverlayClick={false}
>
  <svelte:fragment slot="icon">
    <slot name="icon" />
  </svelte:fragment>

  <div class="prompt-body">
    <label class="prompt-label" for="prompt-input">{label}</label>
    <!-- svelte-ignore a11y-autofocus -->
    <input
      id="prompt-input"
      class="prompt-input"
      type="text"
      {placeholder}
      bind:value
      on:keydown={onKeydown}
      autofocus
    />
  </div>

  <svelte:fragment slot="footer">
    <div class="prompt-footer">
      <Button variant="secondary" on:click={onCancel}>Cancel</Button>
      <Button variant="primary" on:click={onConfirm}>
        <svelte:fragment slot="icon">
          <slot name="confirmIcon" />
        </svelte:fragment>
        {confirmText}
      </Button>
    </div>
  </svelte:fragment>
</Modal>

<style>
  .prompt-body {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .prompt-label {
    display: block;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--text-normal);
    margin-bottom: 0.75rem;
  }

  .prompt-input {
    width: 100%;
    padding: 0.625rem 0.75rem;
    border-radius: 0.375rem;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 1rem;
    outline: none;
    box-shadow: none;
    box-sizing: border-box;
  }

  .prompt-input:focus {
    border-color: var(--interactive-accent);
  }

  .prompt-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
