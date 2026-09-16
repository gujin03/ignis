// Canonical key form for fs paths: backslashes to forward slashes, no leading or trailing slash.
// Used by caches and registries that key on path.
function normalize(p) {
  return (p || "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
}

export { normalize };
