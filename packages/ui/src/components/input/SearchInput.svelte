<script>
  import { createEventDispatcher } from "svelte";
  import { Search } from "lucide-svelte";

  export let value = "";
  export let placeholder = "Search";

  const dispatch = createEventDispatcher();

  function onInput(e) {
    dispatch("input", e.target.value);
  }
</script>

<div class="search-input">
  <span class="search-icon">
    <Search size="0.875rem" />
  </span>
  <input type="text" {placeholder} {value} on:input={onInput} />
</div>

<style>
  .search-input {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 0.625rem;
    color: var(--text-muted);
    pointer-events: none;
    margin-top: 0.2rem;
  }

  input {
    width: 100%;
    padding: 0.375rem 0.625rem 0.375rem 1.875rem;
    border-radius: 0.375rem;
    border: 1px solid var(--background-primary);
    background: var(--background-primary);
    color: var(--text-normal);
    font-size: 0.8125rem;
    outline: none;
    box-shadow: none;
  }

  input:hover {
    background: var(--background-modifier-form-field);
  }

  input::placeholder {
    color: var(--text-muted);
  }

  input:focus {
    border-color: var(--interactive-accent);
  }

  input:focus:hover {
    background: var(--background-primary);
  }
</style>
