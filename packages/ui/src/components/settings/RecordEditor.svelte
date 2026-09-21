<script>
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { Plus, Trash2, X } from "lucide-svelte";

  export let record = null;

  const dispatch = createEventDispatcher();

  let backdropEl;
  let name = record ? record.name : "";
  let patterns = record ? [...record.patterns] : [""];

  $: nonEmpty = patterns
    .map((pattern) => pattern.trim())
    .filter((pattern) => pattern.length > 0);
  $: canSave = nonEmpty.length > 0;
  $: excludeCount = nonEmpty.filter((pattern) => !pattern.startsWith("!")).length;
  $: reincludeCount = nonEmpty.filter((pattern) => pattern.startsWith("!")).length;
  $: summary = buildSummary(nonEmpty.length, excludeCount, reincludeCount);

  function buildSummary(total, excludes, reincludes) {
    if (total === 0) {
      return "No patterns yet";
    }

    let text = `${excludes} rule${excludes === 1 ? "" : "s"}`;

    if (reincludes > 0) {
      text += ` · ${reincludes} re-include${reincludes === 1 ? "" : "s"}`;
    }

    return text;
  }

  function isReInclude(pattern) {
    return pattern.trim().startsWith("!");
  }

  function placeholder(index) {
    if (index === 0) {
      return ".obsidian/plugins/my-plugin/*";
    }

    if (index === 1) {
      return "!.obsidian/plugins/my-plugin/main.js";
    }

    return "pattern";
  }

  function addRule() {
    patterns = [...patterns, ""];
  }

  function removeRule(index) {
    patterns = patterns.filter((_, i) => i !== index);
  }

  function save() {
    if (!canSave) {
      return;
    }

    dispatch("save", { name: name.trim(), patterns: nonEmpty });
  }

  function cancel() {
    dispatch("cancel");
  }

  function onBackdrop(e) {
    if (e.target === backdropEl) {
      cancel();
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      cancel();
    }
  }

  onMount(() => {
    window.addEventListener("keydown", onKeydown, true);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onKeydown, true);
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" bind:this={backdropEl} on:click={onBackdrop}>
  <div class="panel">
    <div class="header">
      <span class="title">{record ? "Edit rule set" : "New rule set"}</span>
      <button class="close" type="button" title="Close" on:click={cancel}>
        <X size={16} />
      </button>
    </div>

    <div class="body">
      <div class="field">
        <span class="label">Name <span class="optional">optional</span></span>
        <input class="text-input" type="text" bind:value={name} />
      </div>

      <div class="patterns-head">
        <span class="label">Patterns</span>
        <span class="legend">
          <span class="swatch"></span>
          <span class="legend-label">! re-includes an excluded path</span>
        </span>
      </div>

      <div class="patterns-scroll">
        {#each patterns as pattern, index (index)}
          <div class="rule-row">
            <input
              class="text-input mono"
              class:re={isReInclude(patterns[index])}
              type="text"
              bind:value={patterns[index]}
              placeholder={placeholder(index)}
            />

            <button
              class="trash"
              type="button"
              title="Remove pattern"
              disabled={patterns.length === 1}
              on:click={() => removeRule(index)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        {/each}

        <button class="add-rule" type="button" on:click={addRule}>
          <span class="plus">+</span> Add pattern
        </button>
      </div>
    </div>

    <div class="footer">
      <span class="summary">{summary}</span>

      <div class="footer-actions">
        <button class="cancel-btn" type="button" on:click={cancel}>
          Cancel
        </button>
        <button
          class="save-btn"
          type="button"
          disabled={!canSave}
          on:click={save}
        >
          Save
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 99999;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-interface, sans-serif);
  }

  .panel {
    width: 100%;
    max-width: 440px;
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    box-shadow: 0 20px 56px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }

  /* override obsidian button/input heights */
  button {
    height: auto;
  }

  input {
    height: auto;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-normal);
  }

  .close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 6px;
  }

  .close:hover {
    background: var(--background-modifier-hover);
  }

  .body {
    display: flex;
    flex-direction: column;
    padding: 12px 16px 14px 16px;
    min-height: 0;
  }

  .label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .optional {
    font-weight: 400;
    letter-spacing: 0;
    text-transform: none;
  }

  .field {
    display: flex;
    flex-direction: column;
  }

  .field .label {
    margin-bottom: 5px;
  }

  .text-input {
    width: 100%;
    padding: 6px 9px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-modifier-form-field);
    color: var(--text-normal);
    font-size: 12.5px;
    outline: none;
    box-shadow: none;
    box-sizing: border-box;
  }

  .text-input:focus {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-form-field);
  }

  .patterns-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 14px 0 5px 0;
  }

  .legend {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .swatch {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    background: var(--text-warning);
    flex-shrink: 0;
  }

  .legend-label {
    font-size: 10.5px;
    color: var(--text-warning);
  }

  .patterns-scroll {
    flex: 1 1 auto;
    min-height: 96px;
    max-height: 240px;
    overflow-y: auto;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .rule-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .rule-row .text-input {
    padding: 5px 9px;
    background: var(--background-modifier-form-field);
    border: 1px solid var(--background-modifier-border);
    font-size: 11.5px;
  }

  .rule-row .text-input:focus {
    border-color: var(--interactive-accent);
    background: var(--background-modifier-form-field);
  }

  .mono {
    font-family: var(--font-monospace, monospace);
  }

  .mono.re {
    color: var(--text-warning);
  }

  .trash {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-faint);
    cursor: pointer;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .trash:hover:not(:disabled) {
    color: var(--text-error);
  }

  .trash:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .add-rule {
    align-self: flex-start;
    padding: 2px 6px 2px 4px;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--interactive-accent);
    font-size: 11.5px;
    font-weight: 500;
    cursor: pointer;
    border-radius: 6px;
  }

  .add-rule:hover {
    background: var(--background-modifier-hover);
  }

  .plus {
    font-size: 13px;
  }

  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 10px 16px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary-alt);
  }

  .summary {
    font-size: 11px;
    color: var(--text-muted);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .footer-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .cancel-btn {
    padding: 6px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: transparent;
    color: var(--text-muted);
    font-size: 12.5px;
    cursor: pointer;
    box-shadow: none;
  }

  .cancel-btn:hover {
    background: var(--background-modifier-hover);
  }

  .save-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 6px;
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: none;
  }

  .save-btn:hover:not(:disabled) {
    background: var(--interactive-accent-hover);
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
