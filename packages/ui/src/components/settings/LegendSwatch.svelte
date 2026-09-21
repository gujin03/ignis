<script>
  export let color = "var(--text-faint)";
  export let label = "";
</script>

<span class="legend">
  <span class="swatch" style="background: {color};"></span>
  <span class="label" style="color: {color};">{label}</span>
</span>

<style>
  .legend {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .swatch {
    width: 7px;
    height: 7px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .label {
    font-size: 10.5px;
  }
</style>
