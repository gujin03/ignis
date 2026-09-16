<script>
  import { createEventDispatcher, onMount } from "svelte";
  import Modal from "../components/layout/Modal.svelte";
  import VaultList from "./sync/VaultList.svelte";
  import CreateVaultForm from "./sync/CreateVaultForm.svelte";

  export let vaultId;
  export let onSuccess = null;

  const dispatch = createEventDispatcher();

  let modalRef;
  let view = "list";
  let vaults = [];
  let loading = true;
  let error = "";

  onMount(() => {
    fetchVaults();
  });

  async function fetchVaults() {
    loading = true;
    error = "";

    try {
      const res = await fetch("/api/ext/headless-sync/remote-vaults");

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      const data = await res.json();
      vaults = data.vaults;
    } catch (e) {
      error = e.message;
    }

    loading = false;
  }

  async function onLink(e) {
    const { vault, vaultPassword, deviceName, mode } = e.detail;
    error = "";

    try {
      const res = await fetch("/api/ext/headless-sync/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultId,
          remoteVault: vault.id,
          remoteVaultName: vault.name,
          vaultPassword,
          deviceName,
          mode,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      if (onSuccess) {
        onSuccess();
      }

      modalRef.dismiss();
    } catch (e) {
      error = e.message;
    }
  }

  function onCreated() {
    view = "list";
    fetchVaults();
  }

  function onClose() {
    dispatch("close");
  }
</script>

<Modal
  title={view === "list" ? "Set up Headless Sync" : "Create new remote vault"}
  width="550px"
  bind:this={modalRef}
  on:close={onClose}
  on:escape={onClose}
>
  <div class="sync-setup-body">
    {#if view === "list"}
      <p class="sync-setup-desc">
        Link this vault to an Obsidian Sync remote vault for server-side synchronization.
      </p>

      {#if error}
        <div class="sync-setup-error">
          <p>Failed to load remote vaults: {error}</p>
          <button class="retry-btn" on:click={fetchVaults}>Retry</button>
        </div>
      {:else}
        <VaultList {vaults} {loading} on:link={onLink} on:create={() => (view = "create")} />
      {/if}
    {:else}
      <p class="sync-setup-desc">
        Create a new remote vault on Obsidian Sync.
      </p>

      <CreateVaultForm on:created={onCreated} on:back={() => (view = "list")} />
    {/if}
  </div>
</Modal>

<style>
  .sync-setup-body {
    padding: 1.25rem 1.5rem;
    overflow-y: auto;
  }

  .sync-setup-desc {
    color: var(--text-muted);
    font-size: 0.875rem;
    margin: 0 0 1rem;
    line-height: 1.4;
  }

  .sync-setup-error {
    color: var(--text-error);
    font-size: 0.875rem;
  }

  .sync-setup-error p {
    margin: 0 0 0.5rem;
  }

  .retry-btn {
    font-family: var(--font-interface);
    font-size: 0.8125rem;
    padding: 0.25rem 0.75rem;
    border: 1px solid var(--background-modifier-border);
    border-radius: 0.375rem;
    background: none;
    color: var(--text-muted);
    cursor: pointer;
  }

  .retry-btn:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }
</style>
