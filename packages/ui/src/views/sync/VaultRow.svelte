<script>
  import { createEventDispatcher } from "svelte";
  import { Pencil } from "lucide-svelte";
  import Button from "../../components/input/Button.svelte";

  export let vault;
  export let linked = false;

  const dispatch = createEventDispatcher();

  let expanded = false;
  let vaultPassword = "";
  let deviceName = "ignis-headless";
  let mode = "bidirectional";
  let linking = false;

  function toggleExpand() {
    expanded = !expanded;
  }

  async function onLink() {
    linking = true;

    dispatch("link", {
      vault,
      vaultPassword: vaultPassword || undefined,
      deviceName,
      mode,
    });
  }

  export function setLinking(val) {
    linking = val;
  }
</script>

<div class="vault-row" class:expanded>
  <div class="vault-row-main">
    <div class="vault-row-info">
      <div class="vault-row-name">{vault.name}</div>
      <div class="vault-row-region">{vault.region || "Unknown region"}</div>
    </div>
    <div class="vault-row-actions">
      {#if linked}
        <button class="icon-btn" title="Edit sync config" on:click={toggleExpand}>
          <Pencil size="14" />
        </button>
      {:else}
        <Button
          variant="secondary"
          on:click={toggleExpand}
        >
          {expanded ? "Cancel" : "Connect"}
        </Button>
      {/if}
    </div>
  </div>

  {#if expanded}
    <div class="vault-row-options">
      <div class="option-row">
        <div class="option-label">
          <div class="option-name">Vault password</div>
          <div class="option-desc">Required if the vault uses end-to-end encryption</div>
        </div>
        <input
          type="password"
          placeholder="Leave empty if not encrypted"
          bind:value={vaultPassword}
        />
      </div>

      <div class="option-row">
        <div class="option-label">
          <div class="option-name">Device name</div>
          <div class="option-desc">Identifies this server in sync version history</div>
        </div>
        <input type="text" bind:value={deviceName} />
      </div>

      <div class="option-row">
        <div class="option-label">
          <div class="option-name">Sync mode</div>
        </div>
        <select bind:value={mode}>
          <option value="bidirectional">Bidirectional</option>
          <option value="pull-only">Pull only (remote to server)</option>
          <option value="mirror-remote">Mirror remote (exact copy)</option>
        </select>
      </div>

      <div class="option-footer">
        {#if expanded && !linked}
          <Button variant="secondary" on:click={toggleExpand}>Cancel</Button>
        {/if}
        <Button variant="primary" disabled={linking} on:click={onLink}>
          {linking ? "Linking..." : "Link Vault"}
        </Button>
      </div>
    </div>
  {/if}
</div>

<style>
  .vault-row {
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    overflow: hidden;
  }

  .vault-row-main {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
  }

  .vault-row-info {
    flex: 1;
    min-width: 0;
  }

  .vault-row-name {
    font-weight: 600;
    font-size: 0.9375rem;
    color: var(--text-normal);
  }

  .vault-row-region {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 0.125rem;
  }

  .vault-row-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .vault-row-actions :global(.btn.secondary) {
    padding: 4px 12px;
    border-radius: 5px;
    border: none;
    background: var(--interactive-normal);
    color: var(--text-normal);
  }

  .vault-row-actions :global(.btn.secondary:hover:not(:disabled)) {
    background: var(--interactive-hover);
    color: var(--text-normal);
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 0.25rem;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
    box-shadow: none;
  }

  .icon-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .vault-row-options {
    padding: 0.5rem 1rem 1rem;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary-alt);
  }

  .option-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.625rem 0;
  }

  .option-row + .option-row {
    border-top: 1px solid var(--background-modifier-border);
  }

  .option-label {
    flex: 1;
    min-width: 0;
    margin-right: 1rem;
  }

  .option-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .option-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.125rem;
  }

  input, select {
    font-family: var(--font-interface);
    font-size: 0.875rem;
    padding: 0.375rem 0.625rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    background: var(--background-primary);
    color: var(--text-normal);
    min-width: 200px;
  }

  input:focus, select:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .option-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.75rem;
  }
</style>
