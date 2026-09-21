<script>
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { X } from "lucide-svelte";
  import RuleSetCard from "./RuleSetCard.svelte";
  import SuggestionRow from "./SuggestionRow.svelte";
  import RecordEditor from "./RecordEditor.svelte";
  import LegendSwatch from "./LegendSwatch.svelte";
  import { pendingSuggestions } from "./ignore-suggestions.js";

  export let rules = [];
  export let suggestions = [];

  const dispatch = createEventDispatcher();

  let items = rules.map((rule) => ({
    name: rule.name,
    patterns: [...rule.patterns],
  }));

  let backdropEl;

  let childModal = null;

  $: pending = pendingSuggestions(suggestions, items);

  function onBackdrop(e) {
    if (e.target === backdropEl && !childModal) {
      dispatch("close");
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape" && !childModal) {
      dispatch("close");
    }
  }

  function commit(value) {
    items = value;
    dispatch("change", items);
  }

  function openEditor(record, index) {
    closeEditor();

    childModal = new RecordEditor({
      // mount to settings modal to avoid focus issues
      target: document.querySelector(".modal-container") || document.body,
      props: { record },
    });

    childModal.$on("save", (event) => {
      const value = event.detail;

      if (index < 0) {
        commit([...items, value]);
      } else {
        commit(items.map((item, i) => (i === index ? value : item)));
      }

      closeEditor();
    });

    childModal.$on("cancel", closeEditor);
  }

  function closeEditor() {
    if (childModal) {
      childModal.$destroy();
      childModal = null;
    }
  }

  function removeRecord(index) {
    commit(items.filter((_, i) => i !== index));
  }

  function addSuggestion(row) {
    commit([...items, { name: row.name, patterns: [...row.values] }]);
  }

  onMount(() => {
    window.addEventListener("keydown", onKeydown, true);
  });

  onDestroy(() => {
    window.removeEventListener("keydown", onKeydown, true);
    closeEditor();
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="backdrop" bind:this={backdropEl} on:click={onBackdrop}>
  <div class="editor">
    <div class="header">
      <div class="head-left">
        <span class="title">Ignored paths</span>

        <div class="legend-row">
          <LegendSwatch color="var(--text-faint)" label="excluded" />
          <LegendSwatch color="var(--text-warning)" label="re-included" />
        </div>
      </div>

      <button
        class="close"
        type="button"
        title="Close"
        on:click={() => dispatch("close")}
      >
        <X size={16} />
      </button>
    </div>

    <div class="body">
      <div class="section-head">
        <span class="heading">Rule sets</span>

        <button
          class="add-link"
          type="button"
          on:click={() => openEditor(null, -1)}
        >
          <span class="plus">+</span> Add rule set
        </button>
      </div>

      <div class="scroll rules-scroll">
        {#if items.length === 0}
          <div class="empty">No rule sets yet.</div>
        {:else}
          {#each items as item, index (index)}
            <RuleSetCard
              record={item}
              on:edit={() => openEditor(item, index)}
              on:remove={() => removeRecord(index)}
            />
          {/each}
        {/if}
      </div>

      <div class="section-head suggestions-head">
        <span class="heading">Suggestions</span>
      </div>

      <p class="section-desc">
        Folders that may be problematic for the file watcher.
      </p>

      {#if pending.length > 0}
        <div class="scroll suggestions-scroll">
          {#each pending as row (row.name + "\n" + row.values.join("\n"))}
            <SuggestionRow {row} on:add={() => addSuggestion(row)} />
          {/each}
        </div>
      {:else}
        <div class="suggestions-empty">No problem folders found.</div>
      {/if}
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
    padding: 24px;
    box-sizing: border-box;
  }

  .editor {
    width: 100%;
    max-width: 580px;
    height: min(520px, calc(100vh - 48px));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    box-shadow: 0 20px 56px rgba(0, 0, 0, 0.55);
    color: var(--text-normal);
    font-family: var(--font-interface, sans-serif);
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 14px 16px 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-normal);
  }

  .legend-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 5px;
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
    flex-shrink: 0;
  }

  .close:hover {
    background: var(--background-modifier-hover);
  }

  .body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 12px 16px 14px 16px;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .suggestions-head {
    margin: 16px 0 4px 0;
  }

  .section-desc {
    margin: 0 0 8px 0;
    font-size: 11px;
    line-height: 1.4;
    color: var(--text-muted);
  }

  .heading {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .add-link {
    padding: 2px 6px 2px 4px;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--interactive-accent);
    font-size: 11.5px;
    font-weight: 500;
    height: auto;
    line-height: 1.4;
    cursor: pointer;
    border-radius: 6px;
  }

  .add-link:hover {
    background: var(--background-modifier-hover);
    color: var(--interactive-accent-hover);
  }

  .plus {
    font-size: 13px;
  }

  .scroll {
    flex: 1 1 0;
    min-height: 120px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .rules-scroll {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .suggestions-empty {
    flex: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    padding: 14px 12px;
    color: var(--text-faint);
    font-size: 11px;
    text-align: center;
  }

  .suggestions-scroll {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
  }

  .empty {
    color: var(--text-faint);
    font-size: 12px;
    padding: 4px 2px;
  }
</style>
