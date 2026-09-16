<script>
  import { createEventDispatcher } from "svelte";
  import Button from "../../components/input/Button.svelte";

  const dispatch = createEventDispatcher();

  let name = "";
  let region = "";
  let encryption = "e2ee";
  let password = "";
  let creating = false;
  let error = "";

  async function onSubmit() {
    error = "";

    if (!name.trim()) {
      error = "Vault name is required";
      return;
    }

    if (encryption === "e2ee" && !password) {
      error = "Encryption password is required for end-to-end encryption";
      return;
    }

    creating = true;

    try {
      const res = await fetch("/api/ext/headless-sync/create-remote-vault", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          encryption,
          password: password || undefined,
          region: region || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed: ${res.status}`);
      }

      dispatch("created");
    } catch (e) {
      error = e.message;
      creating = false;
    }
  }

  function onBack() {
    dispatch("back");
  }
</script>

<div class="create-form">
  <div class="form-row">
    <div class="form-label">
      <div class="form-name">Vault name</div>
      <div class="form-desc">Helps you remember what this vault is for</div>
    </div>
    <input type="text" placeholder="My awesome vault" bind:value={name} />
  </div>

  <div class="form-row">
    <div class="form-label">
      <div class="form-name">Region</div>
      <div class="form-desc">Select the server region closest to you</div>
    </div>
    <select bind:value={region}>
      <option value="">Automatic</option>
      <option value="europe">Europe</option>
      <option value="north-america">North America</option>
      <option value="asia">Asia</option>
      <option value="oceania">Oceania</option>
    </select>
  </div>

  <div class="form-row">
    <div class="form-label">
      <div class="form-name">Encryption</div>
      <div class="form-desc">
        End-to-end encryption requires a password you must remember.
        <span class="form-warning">This cannot be changed later.</span>
      </div>
    </div>
    <select bind:value={encryption}>
      <option value="e2ee">End-to-end encryption</option>
      <option value="standard">Standard encryption</option>
    </select>
  </div>

  {#if encryption === "e2ee"}
    <div class="form-row">
      <div class="form-label">
        <div class="form-name">Encryption password</div>
        <div class="form-desc">
          <span class="form-warning">If you forget this password, any remote data will remain unusable forever.</span>
          This does not affect your local data.
        </div>
      </div>
      <input type="password" placeholder="Your password" bind:value={password} />
    </div>
  {/if}

  {#if error}
    <div class="form-error">{error}</div>
  {/if}

  <div class="form-footer">
    <Button variant="secondary" on:click={onBack}>Back</Button>
    <Button variant="primary" disabled={creating} on:click={onSubmit}>
      {creating ? "Creating..." : "Create"}
    </Button>
  </div>
</div>

<style>
  .form-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 0.75rem 0;
  }

  .form-row + .form-row {
    border-top: 1px solid var(--background-modifier-border);
  }

  .form-label {
    flex: 1;
    min-width: 0;
    margin-right: 1rem;
  }

  .form-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--text-normal);
  }

  .form-desc {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
    line-height: 1.4;
  }

  .form-warning {
    color: var(--text-error);
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
    margin-top: 0.125rem;
  }

  input:focus, select:focus {
    outline: none;
    border-color: var(--interactive-accent);
  }

  .form-error {
    color: var(--text-error);
    font-size: 0.8125rem;
    padding: 0.5rem 0;
  }

  .form-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--background-modifier-border);
  }
</style>
