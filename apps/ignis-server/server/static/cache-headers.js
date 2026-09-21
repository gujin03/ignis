// Cache policy for static assets.
// Versioned requests (carrying a ?v cache-buster) are immutable for a year; unversioned requests keep a short cache and revalidate via ETag.

const IMMUTABLE = "public, max-age=31536000, immutable";
const SHORT = "public, max-age=300";

// Asset types whose caching we manage; everything else keeps express.static defaults.
const ASSET_EXT = /\.(?:js|css|woff2?|ttf|otf|wasm|map)$/i;

// Append a version query so an upgrade busts the immutable cache.
// Returns the src unchanged when there is no version, so nothing is pinned against a bogus value.
function versionedSrc(src, version) {
  if (!version) {
    return src;
  }

  return src + (src.includes("?") ? "&" : "?") + "v=" + version;
}

// Cache-Control for a static asset request, or null to leave it to express.static.
// Only versioned URLs carry ?v, and they are version-busted on upgrade, so immutable is safe.
function cacheControlFor(reqPath, hasVersion) {
  if (!ASSET_EXT.test(reqPath)) {
    return null;
  }

  return hasVersion ? IMMUTABLE : SHORT;
}

module.exports = { versionedSrc, cacheControlFor };
