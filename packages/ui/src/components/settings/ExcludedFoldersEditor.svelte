<script>
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import { ChevronDown, ChevronRight, Trash2, X } from "lucide-svelte";
  import {
    buildTree,
    isCovered,
    withExcluded,
    withoutExcluded,
    notInVault,
    visiblePaths,
  } from "./excluded-folders.js";

  export let folders = [];
  export let excluded = [];

  const dispatch = createEventDispatcher();

  let current = [...excluded];
  let backdropEl;
  let filter = "";
  let draft = "";
  let openPaths = new Set();

  $: tree = buildTree(folders);
  $: isFiltering = filter.trim() !== "";
  $: visible = visiblePaths(folders, filter);
  $: rows = flattenTree(tree, visible, openPaths, isFiltering);
  $: extras = notInVault(current, folders);
  $: summary = describeCount(current.length);

  function describeCount(count) {
    if (count === 0) {
      return "No folders excluded";
    }

    return `${count} folder${count === 1 ? "" : "s"} excluded`;
  }

  function flattenTree(nodes, visiblePathSet, expandedPaths, forceOpen) {
    const rowList = [];

    function walk(list, depth) {
      for (const node of list) {
        if (!visiblePathSet.has(node.path)) {
          continue;
        }

        const children = node.children.filter((child) =>
          visiblePathSet.has(child.path),
        );
        const open = forceOpen || expandedPaths.has(node.path);

        rowList.push({
          path: node.path,
          name: node.name,
          depth,
          hasChildren: children.length > 0,
          open,
        });

        if (open) {
          walk(children, depth + 1);
        }
      }
    }

    walk(nodes, 0);

    return rowList;
  }

  function isChecked(path, paths) {
    return paths.includes(path) || isCovered(path, paths);
  }

  function normalize(value) {
    return value.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  }

  function commit(value) {
    current = value;
    dispatch("change", current);
  }

  function toggleOpen(path) {
    const paths = new Set(openPaths);

    if (paths.has(path)) {
      paths.delete(path);
    } else {
      paths.add(path);
    }

    openPaths = paths;
  }

  function toggleExcluded(path, checked) {
    commit(
      checked ? withExcluded(current, path) : withoutExcluded(current, path),
    );
  }

  function addDraft() {
    const path = normalize(draft);

    if (path === "" || current.includes(path) || isCovered(path, current)) {
      return;
    }

    commit(withExcluded(current, path));
    draft = "";
  }

  function onDraftKeydown(e) {
    if (e.key === "Enter") {
      addDraft();
    }
  }

  function onBackdrop(e) {
    if (e.target === backdropEl) {
      dispatch("close");
    }
  }

  function onKeydown(e) {
    if (e.key === "Escape") {
      dispatch("close");
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
  <div class="editor">
    <div class="header">
      <div class="head-left">
        <span class="title">Excluded folders</span>
        <span class="count">{summary}</span>
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
      <input
        class="text-input filter"
        type="text"
        placeholder="Filter folders"
        bind:value={filter}
      />

      <div class="scroll tree-scroll">
        {#if rows.length === 0}
          <div class="empty">
            {isFiltering ? "No folders match." : "This vault has no folders."}
          </div>
        {:else}
          {#each rows as row (row.path)}
            <div class="row" style="padding-left: {row.depth * 15}px">
              <span class="chevron-slot">
                {#if row.hasChildren && isFiltering}
                  <span class="chevron static"><ChevronDown size={13} /></span>
                {:else if row.hasChildren}
                  <button
                    class="chevron"
                    type="button"
                    title={row.open ? "Collapse" : "Expand"}
                    on:click={() => toggleOpen(row.path)}
                  >
                    {#if row.open}
                      <ChevronDown size={13} />
                    {:else}
                      <ChevronRight size={13} />
                    {/if}
                  </button>
                {/if}
              </span>

              <label class="check" class:covered={isCovered(row.path, current)}>
                <input
                  type="checkbox"
                  checked={isChecked(row.path, current)}
                  disabled={isCovered(row.path, current)}
                  on:change={(e) =>
                    toggleExcluded(row.path, e.currentTarget.checked)}
                />
                <span class="folder-name" title={row.path}>{row.name}</span>
              </label>
            </div>
          {/each}
        {/if}
      </div>

      <div class="section-head">
        <span class="heading">Not in vault</span>
      </div>

      <div class="extras">
        {#if extras.length === 0}
          <div class="empty">None</div>
        {:else}
          <div class="extras-list">
            {#each extras as path (path)}
              <div class="extra-row">
                <span class="extra-path" title={path}>{path}</span>

                <button
                  class="trash"
                  type="button"
                  title="Remove"
                  on:click={() => commit(withoutExcluded(current, path))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <div class="add-row">
          <input
            class="text-input mono"
            type="text"
            placeholder="folder/subfolder"
            bind:value={draft}
            on:keydown={onDraftKeydown}
          />

          <button
            class="add-btn"
            type="button"
            disabled={normalize(draft) === ""}
            on:click={addDraft}
          >
            Add
          </button>
        </div>
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

  /* override obsidian button/input heights */
  button {
    height: auto;
  }

  input {
    height: auto;
  }

  .header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 14px 16px 12px 16px;
    border-bottom: 1px solid var(--background-modifier-border);
  }

  .head-left {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .title {
    font-size: 15px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: var(--text-normal);
  }

  .count {
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-muted);
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

  .filter {
    flex: none;
    margin-bottom: 8px;
  }

  .mono {
    font-family: var(--font-monospace, monospace);
    font-size: 11.5px;
    padding: 5px 9px;
  }

  .scroll {
    flex: 1 1 0;
    min-height: 120px;
    overflow-y: auto;
    overflow-x: hidden;
  }

  .tree-scroll {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    padding: 6px 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 2px;
    height: 24px;
  }

  .chevron-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    flex-shrink: 0;
  }

  .chevron {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-faint);
    cursor: pointer;
    border-radius: 4px;
  }

  button.chevron:hover {
    color: var(--text-normal);
    background: var(--background-modifier-hover);
  }

  .chevron.static {
    cursor: default;
  }

  .check {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 0 4px;
    cursor: pointer;
  }

  .check input[type="checkbox"] {
    appearance: auto;
    -webkit-appearance: auto;
    width: 13px;
    height: 13px;
    margin: 0;
    padding: 0;
    top: 0;
    flex-shrink: 0;
    accent-color: var(--interactive-accent);
    cursor: pointer;
  }

  .check.covered {
    cursor: default;
    opacity: 0.45;
  }

  .check.covered input[type="checkbox"] {
    cursor: default;
  }

  .folder-name {
    font-size: 12.5px;
    color: var(--text-normal);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 14px 0 6px 0;
  }

  .heading {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .extras {
    flex: none;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-primary);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .extras-list {
    max-height: 84px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .extra-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .extra-path {
    flex: 1 1 auto;
    min-width: 0;
    font-family: var(--font-monospace, monospace);
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .trash {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
    color: var(--text-faint);
    cursor: pointer;
    border-radius: 6px;
    flex-shrink: 0;
  }

  .trash:hover {
    color: var(--text-error);
  }

  .add-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .add-btn {
    flex-shrink: 0;
    padding: 4px 11px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 6px;
    background: var(--background-modifier-hover);
    color: var(--text-muted);
    font-size: 11.5px;
    font-weight: 500;
    line-height: 1.4;
    cursor: pointer;
    box-shadow: none;
  }

  .add-btn:hover:not(:disabled) {
    border-color: var(--interactive-accent);
    color: var(--interactive-accent-hover);
  }

  .add-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .empty {
    color: var(--text-faint);
    font-size: 12px;
    padding: 4px 2px;
  }
</style>
