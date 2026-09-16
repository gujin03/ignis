<script>
  import { createEventDispatcher } from "svelte";
  import VaultRow from "./VaultRow.svelte";
  import Button from "../../components/input/Button.svelte";

  export let vaults = [];
  export let loading = false;

  const dispatch = createEventDispatcher();

  function onLink(e) {
    dispatch("link", e.detail);
  }

  function onCreate() {
    dispatch("create");
  }
</script>

<div class="vault-list">
  <h3 class="vault-list-heading">Your remote vaults</h3>

  <div class="vault-list-items">
    {#if loading}
      <div class="vault-list-spinner-area">
        <div class="vault-list-spinner"></div>
      </div>
    {:else if vaults.length === 0}
      <p class="vault-list-empty">No remote vaults found. Create one to get started.</p>
    {:else}
      {#each vaults as vault (vault.id)}
        <VaultRow {vault} on:link={onLink} />
      {/each}
    {/if}
  </div>

  <div class="vault-list-footer">
    <Button variant="primary" disabled={loading} on:click={onCreate}>
      Create new vault
    </Button>
  </div>
</div>

<style>
  .vault-list-heading {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-normal);
    margin: 0 0 0.75rem;
  }

  .vault-list-empty {
    color: var(--text-muted);
    font-size: 0.875rem;
    margin: 0;
    padding: 1rem 0;
  }

  .vault-list-items {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 180px;
    margin-bottom: 1rem;
  }

  .vault-list-spinner-area {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 180px;
  }

  .vault-list-spinner {
    width: 24px;
    height: 24px;
    border: 2px solid var(--background-modifier-border);
    border-top-color: var(--text-muted);
    border-radius: 50%;
    animation: ignis-vault-spin 0.8s linear infinite;
  }

  @keyframes ignis-vault-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .vault-list-footer {
    display: flex;
    justify-content: flex-end;
  }
</style>
