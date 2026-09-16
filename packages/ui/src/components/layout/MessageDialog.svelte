<script>
  import { createEventDispatcher } from "svelte";
  import Modal from "./Modal.svelte";
  import Button from "../input/Button.svelte";
  import { CircleAlert } from "lucide-svelte";

  export let title = "Message";
  export let message = "";
  export let width = "500px";

  const dispatch = createEventDispatcher();

  let modalRef;

  function onConfirm() {
    modalRef.dismiss();
    dispatch("confirm");
  }

  function onEscape() {
    onConfirm();
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
    <CircleAlert size="1.25rem" />
  </svelte:fragment>

  <div class="message-body">
    <p class="message-text">{message}</p>
  </div>

  <svelte:fragment slot="footer">
    <div class="message-footer">
      <Button variant="primary" on:click={onConfirm}>OK</Button>
    </div>
  </svelte:fragment>
</Modal>

<style>
  .message-body {
    padding: 1.25rem 1.5rem;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .message-text {
    margin: 0;
    font-size: 0.9375rem;
    color: var(--text-normal);
    line-height: 1.5;
    white-space: pre-wrap;
  }

  .message-footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
